import {
  forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent,
} from 'react'
import type { TlItem, TlStroke } from '@/services/translationEditorService'
import { appendPoint, eraseStrokes } from './cleanRender'
import { TranslatedTextBox } from '@/components/translation/TranslatedTextBox'
import { boundsOf, clampGroupDelta, intersects, snapBox, type Guide } from './arrange'
import { clampBox, PAINT_TOOLS, toolById, TYPE_META, type ToolId, type ViewMode } from './editorModel'
import { txa } from '@/i18n/activeLocale'

type Point = { x: number, y: number }
type Box = { x: number, y: number, w: number, h: number }
type Corner = 'tl' | 'tr' | 'bl' | 'br'

export interface BrushOptions { size: number, color: string, opacity: number, hardness: number, pressure: boolean }
export type EditorSelection = { shape: 'kutu' | 'kement' | 'degnek', points: Point[], tolerance?: number }

type Drag =
  | { kind: 'move', ids: string[], start: Point, origins: Map<string, Box>, moved: boolean }
  | { kind: 'marquee', start: Point, additive: boolean }
  | { kind: 'resize', id: string, corner: Corner, start: Point, origin: Box }
  | { kind: 'draw', start: Point }
  | { kind: 'paint', tool: 'firca' | 'onarim' | 'damga' | 'geri', offset?: Point }
  | { kind: 'lasso' }
  | { kind: 'selectBox', start: Point }
  | { kind: 'selectLasso' }
  | { kind: 'erase', changed: boolean }
  | { kind: 'pan', clientX: number, clientY: number, left: number, top: number }

export interface EditorCanvasHandle {
  fit: () => void
  /** Gorunumun ortasini sabit tutarak carpanla yakinlastirir. */
  zoomBy: (factor: number) => void
}

const MIN_ZOOM = 0.1
const MAX_ZOOM = 8
const clampZoom = (value: number) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Number(value.toFixed(3))))

