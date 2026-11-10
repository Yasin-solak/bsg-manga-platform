import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowSquareOut, Check, CheckCircle, Warning } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { studioAccessToken } from '@/services/studioAuth'
import {
  loadGlossary, loadItem, loadProjectItems, loadSuggestions, saveHumanText, TlConflictError,
  type TlGlossaryTerm, type TlItem, type TlSuggestion, type TlTextStatus,
} from '@/services/translationEditorService'
import { rawPageUrl, type TlPage, type TlProject } from '@/services/translationStudioService'
import { toUserFacingErrorMessage } from '@/services/userFacingError'
import { ProgressBar } from '../studioUi'
import { STATUS_META, TYPE_META } from './editorModel'
import { ensureFonts } from './finalRender'
import { reviewIssues, type ReviewIssue } from './reviewChecks'
import type { SaveState } from './useEditorPage'
import { txa } from '@/i18n/activeLocale'

/*
 * Bulk review: items from all pages of the chapter in one list. Without entering the editor,
 * source region, original text, translation and AI suggestions show side by side; quick approval
 * by keyboard. The 'Problem' filter gathers translations that do not fit the area or
 * follow the glossary. Bulk approval can be undone.
 */

const LANGUAGE = 'tr'
const CROP_W = 176
const CROP_H = 116

type ReviewFilter = 'hepsi' | 'oneri' | 'eksik' | 'onayli' | 'sorun'

const FILTERS: Array<{ key: ReviewFilter, label: string }> = [
  { key: 'oneri', get label() { return txa('Öneri') } },
  { key: 'sorun', get label() { return txa('Sorunlu') } },
  { key: 'eksik', get label() { return txa('Eksik') } },
  { key: 'onayli', get label() { return txa('Onaylı') } },
  { key: 'hepsi', get label() { return txa('Tümü') } },
]

