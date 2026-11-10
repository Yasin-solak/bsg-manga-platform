import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowClockwise, ArrowCounterClockwise, BoundingBox, Minus, Plus, TextAlignCenter,
  TextAlignLeft, TextAlignRight,
} from '@phosphor-icons/react'
import { floodMask } from '@/lib/mangaTypeset/brush'
import { layoutLettering } from '@/lib/translationLettering'
import { cn } from '@/lib/utils'
import { studioAccessToken } from '@/services/studioAuth'
import {
  loadGlossary, loadPageStatuses, rereadItem,
  type TlGlossaryTerm, type TlItem, type TlPageStatus, type TlStroke, type TlStyle,
} from '@/services/translationEditorService'
import { rawPageUrl, TL_SOURCE_LANGUAGES, type TlItemType, type TlPage, type TlProject } from '@/services/translationStudioService'
import { toUserFacingErrorMessage } from '@/services/userFacingError'
import { alignBoxes, type AlignMode } from './arrange'
import { applyStroke, rawContextOf, renderItemsClean } from './cleanRender'
import { EditorCanvas, type BrushOptions, type EditorCanvasHandle, type EditorSelection } from './EditorCanvas'
import {
  clampBox, DEFAULT_FONT_BY_TYPE, FONTS, fontOf, matchesFilter, PAINT_TOOLS, resolveStyle, SELECT_TOOLS, toolById, TOOLS,
  type FontKey, type ItemFilter, type ToolId, type ViewMode,
} from './editorModel'
import { Inspector, ItemList } from './EditorPanels'
import { VersionsMenu } from './VersionsMenu'
import { AlignBar, BrushBar, MiniStepper, PageStrip, SelectionBar } from './EditorBars'
import { ToolIcon } from './ToolIcon'
import { FULL_STUDIO_ACCESS, toolAllowed, type StudioAccess } from '../studioAccess'
import { useEditorPage, type SaveState } from './useEditorPage'
import { useTeamResources } from './useTeamResources'
import { PresenceBar } from './PresenceBar'
import { usePagePresence } from './usePagePresence'
import { useAuth } from '@/contexts/AuthContext'
import { txa } from '@/i18n/activeLocale'

const LANGUAGE = 'tr'