export const EditorCanvas = forwardRef<EditorCanvasHandle, {
  width: number
  height: number
  rawUrl: string | null
  /** Temiz gorunum (otomatik temizlik + izler); PNG'ye cevrilmeden dogrudan cizilir. */
  cleanCanvas: HTMLCanvasElement | null
  cleanVersion: number
  cleaning: boolean
  mode: ViewMode
  showBoxes: boolean
  zoom: number
  onZoom: (zoom: number) => void
  tool: ToolId
  items: TlItem[]
  overflowIds: Set<string>
  selectedId: string | null
  /** All items in a multi-selection (primary included); empty or one element in a single selection. */
  selectedIds: string[]
  /** toggle: add/remove with Shift. */
  onSelect: (id: string | null, mode?: 'toggle') => void
  /** Selection rectangle: selects intersecting items (additive: add to the selection with Shift). */
  onSelectMany: (ids: string[], additive: boolean) => void
  hiddenIds: Set<string>
  lockedIds: Set<string>
  /** Typesetting permission: otherwise items can only be selected. */
  canMove?: boolean
  /** Items selected by others on the same page (presence). */
  peerItems?: Map<string, { username: string, color: string }>
  onMoveStart: () => void
  onItemBox: (id: string, box: Box, snapshot: boolean) => void
  onDrawItem: (box: Box) => void
  onTextItem: (point: Point) => void
  onStyleTransfer: (sourceId: string) => void
  onLassoItem: (points: Point[]) => void
  cloneSource: Point | null
  onCloneSource: (point: Point) => void
  onNeedCloneSource: () => void
  strokes: TlStroke[]
  onStrokes: (strokes: TlStroke[], snapshot: boolean) => void
  brush: BrushOptions
  onPickColor: (point: Point) => void
  selection: EditorSelection | null
  onSelection: (selection: EditorSelection | null) => void
  /** Magic wand preview (selected pixels painted, page sized). */
  selectionOverlay: HTMLCanvasElement | null
}>(function EditorCanvas(props, ref) {
  const {
    width, height, rawUrl, cleanCanvas, cleanVersion, cleaning, mode, showBoxes, zoom, onZoom, tool, items, overflowIds,
    selectedId, selectedIds, onSelect, onSelectMany, hiddenIds, lockedIds, canMove = true, peerItems, onMoveStart, onItemBox, onDrawItem, onTextItem, onStyleTransfer, onLassoItem, cloneSource,
    onCloneSource, onNeedCloneSource, strokes, onStrokes, brush, onPickColor, selection, onSelection, selectionOverlay,
  } = props
  const scrollRef = useRef<HTMLDivElement>(null)
  const layerRef = useRef<HTMLDivElement>(null)
  const displayRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const dragRef = useRef<Drag | null>(null)
  const anchorRef = useRef<{ page: Point, clientX: number, clientY: number } | null>(null)
  const [draft, setDraft] = useState<Box | null>(null)
  const [livePath, setLivePath] = useState<Point[] | null>(null)
  const livePathRef = useRef<TlStroke['points']>([])
  const [hover, setHover] = useState<Point | null>(null)
  const [spaceHeld, setSpaceHeld] = useState(false)
  const [guides, setGuides] = useState<Guide[]>([])
  const activeTool: ToolId = spaceHeld ? 'el' : tool
  const radius = brush.size / 2
  // Text canvases draw at zoom x dpr sharpness; rounded to a power of two so all boxes
  // do not redraw on every wheel zoom step.
  const letteringResolution = 2 ** Math.ceil(Math.log2(Math.max(0.25, zoom * (typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1))))

  // --- Zoom: the point under the cursor stays fixed ---------------------------------
  const pageAt = useCallback((clientX: number, clientY: number): Point => {
    const rect = layerRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return { x: (clientX - rect.left) / zoom, y: (clientY - rect.top) / zoom }
  }, [zoom])

  const zoomAt = useCallback((next: number, clientX: number, clientY: number) => {
    const target = clampZoom(next)
    if (target === zoom) return
    anchorRef.current = { page: pageAt(clientX, clientY), clientX, clientY }
    onZoom(target)
  }, [onZoom, pageAt, zoom])

  useLayoutEffect(() => {
    const anchor = anchorRef.current
    const scroller = scrollRef.current
    const rect = layerRef.current?.getBoundingClientRect()
    anchorRef.current = null
    if (!anchor || !scroller || !rect) return
    scroller.scrollLeft += rect.left + anchor.page.x * zoom - anchor.clientX
    scroller.scrollTop += rect.top + anchor.page.y * zoom - anchor.clientY
  }, [zoom])

  const fit = useCallback(() => {
    const scroller = scrollRef.current
    if (!scroller) return
    const available = { w: scroller.clientWidth - 56, h: scroller.clientHeight - 56 }
    // A long webtoon page fits by width, a normal page fits fully.
    const byWidth = available.w / width
    const byHeight = available.h / height
    const next = height / width > 2.2 ? byWidth : Math.min(byWidth, byHeight)
    onZoom(clampZoom(next))
  }, [height, onZoom, width])

  const zoomBy = useCallback((factor: number) => {
    const scroller = scrollRef.current
    if (!scroller) { onZoom(clampZoom(zoom * factor)); return }
    const rect = scroller.getBoundingClientRect()
    zoomAt(zoom * factor, rect.left + rect.width / 2, rect.top + rect.height / 2)
  }, [onZoom, zoom, zoomAt])

  useImperativeHandle(ref, () => ({ fit, zoomBy }), [fit, zoomBy])

  // Ctrl/Cmd + tekerlek: imlecte yakinlastir (pasif olmayan dinleyici; tarayici yakinlastirmasi engellenir).
  useEffect(() => {
    const scroller = scrollRef.current
    if (!scroller) return undefined
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      zoomAt(zoom * (event.deltaY < 0 ? 1.12 : 1 / 1.12), event.clientX, event.clientY)
    }
    scroller.addEventListener('wheel', onWheel, { passive: false })
    return () => scroller.removeEventListener('wheel', onWheel)
  }, [zoom, zoomAt])

  // Temporary pan in every tool while Space is held (like Photoshop).
  useEffect(() => {
    const typing = (target: EventTarget | null) => {
      const tag = (target as HTMLElement | null)?.tagName ?? ''
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (target as HTMLElement | null)?.isContentEditable
    }
    const down = (event: KeyboardEvent) => { if (event.code === 'Space' && !typing(event.target)) { event.preventDefault(); setSpaceHeld(true) } }
    const up = (event: KeyboardEvent) => { if (event.code === 'Space') setSpaceHeld(false) }
    const blur = () => setSpaceHeld(false)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur) }
  }, [])

  // Temiz gorunum: onbellekteki tuval dogrudan kopyalanir.
  useEffect(() => {
    const display = displayRef.current
    const context = display?.getContext('2d')
    if (!display || !context || !cleanCanvas) return
    context.clearRect(0, 0, display.width, display.height)
    context.drawImage(cleanCanvas, 0, 0)
  }, [cleanCanvas, cleanVersion, width, height, mode])

  useEffect(() => {
    const overlay = overlayRef.current
    const context = overlay?.getContext('2d')
    if (!overlay || !context) return
    context.clearRect(0, 0, overlay.width, overlay.height)
    if (selectionOverlay) context.drawImage(selectionOverlay, 0, 0)
  }, [selectionOverlay])

  const toPage = (event: { clientX: number, clientY: number }): Point => pageAt(event.clientX, event.clientY)
  const pressureOf = (event: ReactPointerEvent) => (brush.pressure && event.pointerType === 'pen' ? Math.max(0.05, Math.min(1, event.pressure || 0.5)) : undefined)
  const startPath = (point: Point, pressure?: number) => {
    livePathRef.current = [{ x: Math.round(point.x), y: Math.round(point.y), ...(pressure !== undefined ? { p: pressure } : {}) }]
    setLivePath(livePathRef.current)
  }

  const onPageDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    const point = toPage(event)
    event.currentTarget.setPointerCapture(event.pointerId)
    if (activeTool === 'el') {
      const scroller = scrollRef.current
      if (scroller) dragRef.current = { kind: 'pan', clientX: event.clientX, clientY: event.clientY, left: scroller.scrollLeft, top: scroller.scrollTop }
      return
    }
    // Dragging in empty space makes a selection rectangle; a click clears the selection (kept with Shift).
    if (activeTool === 'sec') { dragRef.current = { kind: 'marquee', start: point, additive: event.shiftKey }; setDraft({ ...point, w: 0, h: 0 }); return }
    if (activeTool === 'zoom') { zoomAt(zoom * (event.altKey ? 1 / 1.25 : 1.25), event.clientX, event.clientY); return }
    if (activeTool === 'ekle') { dragRef.current = { kind: 'draw', start: point }; setDraft({ ...point, w: 0, h: 0 }); return }
    if (activeTool === 'metin') { onTextItem(point); return }
    if (activeTool === 'kement') { dragRef.current = { kind: 'lasso' }; startPath(point); return }
    if (activeTool === 'secKutu') { dragRef.current = { kind: 'selectBox', start: point }; setDraft({ ...point, w: 0, h: 0 }); return }
    if (activeTool === 'secKement') { dragRef.current = { kind: 'selectLasso' }; startPath(point); return }
    if (activeTool === 'degnek') { onSelection({ shape: 'degnek', points: [{ x: Math.round(point.x), y: Math.round(point.y) }] }); return }
    if (activeTool === 'damga') {
      if (event.altKey) { onCloneSource({ x: Math.round(point.x), y: Math.round(point.y) }); return }
      if (!cloneSource) { onNeedCloneSource(); return }
      // Like Photoshop: the distance between source and first point stays fixed along the stroke.
      dragRef.current = { kind: 'paint', tool: 'damga', offset: { x: cloneSource.x - Math.round(point.x), y: cloneSource.y - Math.round(point.y) } }
      startPath(point, pressureOf(event))
      return
    }
    if (activeTool === 'firca' && event.altKey) { onPickColor(point); return }
    if (activeTool === 'firca' || activeTool === 'onarim' || activeTool === 'geri') {
      dragRef.current = { kind: 'paint', tool: activeTool }
      startPath(point, pressureOf(event))
      return
    }
    if (activeTool === 'silgi') {
      dragRef.current = { kind: 'erase', changed: false }
      livePathRef.current = [point]
      eraseAlong([point], dragRef.current)
    }
  }

  /** The eraser adds a history step only when it really erases a stroke (empty motion does not fill the undo stack). */
  const eraseAlong = (path: Point[], drag: Extract<Drag, { kind: 'erase' }>) => {
    const next = eraseStrokes(strokes, path, radius)
    if (next.length === strokes.length && next.every((stroke, index) => stroke === strokes[index])) return
    onStrokes(next, !drag.changed)
    drag.changed = true
  }

  const onItemDown = (item: TlItem, event: ReactPointerEvent) => {
    if (event.button !== 0 || spaceHeld) return
    if (tool === 'sec') {
      event.stopPropagation()
      layerRef.current?.setPointerCapture(event.pointerId)
      if (event.shiftKey) { onSelect(item.id, 'toggle'); return }
      if (!canMove) { onSelect(item.id); return }
      // Grabbing an item in the selected group moves the whole group.
      const ids = selectedIds.length > 1 && selectedIds.includes(item.id) ? selectedIds : [item.id]
      const origins = new Map(items.filter((entry) => ids.includes(entry.id)).map((entry) => [entry.id, { x: entry.x, y: entry.y, w: entry.w, h: entry.h }]))
      dragRef.current = { kind: 'move', ids, start: toPage(event), origins, moved: false }
      if (ids.length === 1) onSelect(item.id)
      return
    }
    if (tool === 'stil') {
      event.stopPropagation()
      onStyleTransfer(item.id)
    }
  }

  const onHandleDown = (item: TlItem, corner: Corner, event: ReactPointerEvent) => {
    event.stopPropagation()
    layerRef.current?.setPointerCapture(event.pointerId)
    onMoveStart()
    dragRef.current = { kind: 'resize', id: item.id, corner, start: toPage(event), origin: { x: item.x, y: item.y, w: item.w, h: item.h } }
  }

  const onPointerMove = (event: ReactPointerEvent) => {
    const drag = dragRef.current
    if (PAINT_TOOLS.includes(activeTool)) setHover(toPage(event))
    if (!drag) return
    if (drag.kind === 'pan') {
      const scroller = scrollRef.current
      if (!scroller) return
      scroller.scrollLeft = drag.left - (event.clientX - drag.clientX)
      scroller.scrollTop = drag.top - (event.clientY - drag.clientY)
      return
    }
    const point = toPage(event)
    if (drag.kind === 'move') {
      const dx = point.x - drag.start.x
      const dy = point.y - drag.start.y
      if (!drag.moved) {
        if (Math.abs(dx) + Math.abs(dy) < 2 / zoom) return
        onMoveStart()
        drag.moved = true
      }
      const origins = [...drag.origins.values()]
      const group = boundsOf(origins)
      // Smart guide: the group's edge/center snaps to other items and page center (off with Alt).
      const others = items.filter((entry) => !drag.origins.has(entry.id))
      const snap = event.altKey ? { dx: 0, dy: 0, guides: [] } : snapBox({ ...group, x: group.x + dx, y: group.y + dy }, others, { width, height }, 6 / zoom)
      const delta = clampGroupDelta(group, dx + snap.dx, dy + snap.dy, { width, height })
      setGuides(snap.guides)
      for (const [id, origin] of drag.origins) {
        onItemBox(id, clampBox({ ...origin, x: origin.x + delta.dx, y: origin.y + delta.dy }, width, height), false)
      }
    } else if (drag.kind === 'resize') {
      let { x, y, w, h } = drag.origin
      const dx = point.x - drag.start.x
      const dy = point.y - drag.start.y
      if (drag.corner.includes('l')) { x += dx; w -= dx }
      if (drag.corner.includes('r')) w += dx
      if (drag.corner.includes('t')) { y += dy; h -= dy }
      if (drag.corner.includes('b')) h += dy
      if (w < 20) { if (drag.corner.includes('l')) x -= 20 - w; w = 20 }
      if (h < 20) { if (drag.corner.includes('t')) y -= 20 - h; h = 20 }
      onItemBox(drag.id, clampBox({ x, y, w, h }, width, height), false)
    } else if (drag.kind === 'draw' || drag.kind === 'selectBox' || drag.kind === 'marquee') {
      setDraft({ x: Math.min(drag.start.x, point.x), y: Math.min(drag.start.y, point.y), w: Math.abs(point.x - drag.start.x), h: Math.abs(point.y - drag.start.y) })
    } else if (drag.kind === 'paint') {
      livePathRef.current = appendPoint(livePathRef.current, { ...point, p: pressureOf(event) }, radius)
      setLivePath(livePathRef.current)
    } else if (drag.kind === 'lasso' || drag.kind === 'selectLasso') {
      livePathRef.current = appendPoint(livePathRef.current, point, 3)
      setLivePath(livePathRef.current)
    } else if (drag.kind === 'erase') {
      livePathRef.current = [...livePathRef.current.slice(-4), point]
      eraseAlong(livePathRef.current, drag)
    }
  }

  const onPointerUp = () => {
    const drag = dragRef.current
    dragRef.current = null
    if (!drag) return
    if (drag.kind === 'draw') {
      const box = draft && draft.w > 12 && draft.h > 12 ? draft : { x: drag.start.x - 60, y: drag.start.y - 45, w: 120, h: 90 }
      setDraft(null)
      onDrawItem(clampBox(box, width, height))
    } else if (drag.kind === 'selectBox') {
      const box = draft
      setDraft(null)
      if (box && box.w > 3 && box.h > 3) {
        onSelection({ shape: 'kutu', points: [{ x: Math.round(box.x), y: Math.round(box.y) }, { x: Math.round(box.x + box.w), y: Math.round(box.y + box.h) }] })
      } else {
        onSelection(null)
      }
    } else if (drag.kind === 'paint') {
      const points = livePathRef.current
      setLivePath(null)
      if (points.length) {
        onStrokes([...strokes, {
          tool: drag.tool,
          radius: Math.max(1, Math.round(radius)),
          points,
          ...(drag.tool === 'firca' ? { color: brush.color } : {}),
          ...(drag.tool === 'damga' && drag.offset ? { offset: drag.offset } : {}),
          ...(drag.tool !== 'onarim' && brush.opacity < 1 ? { opacity: brush.opacity } : {}),
          ...(brush.hardness < 1 ? { hardness: brush.hardness } : {}),
        }], true)
      }
    } else if (drag.kind === 'lasso' || drag.kind === 'selectLasso') {
      const points = livePathRef.current.map(({ x, y }) => ({ x, y }))
      setLivePath(null)
      if (drag.kind === 'lasso') { if (points.length >= 3) onLassoItem(points) }
      else onSelection(points.length >= 3 ? { shape: 'kement', points } : null)
    } else if (drag.kind === 'move') {
      setGuides([])
      if (!drag.moved) return
      for (const item of items) {
        if (drag.origins.has(item.id)) onItemBox(item.id, { x: item.x, y: item.y, w: item.w, h: item.h }, false)
      }
    } else if (drag.kind === 'marquee') {
      const box = draft
      setDraft(null)
      if (box && box.w > 3 && box.h > 3) onSelectMany(items.filter((item) => !lockedIds.has(item.id) && intersects(item, box)).map((item) => item.id), drag.additive)
      else if (!drag.additive) onSelect(null)
    }
  }

  const cursor = activeTool === 'el' ? (dragRef.current?.kind === 'pan' ? 'grabbing' : 'grab') : toolById(activeTool).cursor
  const paintCursor = hover && PAINT_TOOLS.includes(activeTool)
  const livePaintOffset = dragRef.current?.kind === 'paint' ? dragRef.current.offset : undefined
  const selectionPolygon = selection && selection.shape !== 'degnek'
    ? (selection.shape === 'kutu' && selection.points.length === 2
      ? [selection.points[0], { x: selection.points[1].x, y: selection.points[0].y }, selection.points[1], { x: selection.points[0].x, y: selection.points[1].y }]
      : selection.points)
    : null

  return (
    <div ref={scrollRef} className='flex min-w-0 flex-1 overflow-auto bg-[var(--tl-bg)] p-7' data-testid='tl-editor-canvas'>
      <div className='relative m-auto flex-none' style={{ width: width * zoom, height: height * zoom }}>
        <div
          ref={layerRef}
          onPointerDown={onPageDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerLeave={() => setHover(null)}
          className='absolute left-0 top-0 origin-top-left select-none overflow-hidden bg-white shadow-[0_20px_60px_oklch(0_0_0/50%)]'
          style={{ width, height, transform: `scale(${zoom})`, cursor, touchAction: 'none' }}
        >
          {rawUrl && (mode === 'ham' || !cleanCanvas) && <img src={rawUrl} alt='' draggable={false} className='pointer-events-none absolute inset-0 h-full w-full' />}
          <canvas
            ref={displayRef}
            width={width}
            height={height}
            className='pointer-events-none absolute inset-0 h-full w-full'
            style={{ visibility: mode !== 'ham' && cleanCanvas ? 'visible' : 'hidden', imageRendering: zoom >= 2 ? 'pixelated' : 'auto' }}
            data-testid='tl-clean-canvas'
          />

          {mode === 'ceviri' && items.filter((item) => !hiddenIds.has(item.id)).map((item) => <TranslatedTextBox key={item.id} box={item} text={item.text} pageWidth={width} resolution={letteringResolution} />)}

          {/* Alanlar isaretci olaylarini alir; kutu cizimi ayri katmanda. */}
          {items.map((item) => (
            <div
              key={item.id}
              onPointerDown={(event) => onItemDown(item, event)}
              className='absolute'
              style={{ left: item.x, top: item.y, width: item.w, height: item.h, cursor: activeTool === 'sec' ? 'move' : activeTool === 'stil' ? 'copy' : cursor, pointerEvents: (activeTool === 'sec' || activeTool === 'stil') && !lockedIds.has(item.id) ? 'auto' : 'none' }}
            />
          ))}

          {showBoxes && items.map((item, index) => {
            const selected = item.id === selectedId || selectedIds.includes(item.id)
            const single = selectedIds.length <= 1 && item.id === selectedId
            const overflow = overflowIds.has(item.id)
            const peer = peerItems?.get(item.id)
            const color = peer ? peer.color : overflow ? 'var(--tl-red)' : TYPE_META[item.type].color
            const scale = 1 / zoom
            return (
              <div
                key={item.id}
                className='pointer-events-none absolute box-border rounded-[5px]'
                style={{
                  left: item.x, top: item.y, width: item.w, height: item.h,
                  border: `${(selected || overflow ? 2 : 1.5) * scale}px ${selected ? 'solid' : 'dashed'} ${color}`,
                  background: selected ? 'oklch(0.832 0.074 186.1 / 8%)' : 'transparent',
                }}
                data-overflow={overflow || undefined}
              >
                <span
                  className='absolute flex items-center whitespace-nowrap rounded-[5px] font-extrabold text-[var(--tl-pfg)]'
                  style={{
                    left: -2 * scale, top: -22 * scale, height: 18 * scale, padding: `0 ${6 * scale}px`,
                    fontSize: 10.5 * scale, background: color, fontFamily: 'Inter, sans-serif',
                  }}
                >
                  {index + 1} · {TYPE_META[item.type].label}{overflow ? txa('· sığmıyor') : ''}
                </span>
                {peer && (
                  <span
                    className='absolute flex items-center whitespace-nowrap rounded-[5px] font-extrabold text-[#10131a]'
                    style={{ left: -2 * scale, bottom: -22 * scale, height: 18 * scale, padding: `0 ${6 * scale}px`, fontSize: 10.5 * scale, background: peer.color, fontFamily: 'Inter, sans-serif' }}
                    data-testid='tl-peer-item'
                  >
                    {txa('{v1} düzenliyor', { v1: peer.username })}
                  </span>
                )}
                {single && canMove && tool === 'sec' && (['tl', 'tr', 'bl', 'br'] as Corner[]).map((corner) => (
                  <span
                    key={corner}
                    onPointerDown={(event) => onHandleDown(item, corner, event)}
                    className='pointer-events-auto absolute box-border bg-[var(--tl-p)]'
                    style={{
                      width: 10 * scale, height: 10 * scale, border: `${1.5 * scale}px solid var(--tl-bg)`,
                      left: corner.includes('l') ? -6 * scale : undefined, right: corner.includes('r') ? -6 * scale : undefined,
                      top: corner.includes('t') ? -6 * scale : undefined, bottom: corner.includes('b') ? -6 * scale : undefined,
                      cursor: corner === 'tl' || corner === 'br' ? 'nwse-resize' : 'nesw-resize',
                    }}
                  />
                ))}
              </div>
            )
          })}

          {guides.length > 0 && (
            <svg className='pointer-events-none absolute inset-0' width={width} height={height} data-testid='tl-guides'>
              {guides.map((guide, index) => (guide.axis === 'x'
                ? <line key={index} x1={guide.at} x2={guide.at} y1={0} y2={height} stroke='#ff2bd6' strokeWidth={1 / zoom} />
                : <line key={index} x1={0} x2={width} y1={guide.at} y2={guide.at} stroke='#ff2bd6' strokeWidth={1 / zoom} />))}
            </svg>
          )}

          {draft && (
            <div
              className={activeTool === 'secKutu' ? 'tl-marching pointer-events-none absolute box-border' : 'pointer-events-none absolute box-border border-2 border-dashed border-[var(--tl-p)] bg-[var(--tl-p15)]'}
              style={{ left: draft.x, top: draft.y, width: draft.w, height: draft.h, ...(activeTool === 'secKutu' ? { outline: `${1.5 / zoom}px dashed #000`, boxShadow: `0 0 0 ${1.5 / zoom}px #fff` } : {}) }}
            />
          )}

          {showBoxes && items.some((item) => item.polygon) && (
            <svg className='pointer-events-none absolute inset-0' width={width} height={height}>
              {items.filter((item) => item.polygon && item.polygon.length >= 3).map((item) => (
                <polygon
                  key={item.id}
                  points={(item.polygon ?? []).map((point) => `${point.x},${point.y}`).join(' ')}
                  fill='none'
                  stroke={TYPE_META[item.type].color}
                  strokeWidth={1.5 / zoom}
                  strokeDasharray={`${4 / zoom} ${3 / zoom}`}
                />
              ))}
            </svg>
          )}

          <canvas ref={overlayRef} width={width} height={height} className='pointer-events-none absolute inset-0 h-full w-full' style={{ visibility: selection?.shape === 'degnek' && selectionOverlay ? 'visible' : 'hidden' }} />

          {selectionPolygon && selectionPolygon.length >= 3 && (
            <svg className='pointer-events-none absolute inset-0' width={width} height={height} data-testid='tl-selection'>
              <polygon points={selectionPolygon.map((point) => `${point.x},${point.y}`).join(' ')} fill='oklch(0.832 0.074 186.1 / 10%)' stroke='#ffffff' strokeWidth={1.5 / zoom} />
              <polygon className='tl-marching-ants' points={selectionPolygon.map((point) => `${point.x},${point.y}`).join(' ')} fill='none' stroke='#000000' strokeWidth={1.5 / zoom} strokeDasharray={`${5 / zoom} ${5 / zoom}`} />
            </svg>
          )}

          {livePath && livePath.length > 0 && (
            <svg className='pointer-events-none absolute inset-0' width={width} height={height}>
              {activeTool === 'kement' || activeTool === 'secKement' ? (
                <polyline
                  points={livePath.map((point) => `${point.x},${point.y}`).join(' ')}
                  fill='oklch(0.832 0.074 186.1 / 12%)'
                  stroke='var(--tl-p)'
                  strokeWidth={2 / zoom}
                  strokeDasharray={`${5 / zoom} ${4 / zoom}`}
                />
              ) : (
                <polyline
                  points={livePath.map((point) => `${point.x},${point.y}`).join(' ')}
                  fill='none'
                  stroke={activeTool === 'firca' ? brush.color : 'oklch(0.832 0.074 186.1 / 55%)'}
                  strokeOpacity={activeTool === 'firca' ? brush.opacity : 1}
                  strokeWidth={brush.size}
                  strokeLinecap='round'
                  strokeLinejoin='round'
                />
              )}
            </svg>
          )}

          {(activeTool === 'damga' && cloneSource) || paintCursor ? (
            <svg className='pointer-events-none absolute inset-0' width={width} height={height} aria-hidden>
              {activeTool === 'damga' && cloneSource && (() => {
                const source = livePaintOffset && hover ? { x: hover.x + livePaintOffset.x, y: hover.y + livePaintOffset.y } : cloneSource
                return (
                  <>
                    <circle cx={source.x} cy={source.y} r={radius} fill='none' stroke='var(--tl-p)' strokeWidth={1.5 / zoom} />
                    <path d={`M ${source.x - 6 / zoom} ${source.y} H ${source.x + 6 / zoom} M ${source.x} ${source.y - 6 / zoom} V ${source.y + 6 / zoom}`} stroke='var(--tl-p)' strokeWidth={1.5 / zoom} />
                  </>
                )
              })()}
              {paintCursor && hover && (
                <>
                  {/* Firca imleci: boyut ve sertlik (ic halka) gorunur; her zeminde okunur. */}
                  <circle cx={hover.x} cy={hover.y} r={radius} fill='none' stroke='#ffffff' strokeWidth={2.5 / zoom} />
                  <circle cx={hover.x} cy={hover.y} r={radius} fill='none' stroke='#000000' strokeWidth={1 / zoom} data-testid='tl-brush-cursor' />
                  {brush.hardness < 1 && activeTool !== 'silgi' && <circle cx={hover.x} cy={hover.y} r={Math.max(1, radius * brush.hardness)} fill='none' stroke='#000000' strokeOpacity={0.45} strokeWidth={1 / zoom} strokeDasharray={`${3 / zoom} ${3 / zoom}`} />}
                  <path d={`M ${hover.x - 4 / zoom} ${hover.y} H ${hover.x + 4 / zoom} M ${hover.x} ${hover.y - 4 / zoom} V ${hover.y + 4 / zoom}`} stroke='#000000' strokeWidth={1 / zoom} />
                </>
              )}
            </svg>
          ) : null}

          {cleaning && mode !== 'ham' && (
            <span className='pointer-events-none absolute right-2 top-2 rounded-full bg-black/70 px-2.5 py-1 text-[11px] font-bold text-white' style={{ transform: `scale(${1 / zoom})`, transformOrigin: 'top right' }}>
              {txa('Temizleniyor…')}
            </span>
          )}
        </div>
      </div>
    </div>
  )
})