/** Raw pages are fetched once with authorization; released when the screen closes. */
function useRawPageUrls(pageIds: string[]) {
  const [urls, setUrls] = useState<Record<string, string>>({})
  const key = pageIds.join(',')
  useEffect(() => {
    const controller = new AbortController()
    const created: string[] = []
    void (async () => {
      const token = await studioAccessToken().catch(() => null)
      if (!token) return
      // At most 3 pages download at once; first pages show first.
      let cursor = 0
      const worker = async () => {
        while (cursor < pageIds.length && !controller.signal.aborted) {
          const pageId = pageIds[cursor++]
          const response = await fetch(rawPageUrl(pageId), { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal }).catch(() => null)
          if (!response?.ok || controller.signal.aborted) continue
          const url = URL.createObjectURL(await response.blob())
          created.push(url)
          setUrls((current) => ({ ...current, [pageId]: url }))
        }
      }
      await Promise.all([worker(), worker(), worker()])
      // Indirilemeyen sayfanin kirpintisi bos kalir; inceleme metinle surer.
    })().catch(() => {})
    return () => {
      controller.abort()
      for (const url of created) URL.revokeObjectURL(url)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return urls
}

function Crop({ url, page, item }: { url: string | undefined, page: TlPage, item: TlItem }) {
  const scale = Math.min(CROP_W / Math.max(1, item.w), CROP_H / Math.max(1, item.h), 1.5)
  const offsetX = (CROP_W - item.w * scale) / 2 - item.x * scale
  const offsetY = (CROP_H - item.h * scale) / 2 - item.y * scale
  return (
    <div
      className='flex-none rounded-lg border border-[var(--tl-line)] bg-[var(--tl-bg)]'
      style={{
        width: CROP_W,
        height: CROP_H,
        backgroundImage: url ? `url(${url})` : undefined,
        backgroundRepeat: 'no-repeat',
        backgroundSize: `${(page.width ?? 1) * scale}px ${(page.height ?? 1) * scale}px`,
        backgroundPosition: `${offsetX}px ${offsetY}px`,
      }}
      aria-hidden
    />
  )
}

export function ReviewScreen({ project, pages, onOpenPage, onToast, onSaveState, canEdit = true }: {
  project: TlProject
  pages: TlPage[]
  onOpenPage: (index: number) => void
  onToast: (message: string) => void
  onSaveState: (state: SaveState) => void
  /** Translation text permission: otherwise review is read only. */
  canEdit?: boolean
}) {
  const readyPages = useMemo(() => pages.filter((page) => page.rawStatus === 'ready' && page.width && page.height), [pages])
  const pageById = useMemo(() => new Map(readyPages.map((page, index) => [page.id, { page, index }])), [readyPages])
  const pageIds = useMemo(() => readyPages.map((page) => page.id), [readyPages])
  const rawUrls = useRawPageUrls(pageIds)

  const [items, setItems] = useState<TlItem[]>([])
  const [suggestions, setSuggestions] = useState<Map<string, TlSuggestion[]>>(new Map())
  const [glossary, setGlossary] = useState<TlGlossaryTerm[]>([])
  // Overflow must be measured with the real font; a result measured with a fallback changed once loaded.
  const [fontsReady, setFontsReady] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [filter, setFilter] = useState<ReviewFilter>('oneri')
  const [focusId, setFocusId] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [bulkBusy, setBulkBusy] = useState(false)
  const [lastBulk, setLastBulk] = useState<Array<{ id: string, status: TlTextStatus }> | null>(null)
  const itemsRef = useRef(items)
  itemsRef.current = items
  const inflight = useRef(0)
  const rowRefs = useRef(new Map<string, HTMLDivElement>())
  const textRefs = useRef(new Map<string, HTMLTextAreaElement>())

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setLoadError(null)
    void (async () => {
      try {
        const loaded = await loadProjectItems(pageIds, LANGUAGE, controller.signal)
        if (controller.signal.aborted) return
        setItems(loaded)
        const widths = new Map(readyPages.map((page) => [page.id, page.width ?? 1]))
        void Promise.allSettled([...new Set(widths.values())].map((width) => ensureFonts(loaded.filter((item) => widths.get(item.pageId) === width), width, LANGUAGE)))
          .then(() => { if (!controller.signal.aborted) setFontsReady((value) => value + 1) })
        const map = new Map<string, TlSuggestion[]>()
        // Oneriler parca parca: uzun IN listesi URL sinirini asmasin.
        for (let index = 0; index < loaded.length; index += 150) {
          const chunk = await loadSuggestions(loaded.slice(index, index + 150).map((item) => item.id), LANGUAGE, controller.signal)
          for (const entry of chunk) map.set(entry.itemId, [...(map.get(entry.itemId) ?? []), entry])
        }
        if (!controller.signal.aborted) setSuggestions(map)
      } catch (error) {
        if (!controller.signal.aborted) setLoadError(toUserFacingErrorMessage(error, txa('Bölüm öğeleri yüklenemedi.')))
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    })()
    return () => controller.abort()
  // readyPages pageIds ile birlikte degisir.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageIds])

  useEffect(() => {
    const controller = new AbortController()
    loadGlossary(project.fansubId, project.mangaId, project.sourceLanguage, controller.signal).then(setGlossary).catch(() => setGlossary([]))
    return () => controller.abort()
  }, [project.fansubId, project.mangaId, project.sourceLanguage])

  const issuesById = useMemo(() => {
    const map = new Map<string, ReviewIssue[]>()
    if (!fontsReady) return map
    for (const item of items) {
      const width = pageById.get(item.pageId)?.page.width ?? 1
      const issues = reviewIssues(item, width, glossary)
      if (issues.length) map.set(item.id, issues)
    }
    return map
  }, [fontsReady, glossary, items, pageById])

  const visible = useMemo(() => items.filter((item) => {
    if (filter === 'hepsi') return true
    if (filter === 'sorun') return issuesById.has(item.id)
    return item.status === filter
  }), [filter, issuesById, items])

  const counts = useMemo(() => ({
    hepsi: items.length,
    oneri: items.filter((item) => item.status === 'oneri').length,
    eksik: items.filter((item) => item.status === 'eksik').length,
    onayli: items.filter((item) => item.status === 'onayli').length,
    sorun: issuesById.size,
  }), [issuesById, items])

  const track = useCallback(async <T,>(work: () => Promise<T>) => {
    inflight.current += 1
    onSaveState('saving')
    try {
      return await work()
    } finally {
      inflight.current -= 1
      if (inflight.current === 0) onSaveState('saved')
    }
  }, [onSaveState])

  /** Saves text and status with version control; on conflict loads the current state. */
  const saveText = useCallback(async (itemId: string, text: string, status: TlTextStatus) => {
    const item = itemsRef.current.find((entry) => entry.id === itemId)
    if (!item) return false
    try {
      const version = await track(() => saveHumanText(item, LANGUAGE, text, status))
      const nextStatus: TlTextStatus = text.trim() ? status : 'eksik'
      setItems((current) => current.map((entry) => (entry.id === itemId
        ? { ...entry, text, status: nextStatus, textVersion: version, textOrigin: 'human' }
        : entry)))
      setDrafts((current) => { const next = { ...current }; delete next[itemId]; return next })
      return true
    } catch (error) {
      onSaveState('error')
      if (error instanceof TlConflictError) {
        const fresh = await loadItem(itemId, LANGUAGE).catch(() => null)
        if (fresh) setItems((current) => current.map((entry) => (entry.id === itemId ? fresh : entry)))
        onToast(txa('Bu öğe başka bir yerde değişti; güncel hali yüklendi.'))
      } else {
        onToast(toUserFacingErrorMessage(error, txa('Çeviri kaydedilemedi.')))
      }
      return false
    }
  }, [onSaveState, onToast, track])

  const focusNext = useCallback((fromId: string | null, step = 1) => {
    const index = visible.findIndex((item) => item.id === fromId)
    const next = visible[Math.max(0, Math.min(visible.length - 1, index + step))]
    if (!next) return
    setFocusId(next.id)
    rowRefs.current.get(next.id)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [visible])

  const approve = useCallback(async (itemId: string) => {
    const item = itemsRef.current.find((entry) => entry.id === itemId)
    if (!item) return
    const text = drafts[itemId] ?? item.text
    if (!text.trim()) { onToast(txa('Boş çeviri onaylanamaz')); return }
    setLastBulk(null)
    // In the "Suggestion" filter an approved row leaves the list; focus moves to the next.
    const after = visible[visible.findIndex((entry) => entry.id === itemId) + 1] ?? null
    if (await saveText(itemId, text, 'onayli')) {
      if (after) { setFocusId(after.id); rowRefs.current.get(after.id)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) }
    }
  }, [drafts, onToast, saveText, visible])

  /** Gorunen onerileri (bos olmayan) onaylar; 4'erli paralel. */
  const approveVisible = useCallback(async () => {
    const targets = visible.filter((item) => item.status === 'oneri' && (drafts[item.id] ?? item.text).trim())
    if (!targets.length) return
    setBulkBusy(true)
    const done: Array<{ id: string, status: TlTextStatus }> = []
    let cursor = 0
    const worker = async () => {
      while (cursor < targets.length) {
        const item = targets[cursor++]
        if (await saveText(item.id, drafts[item.id] ?? item.text, 'onayli')) done.push({ id: item.id, status: item.status })
      }
    }
    await Promise.all([worker(), worker(), worker(), worker()])
    setBulkBusy(false)
    setLastBulk(done)
    onToast(txa('{v1} öneri onaylandı', { v1: done.length }))
  }, [drafts, onToast, saveText, visible])

  const undoBulk = useCallback(async () => {
    if (!lastBulk?.length) return
    setBulkBusy(true)
    for (const entry of lastBulk) {
      const item = itemsRef.current.find((candidate) => candidate.id === entry.id)
      if (item) await saveText(item.id, item.text, entry.status)
    }
    setBulkBusy(false)
    setLastBulk(null)
    onToast(txa('Toplu onay geri alındı'))
  }, [lastBulk, onToast, saveText])

  // Kisayollar: J/K ya da ok tuslari gezin, Enter onayla, E duzenle, 1-3 oneri sec, O editorde ac.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const typing = target?.tagName === 'TEXTAREA' || target?.tagName === 'INPUT'
      if (typing) {
        if (event.key === 'Escape') { (target as HTMLElement).blur(); return }
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && focusId) { event.preventDefault(); void approve(focusId) }
        return
      }
      if (event.ctrlKey || event.metaKey || event.altKey) return
      const key = event.key.toLowerCase()
      // Odakli dugmede Enter dugmenin kendisine aittir.
      if (key === 'enter' && target?.tagName === 'BUTTON') return
      if (key === 'arrowdown' || key === 'j') { event.preventDefault(); focusNext(focusId, 1); return }
      if (key === 'arrowup' || key === 'k') { event.preventDefault(); focusNext(focusId, -1); return }
      if (!focusId) return
      if (!canEdit && key !== 'o') return
      if (key === 'enter' || key === 'a') { event.preventDefault(); void approve(focusId); return }
      if (key === 'e') { event.preventDefault(); textRefs.current.get(focusId)?.focus(); return }
      if (key === 'o') { const entry = itemsRef.current.find((item) => item.id === focusId); const at = entry ? pageById.get(entry.pageId) : null; if (at) onOpenPage(at.index); return }
      if (/^[1-3]$/.test(key)) {
        const pick = suggestions.get(focusId)?.[Number(key) - 1]
        if (pick) { event.preventDefault(); setDrafts((current) => ({ ...current, [focusId]: pick.text })) }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [approve, canEdit, focusId, focusNext, onOpenPage, pageById, suggestions])

  useEffect(() => {
    if (!focusId || !visible.some((item) => item.id === focusId)) setFocusId(visible[0]?.id ?? null)
  }, [focusId, visible])

  if (loading) return <div className='flex flex-1 items-center justify-center text-sm font-semibold text-[var(--tl-mut)]'>{txa('Bölüm öğeleri yükleniyor…')}</div>
  if (loadError) return <div className='flex flex-1 items-center justify-center text-sm font-semibold text-[var(--tl-red)]'>{loadError}</div>

  const pendingInView = visible.filter((item) => item.status === 'oneri' && (drafts[item.id] ?? item.text).trim()).length
  const progress = items.length ? counts.onayli / items.length : 0

  return (
    <div className='flex min-h-0 flex-1 flex-col' data-testid='tl-review'>
      <div className='flex flex-none flex-wrap items-center gap-3 border-b border-[var(--tl-line)] bg-[var(--tl-sb)] px-5 py-3'>
        <div className='flex flex-wrap gap-1.5'>
          {FILTERS.map((entry) => (
            <button
              key={entry.key}
              type='button'
              onClick={() => setFilter(entry.key)}
              className={cn(
                'flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-bold',
                filter === entry.key ? 'border-[var(--tl-p35)] bg-[var(--tl-p15)] text-[var(--tl-p)]' : 'border-[var(--tl-line)] bg-transparent text-[var(--tl-mut)]',
              )}
              data-testid={`tl-review-filter-${entry.key}`}
            >
              {entry.label}
              <span className='text-[11px] opacity-75'>{counts[entry.key]}</span>
            </button>
          ))}
        </div>
        <div className='flex min-w-[180px] flex-1 items-center gap-2.5'>
          <ProgressBar value={progress} color='var(--tl-green)' className='flex-1' />
          <span className='whitespace-nowrap text-xs font-bold text-[var(--tl-fg2)]'>{txa('{v1} / {v2} onaylı', { v1: counts.onayli, v2: items.length })}</span>
        </div>
        {lastBulk && lastBulk.length > 0 && (
          <button type='button' disabled={bulkBusy} onClick={() => { void undoBulk() }} className='h-8 rounded-lg border border-[var(--tl-line)] bg-transparent px-3 text-xs font-bold text-[var(--tl-fg2)] disabled:opacity-45' data-testid='tl-review-undo'>
            {txa('Toplu onayı geri al ({v1})', { v1: lastBulk.length })}
          </button>
        )}
        <button
          type='button'
          disabled={!canEdit || bulkBusy || pendingInView === 0}
          onClick={() => { void approveVisible() }}
          className='flex h-8 items-center gap-1.5 rounded-lg border-0 bg-[var(--tl-p)] px-3.5 text-xs font-extrabold text-[var(--tl-pfg)] disabled:opacity-45'
          data-testid='tl-review-approve-all'
        >
          <CheckCircle weight='bold' size={14} />
          {bulkBusy ? txa('Onaylanıyor…') : txa('Görünen önerileri onayla ({v1})', { v1: pendingInView })}
        </button>
      </div>

      <div className='min-h-0 flex-1 overflow-y-auto px-5 py-4'>
        {visible.length === 0 && (
          <div className='flex flex-col items-center gap-2 py-16 text-center text-[var(--tl-mut)]'>
            <CheckCircle weight='fill' size={30} className='text-[var(--tl-green)]' />
            <span className='text-sm font-semibold'>{filter === 'oneri' ? txa('Onay bekleyen öneri kalmadı.') : txa('Bu filtrede öğe yok.')}</span>
          </div>
        )}
        <div className='mx-auto flex max-w-[1180px] flex-col gap-2'>
          {visible.map((item) => {
            const at = pageById.get(item.pageId)
            if (!at) return null
            const focused = item.id === focusId
            const draft = drafts[item.id]
            const text = draft ?? item.text
            const issues = issuesById.get(item.id) ?? []
            const status = STATUS_META[item.status]
            const options = suggestions.get(item.id) ?? []
            return (
              <div
                key={item.id}
                ref={(node) => { if (node) rowRefs.current.set(item.id, node); else rowRefs.current.delete(item.id) }}
                onClick={() => setFocusId(item.id)}
                className={cn(
                  'flex gap-4 rounded-xl border p-3 [content-visibility:auto] [contain-intrinsic-size:auto_150px]',
                  focused ? 'border-[var(--tl-p35)] bg-[var(--tl-p15)]' : 'border-[var(--tl-line)] bg-[var(--tl-card)]',
                )}
                data-testid='tl-review-row'
                data-status={item.status}
              >
                <Crop url={rawUrls[item.pageId]} page={at.page} item={item} />
                <div className='flex w-[250px] flex-none flex-col gap-1.5'>
                  <span className='flex items-center gap-2 text-[11.5px] font-bold text-[var(--tl-mut)]'>
                    {txa('Sayfa {v1} · {v2}', { v1: at.index + 1, v2: item.readingOrder + 1 })}
                    <span style={{ color: TYPE_META[item.type].color }}>{TYPE_META[item.type].label}</span>
                  </span>
                  <span className='whitespace-pre-wrap text-[13.5px] leading-snug text-[var(--tl-fg2)]'>{item.sourceText || '—'}</span>
                </div>
                <div className='flex min-w-0 flex-1 flex-col gap-1.5'>
                  <textarea
                    ref={(node) => { if (node) textRefs.current.set(item.id, node); else textRefs.current.delete(item.id) }}
                    value={text}
                    readOnly={!canEdit}
                    rows={Math.min(5, Math.max(2, text.split('\n').length))}
                    onFocus={() => setFocusId(item.id)}
                    onChange={(event) => { const value = event.target.value; setDrafts((current) => ({ ...current, [item.id]: value })) }}
                    onBlur={() => { if (draft !== undefined && draft !== item.text) void saveText(item.id, draft, item.status === 'onayli' ? 'onayli' : 'oneri') }}
                    placeholder={txa('Çeviri yok')}
                    className='w-full resize-none rounded-lg border border-[var(--tl-line)] bg-[var(--tl-bg)] px-3 py-2 text-[14px] leading-snug text-[var(--tl-fg)] outline-none focus:border-[var(--tl-p35)]'
                    data-testid='tl-review-text'
                  />
                  {options.length > 0 && (
                    <div className='flex flex-wrap gap-1.5'>
                      {options.slice(0, 3).map((option, index) => (
                        <button
                          key={`${option.rank}-${index}`}
                          type='button'
                          disabled={!canEdit}
                          onClick={(event) => { event.stopPropagation(); setFocusId(item.id); setDrafts((current) => ({ ...current, [item.id]: option.text })) }}
                          className={cn('max-w-full truncate rounded-md border px-2 py-1 text-left text-[12px]', option.text === text ? 'border-[var(--tl-p35)] text-[var(--tl-p)]' : 'border-[var(--tl-line)] text-[var(--tl-fg2)]')}
                          title={`${option.provider} · ${option.model}`}
                        >
                          <span className='mr-1 font-bold text-[var(--tl-mut)]'>{index + 1}</span>{option.text}
                        </button>
                      ))}
                    </div>
                  )}
                  {issues.length > 0 && (
                    <div className='flex flex-wrap gap-1.5'>
                      {issues.map((issue) => (
                        <span key={issue.message} className='flex items-center gap-1 rounded-full bg-[var(--tl-amber)]/15 px-2 py-0.5 text-[11px] font-bold text-[var(--tl-amber)]' data-testid='tl-review-issue'>
                          <Warning weight='bold' size={11} />
                          {issue.message}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className='flex w-[132px] flex-none flex-col items-end justify-between gap-2'>
                  <span className='flex items-center gap-[5px] text-[11.5px] font-bold' style={{ color: status.color }}>
                    <span className='h-1.5 w-1.5 rounded-full' style={{ background: status.color }} />
                    {draft !== undefined && draft !== item.text ? txa('Düzenlendi') : status.label}
                  </span>
                  <div className='flex gap-1.5'>
                    <button type='button' title={txa('Editörde aç (O)')} onClick={(event) => { event.stopPropagation(); onOpenPage(at.index) }} className='flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--tl-line)] bg-transparent text-[var(--tl-mut)] hover:text-[var(--tl-fg)]'>
                      <ArrowSquareOut weight='bold' size={14} />
                    </button>
                    <button
                      type='button'
                      disabled={!canEdit || !text.trim() || (item.status === 'onayli' && draft === undefined)}
                      onClick={(event) => { event.stopPropagation(); void approve(item.id) }}
                      className='flex h-8 items-center gap-1 rounded-lg border-0 bg-[var(--tl-green)] px-2.5 text-xs font-extrabold text-[var(--tl-pfg)] disabled:opacity-40'
                      title={txa('Onayla (Enter · yazarken Ctrl+Enter)')}
                      data-testid='tl-review-approve'
                    >
                      <Check weight='bold' size={13} />
                      {txa('Onayla')}
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
      <div className='flex h-9 flex-none items-center gap-4 border-t border-[var(--tl-line)] bg-[var(--tl-sb)] px-5 text-[11.5px] font-semibold text-[var(--tl-mut)]'>
        <span>{txa('↑↓ / J K gezin')}</span><span>{txa('Enter onayla')}</span><span>{txa('E düzenle · Ctrl+Enter kaydet ve onayla')}</span><span>{txa('1–3 öneri seç')}</span><span>{txa('O editörde aç')}</span>
      </div>
    </div>
  )
}
