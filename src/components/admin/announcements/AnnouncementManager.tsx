import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useLocation } from 'react-router-dom'
import { useNavigate } from '@/i18n/router'
import {
  CalendarClock, ChevronLeft, ChevronRight, FileEdit, Inbox, Loader2, Megaphone, Plus, RadioTower, RefreshCw, Search, Trash2,
  TimerOff, Archive, type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { AdminSectionHeader } from '@/components/admin/shared/AdminSectionHeader'
import { focusSheetContainer, useDeskLayout } from '@/components/admin/shared/useDeskLayout'
import { cn } from '@/lib/utils'
import {
  audienceLabels,
  kindLabels,
  listAdminAnnouncementOverview,
  transitionAnnouncement,
  type AdminAnnouncementV2,
  type AnnouncementAdminState,
  type AnnouncementStateCounts,
} from '@/services/announcementV2'
import { toast } from '@/services/toastService'
import { AnnouncementDetailPane, type AnnouncementTransition } from './AnnouncementDetailPane'
import { AnnouncementEditor } from './AnnouncementEditor'
import { AnnouncementReport } from './AnnouncementReport'
import { KIND_ICON, STATE_META, announcementStateOf, shortAnnouncementDate } from './announcementAdminUtils'
import { intlLocale, txa } from '@/i18n/activeLocale'

const PAGE_SIZE = 20

/** Summary strip = view; status is calculated on the server (an expired post does not count as "Live"). */
const VIEWS: Array<{ id: AnnouncementAdminState, label: string, icon: LucideIcon, tone: string }> = [
  { id: 'all', get label() { return txa('Tümü') }, icon: Megaphone, tone: 'bg-primary/10 text-primary' },
  { id: 'live', get label() { return txa('Yayında') }, icon: RadioTower, tone: 'bg-emerald-500/10 text-emerald-500' },
  { id: 'scheduled', get label() { return txa('Planlandı') }, icon: CalendarClock, tone: 'bg-sky-500/10 text-sky-500' },
  { id: 'ended', get label() { return txa('Sona erdi') }, icon: TimerOff, tone: 'bg-muted text-muted-foreground' },
  { id: 'draft', get label() { return txa('Taslak') }, icon: FileEdit, tone: 'bg-amber-500/10 text-amber-500' },
  { id: 'archived', get label() { return txa('Arşiv') }, icon: Archive, tone: 'bg-muted text-muted-foreground' },
  { id: 'deleted', get label() { return txa('Çöp kutusu') }, icon: Trash2, tone: 'bg-rose-500/10 text-rose-500' },
]

const EMPTY_COUNTS: AnnouncementStateCounts = { live: 0, scheduled: 0, ended: 0, draft: 0, archived: 0, deleted: 0 }

const TRANSITION_TOAST: Record<AnnouncementTransition | 'delete', string> = {
  get draft() { return txa('Duyuru taslağa alındı.') },
  get published() { return txa('Duyuru yayımlandı / planlandı.') },
  get archived() { return txa('Duyuru arşivlendi.') },
  get restore() { return txa('Duyuru taslak olarak geri alındı.') },
  get delete() { return txa('Duyuru çöp kutusuna taşındı.') },
}

/**
 * Announcements v2: announcement desk. The strip shows and filters computed publish status
 * (Live / Scheduled / Ended / Draft / Archive / Trash);
 * a paged list on the left, the reader's preview, engagement and
 * settings on the right. Writing and editing are in the large editor window.
 */
export function AnnouncementManager() {
  const location = useLocation()
  const navigate = useNavigate()
  const desk = useDeskLayout()
  const [rows, setRows] = useState<AdminAnnouncementV2[]>([])
  const [total, setTotal] = useState(0)
  const [counts, setCounts] = useState<AnnouncementStateCounts>(EMPTY_COUNTS)
  const [state, setState] = useState<AnnouncementAdminState>('all')
  const [draftQuery, setDraftQuery] = useState('')
  const [query, setQuery] = useState('')
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [reportId, setReportId] = useState<string | null>(null)
  const [editing, setEditing] = useState<AdminAnnouncementV2 | 'new' | null>(null)
  const [trashTarget, setTrashTarget] = useState<AdminAnnouncementV2 | null>(null)
  const lastIndexRef = useRef(0)
  const listRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    if (location.hash === '#editor') setEditing('new')
    if (location.hash === '#yayin-akisi') { setState('all'); setOffset(0) }
  }, [location.hash])

  useEffect(() => {
    const timer = setTimeout(() => setQuery(draftQuery.trim()), 300)
    return () => clearTimeout(timer)
  }, [draftQuery])

  useEffect(() => { setOffset(0) }, [state, query])

  const refresh = useCallback(() => setRevision((value) => value + 1), [])

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError('')
    listAdminAnnouncementOverview(state, query, offset, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return
        // Avoid an empty page when the last record on the last page moves.
        if (!data.items.length && offset > 0) { setOffset(Math.max(0, Math.ceil(data.total / PAGE_SIZE) - 1) * PAGE_SIZE); return }
        setRows(data.items)
        setTotal(data.total)
        setCounts(data.counts)
      })
      .catch(() => { if (!controller.signal.aborted) setError(txa('Duyurular alınamadı.')) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [state, query, offset, revision])

  const selected = rows.find((row) => row.id === selectedId) ?? null
  const allCount = counts.live + counts.scheduled + counts.ended + counts.draft + counts.archived
  const valueOf = (id: AnnouncementAdminState) => (id === 'all' ? allCount : counts[id])

  // On desktop a selection always exists: when the selected announcement leaves the view, the same position opens.
  useEffect(() => {
    if (selected) {
      lastIndexRef.current = rows.indexOf(selected)
      return
    }
    if (!desk || loading) return
    const next = rows[Math.min(lastIndexRef.current, rows.length - 1)]
    setSelectedId(next ? next.id : null)
  }, [desk, loading, rows, selected])

  useEffect(() => {
    listRef.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [selectedId])

  const select = (row: AdminAnnouncementV2) => {
    setSelectedId(row.id)
    if (!desk) setSheetOpen(true)
  }

  const handleListKey = (event: KeyboardEvent<HTMLUListElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    const index = selected ? rows.indexOf(selected) : -1
    const next = rows[Math.max(0, Math.min(rows.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))]
    if (!next) return
    setSelectedId(next.id)
    requestAnimationFrame(() => listRef.current?.querySelector<HTMLButtonElement>(`[data-announcement-id="${next.id}"]`)?.focus())
  }

  const runTransition = async (item: AdminAnnouncementV2, action: AnnouncementTransition | 'delete') => {
    if (busy) return
    setBusy(true)
    try {
      await transitionAnnouncement(item, action)
      toast.success(TRANSITION_TOAST[action])
      setTrashTarget(null)
      refresh()
    } catch (reason) {
      toast.error(reason instanceof Error ? txa(reason.message) : txa('İşlem tamamlanamadı.'))
    } finally {
      setBusy(false)
    }
  }

  const closeEditor = () => {
    setEditing(null)
    if (location.hash === '#editor') navigate({ pathname: location.pathname, hash: '#yayin-akisi' }, { replace: true })
  }

  const detail = selected ? (
    <AnnouncementDetailPane
      item={selected}
      layout={desk ? 'desk' : 'sheet'}
      busy={busy}
      onEdit={() => setEditing(selected)}
      onReport={() => setReportId(selected.id)}
      onTransition={(action) => { void runTransition(selected, action) }}
      onRequestDelete={() => setTrashTarget(selected)}
    />
  ) : null

  return (
    <section className="flex flex-col gap-4 xl:min-h-0 xl:flex-1" data-testid="admin-announcements">
      <AdminSectionHeader
        title={txa('Duyurular')}
        description={txa('Haberler, sistem duyuruları, ödüller ve davetler: yayın, planlama ve etkileşim.')}
        actions={(
          <>
            <Button variant="outline" size="sm" className="h-9 gap-1.5 rounded-full px-3.5" disabled={loading} onClick={refresh}><RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />{txa('Yenile')}</Button>
            <Button size="sm" className="h-9 gap-1.5 rounded-full px-3.5" onClick={() => setEditing('new')} data-testid="admin-announcements-new"><Plus className="size-4" />{txa('Yeni duyuru')}</Button>
          </>
        )}
      />

      <section className="overflow-hidden rounded-[20px] border border-border/70 bg-card/60" aria-label={txa('Duyuru özeti')}>
        <div className="-mb-px -mr-px grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 [&>*]:border-b [&>*]:border-r [&>*]:border-border/60">
          {VIEWS.map((view) => {
            const active = state === view.id
            return (
              <button key={view.id} type="button" aria-pressed={active} onClick={() => setState(view.id)} data-testid={`admin-announcements-view-${view.id}`} className={cn('relative flex items-center gap-2.5 px-3.5 py-3 text-left transition-colors', active ? 'bg-primary/[0.07]' : 'hover:bg-muted/40')}>
                <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-xl', view.tone)}><view.icon className="size-4" /></span>
                <span className="min-w-0">
                  <span className="block truncate text-[11.5px] font-semibold text-muted-foreground">{view.label}</span>
                  <span className="block text-[19px] font-black leading-tight tabular-nums">{valueOf(view.id).toLocaleString(intlLocale())}</span>
                </span>
                <span className={cn('pointer-events-none absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-primary transition-transform', active ? 'scale-x-100' : 'scale-x-0')} aria-hidden="true" />
              </button>
            )
          })}
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={draftQuery} onChange={(event) => setDraftQuery(event.target.value)} maxLength={80} placeholder={txa('Başlıkta ara')} aria-label={txa('Duyurularda ara')} className="h-9 pl-9 text-[13px]" />
        </div>
        <span className="text-[12px] tabular-nums text-muted-foreground">{loading ? txa('Yükleniyor…') : txa('{v1} duyuru', { v1: total.toLocaleString(intlLocale()) })}</span>
      </div>

      {error ? <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-[13px] text-destructive">{txa('{v1} Yenile ile tekrar deneyebilirsin.', { v1: error })}</p> : null}

      {/* Masada (xl) izgara kalan yuksekligi doldurur; liste ve ayrinti kendi icinde kayar. */}
      <div className="grid items-start gap-4 xl:min-h-0 xl:flex-1 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)] xl:grid-rows-[minmax(0,1fr)]" data-testid="admin-announcements-desk">
        <div className="flex min-w-0 flex-col overflow-hidden rounded-[20px] border border-border/70 bg-card/60 xl:max-h-full" aria-busy={loading}>
          {loading && !rows.length ? (
            <div className="flex flex-col gap-2 p-4">{[0, 1, 2, 3].map((index) => <div key={index} className="h-14 animate-pulse rounded-xl bg-muted/40" />)}</div>
          ) : !rows.length ? (
            <div className="flex flex-col items-center gap-2 px-6 py-12 text-center" data-testid="admin-announcements-empty">
              <span className="text-[13px] font-semibold">{query ? txa('Aramaya uyan duyuru yok') : txa('Bu görünümde duyuru yok')}</span>
              {state === 'all' && !query ? <Button size="sm" variant="outline" className="h-8 rounded-full text-[12px]" onClick={() => setEditing('new')}>{txa('İlk duyuruyu yaz')}</Button> : null}
            </div>
          ) : (
            <ul className={cn('min-h-0 divide-y divide-border/50 overflow-y-auto transition-opacity', loading && 'opacity-60')} aria-label={txa('Duyurular')} onKeyDown={handleListKey} ref={listRef} data-testid="admin-announcements-list">
              {rows.map((row) => {
                const active = row.id === selectedId
                const rowState = announcementStateOf(row)
                const Icon = KIND_ICON[row.kind]
                return (
                  <li key={row.id}>
                    <button
                      type="button"
                      onClick={() => select(row)}
                      aria-current={active ? 'true' : undefined}
                      data-announcement-id={row.id}
                      data-testid={`admin-announcements-row-${row.id}`}
                      className={cn('relative flex w-full items-center gap-3 px-4 py-2.5 text-left outline-none transition-colors hover:bg-muted/40 focus-visible:bg-muted/50', active && 'bg-primary/[0.08] before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-primary')}
                    >
                      <span className={cn('size-2 shrink-0 rounded-full', STATE_META[rowState].dot)} title={STATE_META[rowState].label} role="img" aria-label={STATE_META[rowState].label} />
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted/70 text-muted-foreground"><Icon className="size-4" /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-semibold text-foreground">{row.title}</span>
                        <span className="mt-0.5 block truncate text-[11.5px] text-muted-foreground">
                          {kindLabels[row.kind]} · {audienceLabels[row.audience]} · {STATE_META[rowState].label.toLocaleLowerCase(intlLocale())}
                        </span>
                      </span>
                      <span className="shrink-0 self-start pt-0.5 text-right text-[11px] tabular-nums text-muted-foreground">
                        {shortAnnouncementDate(row.starts_at)}
                        <span className="block">{txa('{v1} tık', { v1: row.clicks.toLocaleString(intlLocale()) })}</span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          {total > PAGE_SIZE ? (
            <footer className="flex items-center justify-between gap-2 border-t border-border/60 px-4 py-2 text-[12px] text-muted-foreground">
              <span className="tabular-nums">{offset + 1}–{Math.min(total, offset + PAGE_SIZE)} / {total.toLocaleString(intlLocale())}</span>
              <span className="flex gap-1">
                <Button size="icon-sm" variant="ghost" aria-label={txa('Önceki sayfa')} disabled={loading || offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}><ChevronLeft className="size-4" /></Button>
                <Button size="icon-sm" variant="ghost" aria-label={txa('Sonraki sayfa')} disabled={loading || offset + PAGE_SIZE >= total} onClick={() => setOffset(offset + PAGE_SIZE)}><ChevronRight className="size-4" /></Button>
              </span>
            </footer>
          ) : null}
        </div>

        {desk ? (detail ?? (
          <div className="flex flex-col items-center gap-2 rounded-[20px] border border-dashed border-border/80 px-6 py-16 text-center text-[12.5px] text-muted-foreground">
            <Inbox className="size-5" />{txa('Soldan bir duyuru seç.')}
          </div>
        )) : null}
      </div>

      {!desk ? (
        <Sheet open={sheetOpen && Boolean(selected)} onOpenChange={setSheetOpen}>
          <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-[600px]" onOpenAutoFocus={focusSheetContainer}>
            <SheetTitle className="sr-only">{selected?.title ?? txa('Duyuru ayrıntısı')}</SheetTitle>
            <SheetDescription className="sr-only">{txa('Duyurunun önizlemesi, etkileşimi ve ayarları.')}</SheetDescription>
            {detail}
          </SheetContent>
        </Sheet>
      ) : null}

      <Dialog open={Boolean(trashTarget)} onOpenChange={(open) => { if (!open && !busy) setTrashTarget(null) }}>
        <DialogContent className="max-w-[calc(100vw-2rem)] grid-cols-[minmax(0,1fr)] gap-0 p-0 sm:max-w-[460px]" data-testid="admin-announcements-delete-dialog">
          <DialogHeader className="px-6 pb-3 pt-5 text-left">
            <DialogTitle>{txa('Duyuruyu çöp kutusuna taşı')}</DialogTitle>
            <DialogDescription className="line-clamp-2 [overflow-wrap:anywhere]">{trashTarget?.title}</DialogDescription>
          </DialogHeader>
          <p className="mx-6 mb-5 rounded-xl bg-muted/60 px-3.5 py-2.5 text-[12.5px] text-muted-foreground">
            {txa('Duyuru yayından kalkar ve çöp kutusuna taşınır. Verilmiş ödüller ve davet yanıtları korunur; istediğinde Çöp kutusu görünümünden geri alabilirsin.')}
          </p>
          <DialogFooter className="border-t border-border/60 px-6 py-3">
            <Button variant="ghost" disabled={busy} onClick={() => setTrashTarget(null)}>{txa('Vazgeç')}</Button>
            <Button variant="destructive" disabled={busy} onClick={() => { if (trashTarget) void runTransition(trashTarget, 'delete') }} data-testid="admin-announcements-delete-confirm">
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}{txa('Çöp kutusuna taşı')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {reportId ? <AnnouncementReport id={reportId} onClose={() => setReportId(null)} /> : null}
      {editing ? <AnnouncementEditor initial={editing === 'new' ? null : editing} onClose={closeEditor} onSaved={refresh} /> : null}
    </section>
  )
}