export function EditorScreen({ project, pages, pageIndex, onPageChange, onToast, onSaveState, access = FULL_STUDIO_ACCESS }: {
  project: TlProject
  pages: TlPage[]
  pageIndex: number
  onPageChange: (index: number) => void
  onToast: (message: string) => void
  onSaveState: (state: SaveState) => void
  /** Roles and Permissions: unauthorized tools hide, fields lock. */
  access?: StudioAccess
}) {
  const readyPages = useMemo(() => pages.filter((page) => page.rawStatus === 'ready' && page.width && page.height), [pages])
  const page = readyPages[Math.min(pageIndex, readyPages.length - 1)] ?? null
  const width = page?.width ?? 1
  const height = page?.height ?? 1

  const editor = useEditorPage(page?.id ?? null, LANGUAGE, onToast)
  const { items, strokes } = editor
  useEffect(() => { onSaveState(editor.saveState) }, [editor.saveState, onSaveState])

  const [tool, setTool] = useState<ToolId>('sec')
  const tools = useMemo(() => TOOLS.filter((entry) => entry === 'sep' || toolAllowed(entry.id, access)), [access])
  const [mode, setMode] = useState<ViewMode>('ceviri')
  const [showBoxes, setShowBoxes] = useState(true)
  const [zoom, setZoom] = useState(1)
  const [filter, setFilter] = useState<ItemFilter>('hepsi')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // Coklu secim: birincil oge (Inspector'da gorunen) selectedId; grup birincili icermiyorsa gecersizdir.
  const [groupIds, setGroupIds] = useState<string[]>([])
  // Layers (per session, editor view only): hidden text and locked items.
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => new Set())
  const [lockedIds, setLockedIds] = useState<Set<string>>(() => new Set())
  const toggleIn = (set: Set<string>, id: string) => { const next = new Set(set); if (!next.delete(id)) next.add(id); return next }
  // Copied items persist across pages (Ctrl+C / Ctrl+V).
  const clipboardRef = useRef<{ pageId: string, items: TlItem[], pastes: number } | null>(null)
  const [brush, setBrushState] = useState<BrushOptions>({ size: 18, color: '#ffffff', opacity: 1, hardness: 1, pressure: true })
  const setBrush = useCallback((patch: Partial<BrushOptions>) => setBrushState((current) => ({ ...current, ...patch })), [])
  const [recentColors, setRecentColors] = useState<string[]>([])
  const [selection, setSelection] = useState<EditorSelection | null>(null)
  const [wandTolerance, setWandTolerance] = useState(32)
  const [newFont, setNewFont] = useState<FontKey>('diyalog')
  const [rereading, setRereading] = useState(false)
  const [cloneSource, setCloneSource] = useState<{ x: number, y: number } | null>(null)
  const [glossary, setGlossary] = useState<TlGlossaryTerm[]>([])
  const [statuses, setStatuses] = useState<Record<string, TlPageStatus>>({})
  const canvasRef = useRef<EditorCanvasHandle>(null)

  // Raw image (private R2, authorized fetch) and clean view
  const [rawBitmap, setRawBitmap] = useState<ImageBitmap | null>(null)
  const [rawUrl, setRawUrl] = useState<string | null>(null)
  const [cleaning, setCleaning] = useState(false)
  const [cleanVersion, setCleanVersion] = useState(0)
  /*
   * The clean view is a two-layer cache: automatic area cleaning recalculates only when area geometry
   * changes; strokes apply on top. When a new stroke is added only that stroke applies to its
   * own region (each brush stroke used to reclean the whole page in ~1.9 s). The result
   * shows as a canvas without converting to PNG.
   */
  const itemsCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const strokedRef = useRef<{ canvas: HTMLCanvasElement, applied: TlStroke[] } | null>(null)
  const rawContextRef = useRef<CanvasRenderingContext2D | null>(null)
  const strokesLatest = useRef(strokes)
  strokesLatest.current = strokes

  useEffect(() => {
    if (!page) return undefined
    const controller = new AbortController()
    let objectUrl: string | null = null
    setRawBitmap(null)
    setRawUrl(null)
    itemsCanvasRef.current = null
    strokedRef.current = null
    rawContextRef.current = null
    setCleanVersion((value) => value + 1)
    void (async () => {
      try {
        const token = await studioAccessToken().catch(() => null)
        const response = await fetch(rawPageUrl(page.id), { headers: { Authorization: `Bearer ${token ?? ''}` }, signal: controller.signal })
        if (!response.ok) throw new Error(txa('Sayfa görseli yüklenemedi.'))
        const blob = await response.blob()
        const bitmap = await createImageBitmap(blob)
        if (controller.signal.aborted) { bitmap.close(); return }
        objectUrl = URL.createObjectURL(blob)
        setRawUrl(objectUrl)
        setRawBitmap(bitmap)
      } catch (error) {
        if (!controller.signal.aborted) onToast(toUserFacingErrorMessage(error, txa('Sayfa görseli yüklenemedi.')))
      }
    })()
    return () => {
      controller.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [onToast, page])

  const applyStrokesTo = useCallback((next: TlStroke[]) => {
    const base = itemsCanvasRef.current
    if (!base) return
    const current = strokedRef.current
    const extends_ = current && current.applied.length <= next.length && current.applied.every((stroke, index) => stroke === next[index])
    let canvas = current?.canvas ?? null
    let from = 0
    if (current && extends_) {
      from = current.applied.length
    } else {
      canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      canvas.getContext('2d', { willReadFrequently: true })?.drawImage(base, 0, 0)
    }
    const context = canvas?.getContext('2d', { willReadFrequently: true })
    if (!canvas || !context) return
    const pending = next.slice(from)
    if (pending.some((stroke) => stroke.tool === 'geri' || stroke.mode === 'geri') && !rawContextRef.current && rawBitmap) {
      rawContextRef.current = rawContextOf(rawBitmap, width, height)
    }
    for (const stroke of pending) applyStroke(context, stroke, rawContextRef.current, width, height)
    strokedRef.current = { canvas, applied: next }
    setCleanVersion((value) => value + 1)
  }, [height, rawBitmap, width])

  const itemsKey = useMemo(() => JSON.stringify(items.map((item) => [item.type, item.x, item.y, item.w, item.h, item.shape, item.cleanup, item.polygon])), [items])

  useEffect(() => {
    if (!rawBitmap || editor.loading) return undefined
    const controller = new AbortController()
    setCleaning(true)
    const timer = setTimeout(() => {
      renderItemsClean({ source: rawBitmap, width, height, items, signal: controller.signal })
        .then((canvas) => {
          if (controller.signal.aborted) return
          itemsCanvasRef.current = canvas
          strokedRef.current = null
          applyStrokesTo(strokesLatest.current)
        })
        .catch(() => {})
        .finally(() => { if (!controller.signal.aborted) setCleaning(false) })
    }, 250)
    return () => { clearTimeout(timer); controller.abort() }
    // itemsKey alan geometrisini ozetler; metin/stil degisimi temizligi etkilemez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsKey, rawBitmap, editor.loading, width, height])

  useEffect(() => { if (itemsCanvasRef.current) applyStrokesTo(strokes) }, [applyStrokesTo, strokes])

  /** Damlalik: temiz gorunumden (izler dahil) piksel rengi. */
  const pickColor = useCallback((point: { x: number, y: number }) => {
    const source = strokedRef.current?.canvas
    const context = source?.getContext('2d', { willReadFrequently: true })
    if (!context) return
    const [r, g, b] = context.getImageData(Math.max(0, Math.min(width - 1, Math.round(point.x))), Math.max(0, Math.min(height - 1, Math.round(point.y))), 1, 1).data
    const hex = `#${[r, g, b].map((value) => value.toString(16).padStart(2, '0')).join('')}`
    setBrush({ color: hex })
    setRecentColors((current) => [hex, ...current.filter((entry) => entry !== hex)].slice(0, 6))
    onToast(txa('Renk alındı: {v1}', { v1: hex }))
  }, [height, onToast, setBrush, width])

  // Sihirli degnek onizlemesi: secilen pikseller yari saydam boyanir.
  const selectionOverlay = useMemo(() => {
    if (selection?.shape !== 'degnek' || !strokedRef.current) return null
    const context = strokedRef.current.canvas.getContext('2d', { willReadFrequently: true })
    if (!context) return null
    const seed = selection.points[0]
    const { mask } = floodMask(context.getImageData(0, 0, width, height).data, width, height, seed.x, seed.y, wandTolerance)
    const overlay = document.createElement('canvas')
    overlay.width = width
    overlay.height = height
    const overlayContext = overlay.getContext('2d')
    if (!overlayContext) return null
    const image = overlayContext.createImageData(width, height)
    for (let index = 0; index < mask.length; index += 1) {
      if (!mask[index]) continue
      image.data[index * 4] = 20
      image.data[index * 4 + 1] = 190
      image.data[index * 4 + 2] = 170
      image.data[index * 4 + 3] = 110
    }
    overlayContext.putImageData(image, 0, 0)
    return overlay
    // cleanVersion: secim guncel temiz gorunume gore hesaplanir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, wandTolerance, cleanVersion, width, height])

  /** Action on the selected area: becomes a cleaning stroke (saved, undoable). */
  const applySelection = useCallback((mode: 'onar' | 'doldur' | 'geri') => {
    if (!selection) return
    editor.changeStrokes([...strokes, {
      tool: 'secim', radius: 1, mode, shape: selection.shape, points: selection.points,
      ...(selection.shape === 'degnek' ? { tolerance: wandTolerance } : {}),
      ...(mode === 'doldur' ? { color: brush.color } : {}),
    }], { snapshot: true })
    setSelection(null)
    onToast(mode === 'onar' ? txa('Seçim içeriğe duyarlı dolduruldu') : mode === 'geri' ? txa('Seçimde orijinal geri getirildi') : txa('Seçim renkle dolduruldu'))
  }, [brush.color, editor, onToast, selection, strokes, wandTolerance])

  useEffect(() => {
    const controller = new AbortController()
    loadGlossary(project.fansubId, project.mangaId, project.sourceLanguage, controller.signal).then(setGlossary).catch(() => setGlossary([]))
    return () => controller.abort()
  }, [project.fansubId, project.mangaId, project.sourceLanguage])

  // Others on the same page: who is there, which item they select (early conflict warning).
  const { currentUser } = useAuth()
  const me = useMemo(() => (currentUser ? { userId: currentUser.id, username: currentUser.username } : null), [currentUser?.id, currentUser?.username]) // eslint-disable-line react-hooks/exhaustive-deps
  const peers = usePagePresence(page?.id ?? null, me, selectedId, (name) => onToast(txa('{v1} bu sayfaya girdi', { v1: name })))
  const peerItems = useMemo(() => new Map(peers.filter((peer) => peer.selectedItemId).map((peer) => [peer.selectedItemId as string, peer])), [peers])

  // Team resources: custom fonts and style library.
  const team = useTeamResources(project.fansubId, width, onToast)
  const { customFonts, stylePresets, uploadingFont } = team

  useEffect(() => {
    const controller = new AbortController()
    loadPageStatuses(readyPages.map((entry) => entry.id), LANGUAGE, controller.signal).then(setStatuses).catch(() => {})
    return () => controller.abort()
  }, [readyPages])

  // The current page's state is tracked live in the strip.
  useEffect(() => {
    if (!page) return
    setStatuses((current) => ({
      ...current,
      [page.id]: {
        pageId: page.id,
        total: items.length,
        approved: items.filter((item) => item.status === 'onayli').length,
        missing: items.filter((item) => item.status === 'eksik').length,
      },
    }))
  }, [items, page])

  useEffect(() => { setSelectedId(null); setGroupIds([]); setHiddenIds(new Set()); setLockedIds(new Set()); setCloneSource(null); setSelection(null) }, [page?.id])
  // When the selection tool is released (moving to brush etc.) the selection is kept; the wand preview does not hide outside the selection tool.
  // On first open low-confidence areas first (the promise in the scan summary).
  useEffect(() => {
    if (editor.loading || selectedId || !items.length) return
    const lowConfidence = items.find((item) => item.ocrConfidence !== null && item.ocrConfidence < 0.8 && item.status !== 'onayli')
    setSelectedId((lowConfidence ?? items.find((item) => item.status !== 'onayli') ?? items[0]).id)
    // Yalniz sayfa yuklenince bir kez secilir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor.loading, page?.id])

  useEffect(() => {
    if (rawBitmap) requestAnimationFrame(() => canvasRef.current?.fit())
  }, [rawBitmap])

  const overflowIds = useMemo(() => new Set(items
    .filter((item) => item.text.trim() && layoutLettering(item, item.text.trim(), width, LANGUAGE).layout.overflow)
    .map((item) => item.id)), [items, width])
  const visibleItems = items.filter((item) => matchesFilter(item, filter))
  const selected = items.find((item) => item.id === selectedId) ?? null
  /** When a lasso area moves/resizes, the polygon takes the same transform. */
  const moveItemBox = useCallback((id: string, box: { x: number, y: number, w: number, h: number }, snapshot: boolean) => {
    const item = items.find((entry) => entry.id === id)
    if (!item?.polygon || !item.polygon.length) { editor.updateItem(id, box, { snapshot }); return }
    const sx = box.w / Math.max(1, item.w)
    const sy = box.h / Math.max(1, item.h)
    const polygon = item.polygon.map((point) => ({ x: box.x + (point.x - item.x) * sx, y: box.y + (point.y - item.y) * sy }))
    editor.updateItem(id, { ...box, polygon }, { snapshot })
  }, [editor, items])

  const selectedIds = useMemo(() => {
    const live = groupIds.filter((id) => items.some((item) => item.id === id))
    return selectedId && live.includes(selectedId) ? live : selectedId ? [selectedId] : []
  }, [groupIds, items, selectedId])
  const selectedItems = useMemo(() => items.filter((item) => selectedIds.includes(item.id)), [items, selectedIds])

  const selectItem = useCallback((id: string | null, selectMode?: 'toggle') => {
    if (selectMode !== 'toggle' || !id) { setSelectedId(id); setGroupIds(id ? [id] : []); return }
    const next = selectedIds.includes(id) ? selectedIds.filter((entry) => entry !== id) : [...selectedIds, id]
    setGroupIds(next)
    setSelectedId(next.includes(id) ? id : next[next.length - 1] ?? null)
  }, [selectedIds])

  const selectMany = useCallback((ids: string[], additive: boolean) => {
    const next = additive ? [...new Set([...selectedIds, ...ids])] : ids
    setGroupIds(next)
    setSelectedId(next.length ? (ids[0] ?? (selectedId && next.includes(selectedId) ? selectedId : next[0])) : null)
  }, [selectedId, selectedIds])

  /** Moves group items in one undo step (arrow keys, alignment). */
  const moveGroup = useCallback((positions: Map<string, { x: number, y: number }>) => {
    if (!positions.size) return
    editor.snapshot()
    for (const item of items) {
      const target = positions.get(item.id)
      // A locked layer does not shift with arrow keys and alignment either.
      if (!target || lockedIds.has(item.id)) continue
      moveItemBox(item.id, { x: Math.max(0, Math.min(target.x, width - item.w)), y: Math.max(0, Math.min(target.y, height - item.h)), w: item.w, h: item.h }, false)
    }
  }, [editor, height, items, lockedIds, moveItemBox, width])

  const alignSelected = useCallback((alignMode: AlignMode) => {
    moveGroup(alignBoxes(selectedItems, alignMode))
  }, [moveGroup, selectedItems])

  /** The primary item's style is written to other items in the group. */
  const matchStyle = useCallback(() => {
    if (!selected || selectedItems.length < 2) return
    editor.snapshot()
    for (const item of selectedItems) if (item.id !== selected.id) editor.updateItem(item.id, { style: { ...selected.style } }, { snapshot: false })
    onToast(txa('Stil {v1} öğeye uygulandı', { v1: selectedItems.length - 1 }))
  }, [editor, onToast, selected, selectedItems])

  /** A team style applies to all selected items in one undo step. */
  const applyPreset = useCallback((presetId: string) => {
    const preset = stylePresets.find((entry) => entry.id === presetId)
    if (!preset || !selectedItems.length) return
    editor.snapshot()
    for (const item of selectedItems) editor.updateItem(item.id, { style: { ...preset.style } }, { snapshot: false })
    onToast(selectedItems.length > 1 ? txa('"{v1}" {v2} öğeye uygulandı', { v1: preset.name, v2: selectedItems.length }) : txa('"{v1}" uygulandı', { v1: preset.name }))
  }, [editor, onToast, selectedItems, stylePresets])

  const copySelected = useCallback(() => {
    if (!page || !selectedItems.length) return false
    clipboardRef.current = { pageId: page.id, items: selectedItems.map((item) => ({ ...item })), pastes: 0 }
    onToast(selectedItems.length > 1 ? txa('{v1} öğe kopyalandı', { v1: selectedItems.length }) : txa('Öğe kopyalandı'))
    return true
  }, [onToast, page, selectedItems])

  /** Each paste on the same page shifts 16 px; on another page it goes to the same place. */
  const pasteClipboard = useCallback(async () => {
    const clip = clipboardRef.current
    if (!page || !clip?.items.length) return
    clip.pastes = clip.pageId === page.id ? clip.pastes + 1 : 0
    const offset = clip.pageId === page.id ? 16 * clip.pastes : 0
    editor.snapshot()
    const created: string[] = []
    for (const source of clip.items) {
      const box = clampBox({ x: source.x + offset, y: source.y + offset, w: Math.min(source.w, width), h: Math.min(source.h, height) }, width, height)
      const dx = box.x - source.x
      const dy = box.y - source.y
      const item = await editor.addItem(box, source.type, {
        shape: source.shape,
        style: { ...source.style },
        polygon: source.polygon?.map((point) => ({ x: point.x + dx, y: point.y + dy })) ?? null,
        text: source.text,
      }, { snapshot: false })
      if (!item) continue
      editor.updateItem(item.id, { rotation: source.rotation, sourceText: source.sourceText, cleanup: source.cleanup }, { snapshot: false })
      created.push(item.id)
    }
    if (!created.length) return
    setFilter('hepsi')
    setTool('sec')
    setGroupIds(created)
    setSelectedId(created[0])
    onToast(created.length > 1 ? txa('{v1} öğe yapıştırıldı', { v1: created.length }) : txa('Öğe yapıştırıldı'))
  }, [editor, height, onToast, page, width])
  const selectedIndex = selected ? items.indexOf(selected) : -1

  const approveAndNext = useCallback(() => {
    if (!selected) return
    editor.setStatus(selected.id, 'onayli')
    const order = items.filter((item) => item.id !== selected.id && item.status !== 'onayli')
    const next = order.find((item) => items.indexOf(item) > selectedIndex) ?? order[0]
    setSelectedId(next?.id ?? null)
    if (!next) onToast(txa('Bu sayfadaki tüm öğeler onaylandı.'))
  }, [editor, items, onToast, selected, selectedIndex])

  const addDrawn = useCallback(async (box: { x: number, y: number, w: number, h: number }) => {
    const created = await editor.addItem(box, 'balon', { shape: 'elips' })
    if (created) {
      setSelectedId(created.id)
      setFilter('hepsi')
      setTool('sec')
      onToast(txa('Alan eklendi — orijinal metni ve çeviriyi gir'))
    }
  }, [editor, onToast])

  const addLasso = useCallback(async (points: Array<{ x: number, y: number }>) => {
    const xs = points.map((point) => point.x)
    const ys = points.map((point) => point.y)
    const box = clampBox({ x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }, width, height)
    if (box.w < 12 || box.h < 12) { onToast(txa('Serbest alan çok küçük')); return }
    const polygon = points.map((point) => ({ x: Math.max(0, Math.min(width, point.x)), y: Math.max(0, Math.min(height, point.y)) }))
    const created = await editor.addItem(box, 'balon', { shape: 'yok', polygon })
    if (created) {
      setSelectedId(created.id)
      setFilter('hepsi')
      setTool('sec')
      onToast(txa('Serbest alan eklendi — orijinal metni ve çeviriyi gir'))
    }
  }, [editor, height, onToast, width])


  const addText = useCallback(async (point: { x: number, y: number }) => {
    const size = Math.round(16 * Math.max(1, width / 640))
    const box = { x: Math.max(0, point.x - 80), y: Math.max(0, point.y - 24), w: Math.min(160, width), h: Math.min(48, height) }
    const created = await editor.addItem(box, 'anlatim', { style: { font: newFont, size }, text: txa('Yeni metin') })
    if (created) {
      setSelectedId(created.id)
      setFilter('hepsi')
      setTool('sec')
      onToast(txa('Metin kutusu eklendi'))
    }
  }, [editor, height, newFont, onToast, width])

  const transferStyle = useCallback((sourceId: string) => {
    if (!selected || selected.id === sourceId) { onToast(txa('Önce stili alacak öğeyi seç')); return }
    const source = items.find((item) => item.id === sourceId)
    if (!source) return
    const { color2, ...rest } = resolveStyle(source, width)
    const resolved: Partial<TlStyle> = { ...rest, ...(color2 ? { color2 } : {}) }
    // Kaynakta boyut elle secilmediyse hedefte otomatik sigdirma kapanmasin (sabit boyut yazilmaz).
    if (source.style.size === undefined) delete resolved.size
    editor.updateItem(selected.id, { style: resolved as TlStyle })
    onToast(txa('Stil aktarıldı'))
  }, [editor, items, onToast, selected, width])

  const reread = useCallback(async () => {
    if (!selected) return
    setRereading(true)
    try {
      await editor.flushAll()
      const result = await rereadItem(selected.id)
      editor.replaceItem(selected.id, {
        sourceText: result.sourceText, ocrConfidence: result.ocrConfidence, sourceOrigin: 'ocr',
        version: result.version, sourceVersion: result.sourceVersion,
      })
      onToast(txa('Alan yeniden okundu'))
    } catch (error) {
      onToast(toUserFacingErrorMessage(error, txa('Alan okunamadı.')))
    } finally {
      setRereading(false)
    }
  }, [editor, onToast, selected])

  // Kisayollar
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement | null)?.tagName ?? ''
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      const key = event.key.toLowerCase()
      const mod = event.metaKey || event.ctrlKey
      if (mod && key === 'z') { event.preventDefault(); void (event.shiftKey ? editor.redo() : editor.undo()); return }
      if (mod && key === 'y') { event.preventDefault(); void editor.redo(); return }
      // Gorunum: Ctrl+0 sigdir, Ctrl+1 %100, Ctrl +/- yakinlastir (tarayici yakinlastirmasi yerine).
      if (mod && key === '0') { event.preventDefault(); canvasRef.current?.fit(); return }
      if (mod && key === '1') { event.preventDefault(); setZoom(1); return }
      if (mod && (key === '=' || key === '+')) { event.preventDefault(); canvasRef.current?.zoomBy(1.25); return }
      if (mod && key === '-') { event.preventDefault(); canvasRef.current?.zoomBy(0.8); return }
      if (mod && key === 'd') { event.preventDefault(); setSelection(null); return }
      // Ogeler: Ctrl+A tumu, Ctrl+C kopyala, Ctrl+V yapistir, Ctrl+J cogalt (Photoshop katman kisayollari).
      if (mod && key === 'a' && items.length) { event.preventDefault(); setGroupIds(items.map((item) => item.id)); setSelectedId(selected?.id ?? items[0].id); return }
      // Sayfada metin secili ise tarayicinin kopyalamasi bozulmaz.
      if (mod && key === 'c') { if (!window.getSelection()?.toString() && copySelected()) event.preventDefault(); return }
      if (mod && key === 'v') { if (access.layout && clipboardRef.current) { event.preventDefault(); void pasteClipboard() } return }
      if (mod && key === 'j') { event.preventDefault(); if (access.layout && copySelected()) void pasteClipboard(); return }
      if (mod) return
      if (key === 'escape') {
        if (selection) setSelection(null)
        else if (selectedIds.length > 1) setGroupIds(selectedId ? [selectedId] : [])
        return
      }
      // Delete/Enter with a selection: content-aware fill (like Shift+Delete in Photoshop).
      if (access.clean && selection && (key === 'delete' || key === 'backspace' || key === 'enter')) { event.preventDefault(); applySelection('onar'); return }
      if (access.layout && selectedItems.length && (key === 'delete' || key === 'backspace')) { event.preventDefault(); void editor.removeItems(selectedIds.filter((id) => !lockedIds.has(id))); setSelectedId(null); setGroupIds([]); return }
      if (access.layout && selectedItems.length && key.startsWith('arrow')) {
        event.preventDefault()
        const step = event.shiftKey ? 10 : 1
        const dx = key === 'arrowleft' ? -step : key === 'arrowright' ? step : 0
        const dy = key === 'arrowup' ? -step : key === 'arrowdown' ? step : 0
        // The group moves together; a group against the page edge stops without changing shape.
        const left = Math.min(...selectedItems.map((item) => item.x))
        const top = Math.min(...selectedItems.map((item) => item.y))
        const right = Math.max(...selectedItems.map((item) => item.x + item.w))
        const bottom = Math.max(...selectedItems.map((item) => item.y + item.h))
        const mx = Math.max(-left, Math.min(width - right, dx))
        const my = Math.max(-top, Math.min(height - bottom, dy))
        if (mx || my) moveGroup(new Map(selectedItems.map((item) => [item.id, { x: item.x + mx, y: item.y + my }])))
        return
      }
      // [ ] boyut, Shift+[ ] sertlik, 1-0 opaklik (Photoshop kisayollari).
      if (key === '[' || key === '{') { if (event.shiftKey) setBrush({ hardness: Math.max(0, Math.round((brush.hardness - 0.1) * 10) / 10) }); else setBrush({ size: Math.max(2, brush.size - (brush.size > 40 ? 8 : 2)) }); return }
      if (key === ']' || key === '}') { if (event.shiftKey) setBrush({ hardness: Math.min(1, Math.round((brush.hardness + 0.1) * 10) / 10) }); else setBrush({ size: Math.min(300, brush.size + (brush.size >= 40 ? 8 : 2)) }); return }
      if (PAINT_TOOLS.includes(tool) && /^[0-9]$/.test(key)) { setBrush({ opacity: key === '0' ? 1 : Number(key) / 10 }); return }
      if (key === 'x') { setBrush({ color: brush.color === '#ffffff' ? '#000000' : '#ffffff' }); return }
      const match = tools.find((entry) => entry !== 'sep' && entry.key.toLowerCase() === key)
      if (match && match !== 'sep') {
        if (match.off) onToast(txa('{v1} yakında', { v1: match.label }))
        else setTool(match.id)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [access.clean, access.layout, applySelection, brush, copySelected, editor, height, items, lockedIds, moveGroup, onToast, pasteClipboard, selected, selectedId, selectedIds, selectedItems, selection, setBrush, tool, tools, width])

  if (!page) {
    return <div className='flex flex-1 items-center justify-center text-sm font-semibold text-[var(--tl-mut)]'>{txa('Düzenlenecek hazır sayfa yok.')}</div>
  }

  const currentTool = toolById(tool)
  const selectedStyle = selected ? resolveStyle(selected, width) : null
  const counts = {
    all: items.length,
    onayli: items.filter((item) => item.status === 'onayli').length,
    oneri: items.filter((item) => item.status === 'oneri').length,
    eksik: items.filter((item) => item.status === 'eksik').length,
  }
  const pageNumber = readyPages.indexOf(page) + 1
  const setSelectedStyle = (patch: Partial<TlStyle>) => { if (selected) editor.updateItem(selected.id, { style: { ...selected.style, ...patch } }) }

  return (
    <div className='flex min-h-0 flex-1 flex-col' data-testid='tl-editor'>
      {/* Secenek cubugu: araca gore degisir */}
      <div className='flex h-12 flex-none items-center gap-3 border-b border-[var(--tl-line)] bg-[var(--tl-sb)] px-3.5'>
        <span className='flex w-[150px] flex-none items-center gap-2 text-[12.5px] font-bold'>
          <ToolIcon id={tool} size={15} className='text-[var(--tl-p)]' />
          {currentTool.label}
        </span>
        <span className='h-[22px] w-px flex-none bg-[var(--tl-line)]' />
        {PAINT_TOOLS.includes(tool) && (
          <BrushBar
            tool={tool}
            brush={brush}
            onBrush={setBrush}
            recentColors={recentColors}
            onColor={(color) => { setBrush({ color }); setRecentColors((current) => [color, ...current.filter((entry) => entry !== color)].slice(0, 6)) }}
          />
        )}
        {(SELECT_TOOLS.includes(tool) || selection) && (
          <SelectionBar
            tool={tool}
            hasSelection={Boolean(selection)}
            tolerance={wandTolerance}
            onTolerance={setWandTolerance}
            fillColor={brush.color}
            onApply={applySelection}
            onClear={() => setSelection(null)}
          />
        )}
        {selectedItems.length > 1 && (
          <AlignBar count={selectedItems.length} onAlign={alignSelected} onMatchStyle={matchStyle} />
        )}
        {tool === 'metin' && (
          <div className='flex flex-none items-center gap-1'>
            {(Object.keys(FONTS) as FontKey[]).map((key) => (
              <button
                key={key}
                type='button'
                onClick={() => setNewFont(key)}
                className={cn('h-[30px] whitespace-nowrap rounded-lg border px-2.5 text-[13.5px]', newFont === key ? 'border-[var(--tl-p35)] bg-[var(--tl-p15)] text-[var(--tl-p)]' : 'border-[var(--tl-line)] bg-transparent text-[var(--tl-fg2)]')}
                style={{ fontFamily: FONTS[key].family, fontWeight: FONTS[key].weight }}
              >
                {FONTS[key].name}
              </button>
            ))}
          </div>
        )}
        {tool === 'sec' && selected && selectedStyle && (
          <div className='hidden flex-none items-center gap-2.5 xl:flex'>
            <span className='text-xs font-bold text-[var(--tl-mut)]'>{txa('Hizala')}</span>
            <div className='flex gap-[3px]'>
              {([['left', TextAlignLeft], ['center', TextAlignCenter], ['right', TextAlignRight]] as const).map(([align, Icon]) => (
                <button
                  key={align}
                  type='button'
                  onClick={() => setSelectedStyle({ align })}
                  className={cn('flex h-[30px] w-[30px] items-center justify-center rounded-lg border', selectedStyle.align === align ? 'border-[var(--tl-p35)] bg-[var(--tl-p15)] text-[var(--tl-p)]' : 'border-[var(--tl-line)] bg-transparent text-[var(--tl-mut)]')}
                >
                  <Icon weight='bold' size={14} />
                </button>
              ))}
            </div>
            <span className='text-xs font-bold text-[var(--tl-mut)]'>{txa('Döndür')}</span>
            <MiniStepper
              value={`${Math.round(selected.rotation)}°`}
              onDown={() => editor.updateItem(selected.id, { rotation: Math.max(-180, selected.rotation - 2) })}
              onUp={() => editor.updateItem(selected.id, { rotation: Math.min(180, selected.rotation + 2) })}
            />
            <span className='text-xs font-semibold text-[var(--tl-fg2)]'>
              Font: <span style={{ fontFamily: fontOf(selectedStyle.font).family, fontWeight: fontOf(selectedStyle.font).weight, fontSize: 13.5 }}>{fontOf(selectedStyle.font).name}</span>
            </span>
          </div>
        )}
        <span className='min-w-0 flex-1 truncate text-xs font-semibold text-[var(--tl-mut)]'>{PAINT_TOOLS.includes(tool) || selection ? '' : currentTool.hint}</span>
        <div className='flex flex-none gap-1'>
          <IconButton title={txa('Geri al (Ctrl+Z)')} disabled={!editor.historySize.past} onClick={() => { void editor.undo() }}><ArrowCounterClockwise weight='bold' size={14} /></IconButton>
          <IconButton title={txa('Yinele (Ctrl+Shift+Z)')} disabled={!editor.historySize.future} onClick={() => { void editor.redo() }}><ArrowClockwise weight='bold' size={14} /></IconButton>
        </div>
        <div className='flex flex-none gap-[3px] rounded-[10px] border border-[var(--tl-line)] bg-[var(--tl-card)] p-[3px]'>
          {([['ham', txa('Ham')], ['temiz', txa('Temiz')], ['ceviri', txa('Çeviri')]] as const).map(([key, label]) => (
            <button
              key={key}
              type='button'
              onClick={() => setMode(key)}
              className={cn('h-[26px] rounded-[7px] border-0 px-[11px] text-xs font-bold', mode === key ? 'bg-[var(--tl-acc2)] text-[var(--tl-fg)]' : 'bg-transparent text-[var(--tl-mut)]')}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          type='button'
          onClick={() => setShowBoxes((value) => !value)}
          className={cn('flex h-8 flex-none items-center gap-[7px] rounded-[9px] border border-[var(--tl-line)] bg-transparent px-2.5 text-xs font-bold', showBoxes ? 'text-[var(--tl-p)]' : 'text-[var(--tl-mut)]')}
        >
          <BoundingBox weight='bold' size={14} />
          {txa('Alanlar')}
        </button>
        <PresenceBar peers={peers} itemLabel={(itemId) => { const at = items.findIndex((item) => item.id === itemId); return at >= 0 ? txa('{v1}. öğeyi', { v1: at + 1 }) : null }} />
        <VersionsMenu pageId={page.id} language={LANGUAGE} canSave={access.text || access.layout || access.clean || access.project} canDelete={access.project} onFlush={editor.flushAll} onRestore={editor.restore} onToast={onToast} />
        <div className='flex flex-none items-center gap-1'>
          <IconButton title={txa('Uzaklaştır (Ctrl+-)')} onClick={() => canvasRef.current?.zoomBy(0.8)}><Minus weight='bold' size={12} /></IconButton>
          <button type='button' title={txa('%100 (Ctrl+1)')} onClick={() => setZoom(1)} className='w-[46px] border-0 bg-transparent text-center text-xs font-bold text-[var(--tl-fg2)]'>{Math.round(zoom * 100)}%</button>
          <IconButton title={txa('Yakınlaştır (Ctrl++)')} onClick={() => canvasRef.current?.zoomBy(1.25)}><Plus weight='bold' size={12} /></IconButton>
          <button type='button' title={txa('Sığdır (Ctrl+0)')} onClick={() => canvasRef.current?.fit()} className='ml-0.5 h-[30px] rounded-lg border border-[var(--tl-line)] bg-transparent px-[9px] text-xs font-bold text-[var(--tl-fg2)]'>{txa('Sığdır')}</button>
        </div>
      </div>

      <div className='flex min-h-0 flex-1'>
        <PageStrip pages={readyPages} currentId={page.id} statuses={statuses} onPick={(index) => { void editor.flushAll(); onPageChange(index) }} />

        <div className='flex w-[52px] flex-none flex-col items-center gap-1 border-r border-[var(--tl-line)] bg-[var(--tl-sb)] py-2.5'>
          {tools.map((entry, index) => (entry === 'sep'
            ? <span key={`sep-${index}`} className='my-[5px] h-px w-[26px] bg-[var(--tl-line)]' />
            : (
              <button
                key={entry.id}
                type='button'
                title={`${entry.label} (${entry.key})${entry.off ? txa(' · yakında') : ''}`}
                onClick={() => (entry.off ? onToast(txa('{v1} yakında', { v1: entry.label })) : setTool(entry.id))}
                className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-[9px] border',
                  tool === entry.id ? 'border-[var(--tl-p35)] bg-[var(--tl-p15)] text-[var(--tl-p)]' : 'border-transparent bg-transparent text-[var(--tl-fg2)] hover:text-[var(--tl-fg)]',
                  entry.off && 'opacity-45',
                )}
                data-testid={`tl-tool-${entry.id}`}
              >
                <ToolIcon id={entry.id} size={18} />
              </button>
            )))}
          <div className='flex-1' />
          <button type='button' title={txa('Fırça rengi: beyaz/siyah (X)')} onClick={() => setBrush({ color: brush.color === '#ffffff' ? '#000000' : '#ffffff' })} className='relative h-9 w-9 border-0 bg-transparent p-0'>
            <span className='absolute bottom-0.5 right-0.5 h-5 w-5 rounded border border-[var(--tl-line2)]' style={{ background: brush.color === '#000000' ? '#ffffff' : '#000000' }} />
            <span className='absolute left-0.5 top-0.5 h-5 w-5 rounded border border-[var(--tl-line2)]' style={{ background: brush.color }} />
          </button>
        </div>

        {editor.loadError
          ? <div className='flex flex-1 items-center justify-center text-sm font-semibold text-[var(--tl-red)]'>{editor.loadError}</div>
          : (
            <EditorCanvas
              ref={canvasRef}
              width={width}
              height={height}
              rawUrl={rawUrl}
              cleanCanvas={strokedRef.current?.canvas ?? null}
              cleanVersion={cleanVersion}
              cleaning={cleaning}
              mode={mode}
              showBoxes={showBoxes}
              zoom={zoom}
              onZoom={setZoom}
              tool={tool}
              items={items}
              overflowIds={overflowIds}
              selectedId={selectedId}
              selectedIds={selectedIds}
              onSelect={selectItem}
              onSelectMany={selectMany}
              canMove={access.layout}
              peerItems={peerItems}
              hiddenIds={hiddenIds}
              lockedIds={lockedIds}
              onMoveStart={editor.snapshot}
              onItemBox={moveItemBox}
              onDrawItem={(box) => { void addDrawn(box) }}
              onTextItem={(point) => { void addText(point) }}
              onStyleTransfer={transferStyle}
              onLassoItem={(points) => { void addLasso(points) }}
              cloneSource={cloneSource}
              onCloneSource={(point) => { setCloneSource(point); onToast(txa('Klon kaynağı seçildi')) }}
              onNeedCloneSource={() => onToast(txa('Önce Alt+tıkla kopyalanacak kaynağı seç'))}
              strokes={strokes}
              onStrokes={(next, snapshot) => editor.changeStrokes(next, { snapshot })}
              brush={brush}
              onPickColor={pickColor}
              selection={selection}
              onSelection={(next) => setSelection(next ? { ...next, ...(next.shape === 'degnek' ? { tolerance: wandTolerance } : {}) } : null)}
              selectionOverlay={selectionOverlay}
            />
          )}

        <ItemList
          overflowIds={overflowIds}
          items={visibleItems}
          allItems={items}
          pageLabel={txa('Sayfa {v1}', { v1: pageNumber })}
          filter={filter}
          onFilter={setFilter}
          selectedId={selectedId}
          selectedIds={selectedIds}
          onSelect={selectItem}
          hiddenIds={hiddenIds}
          lockedIds={lockedIds}
          onToggleHidden={(id) => setHiddenIds((current) => toggleIn(current, id))}
          onToggleLocked={(id) => setLockedIds((current) => toggleIn(current, id))}
        />

        <Inspector
          access={access}
          peerOnItem={selected ? peerItems.get(selected.id)?.username ?? null : null}
          item={selected}
          overflow={selected ? overflowIds.has(selected.id) : false}
          index={selectedIndex}
          sourceLanguageCode={TL_SOURCE_LANGUAGES[project.sourceLanguage].code}
          pageWidth={width}
          suggestions={editor.suggestions}
          glossary={glossary}
          rereading={rereading}
          onType={(type: TlItemType) => selected && editor.updateItem(selected.id, {
            type,
            // Type is only a label; an item with no saved font gets the default font by type.
            ...(selected.style.font ? {} : { style: { ...selected.style, font: DEFAULT_FONT_BY_TYPE[type] } }),
          })}
          onSourceText={(text) => selected && editor.updateItem(selected.id, { sourceText: text })}
          onReread={() => { void reread() }}
          onText={(text) => selected && editor.setText(selected.id, text)}
          onStyle={(style, snapshot) => selected && editor.updateItem(selected.id, { style }, { snapshot })}
          onCleanup={(cleanup) => selected && editor.updateItem(selected.id, { cleanup })}
          onDelete={() => { if (selected) { void editor.removeItem(selected.id); setSelectedId(null); setGroupIds([]) } }}
          onApprove={approveAndNext}
          onUnapprove={() => selected && editor.setStatus(selected.id, 'oneri')}
          onFocusField={editor.snapshot}
          customFonts={customFonts}
          stylePresets={stylePresets}
          onSavePreset={(name) => { void team.savePreset(name, selected) }}
          onApplyPreset={applyPreset}
          onDeletePreset={(id) => { void team.deletePreset(id) }}
          uploadingFont={uploadingFont}
          onUploadFont={(file) => { void team.uploadFont(file, (font) => { if (selected) editor.updateItem(selected.id, { style: { ...selected.style, font } }) }) }}
        />
      </div>

      <div className='flex h-[30px] flex-none items-center gap-[18px] border-t border-[var(--tl-line)] bg-[var(--tl-sb)] px-4 text-[11.5px] font-semibold text-[var(--tl-mut)]'>
        <span className='text-[var(--tl-fg2)]'>{txa('Sayfa {v1} / {v2}', { v1: pageNumber, v2: readyPages.length })}</span>
        <span>{txa('{v1} öğe', { v1: counts.all })}</span>
        <span className='text-[var(--tl-green)]'>{txa('{v1} onaylı', { v1: counts.onayli })}</span>
        <span className='text-[var(--tl-amber)]'>{txa('{v1} öneri', { v1: counts.oneri })}</span>
        <span className='text-[var(--tl-red)]'>{counts.eksik}{' '}{txa('eksik')}</span>
        <div className='flex-1' />
        <span className='hidden truncate lg:block'>{txa('V seç · R/Q/W seçim · J onarım · B fırça · Y geri getir · E silgi · [ ] boyut · Space kaydır · Ctrl+tekerlek yakınlaştır · Ctrl+Z geri al')}</span>
      </div>
    </div>
  )
}

function IconButton({ title, disabled, onClick, children }: { title: string, disabled?: boolean, onClick: () => void, children: React.ReactNode }) {
  return (
    <button
      type='button'
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className='flex h-[30px] w-[30px] items-center justify-center rounded-lg border border-[var(--tl-line)] bg-transparent text-[var(--tl-fg2)] disabled:opacity-40'
    >
      {children}
    </button>
  )
}

