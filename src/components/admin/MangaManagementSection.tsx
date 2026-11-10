import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import {
  AlertTriangle, Check, ChevronLeft, ChevronRight, CircleSlash, ClipboardCheck, EyeOff, Inbox, Library, RefreshCw, Search,
  X, type LucideIcon,
} from 'lucide-react'
import {
  clearAdminMangaControlOverviewCache,
  getAdminMangaControlOverview,
  invalidateAdminMangaControlDetailCache,
  listAdminMangasPage,
  setAdminMangaActive,
  setAdminMangaApproved,
  setAdminMangaStatus,
  type AdminMangaControlItem,
  type AdminMangaControlOverview,
  type AdminMangaControlView,
  type AdminMangaStatusFilter,
} from '@/services/adminService'
import { toast } from '@/services/toastService'
import { AdminSectionHeader } from '@/components/admin/shared/AdminSectionHeader'
import { focusSheetContainer, useDeskLayout } from '@/components/admin/shared/useDeskLayout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import MangaDetailControlModal, { type MangaDetailTab } from './manga-control/MangaDetailControlModal'
import { useMangaDetailControl } from './mangaManagement/useMangaDetailControl'
import { MANGAS_PER_PAGE, STATUS_OPTIONS, errText, mangaMissingMeta, mangaRelativeAge, pageCount, statusText } from './mangaManagement/mangaManagementUtils'
import { DEFAULT_MANGA_CONTROL_VIEW } from './mangaManagement/mangaControlViews'
import { ContentRevisionsPanel } from './mangaManagement/ContentRevisionsPanel'
import { AdminConfirmDialog, type AdminConfirmRequest } from '@/components/admin/shared/AdminConfirmDialog'
import { MangaCover, MangaDetailPane, MangaTag } from './mangaManagement/MangaDetailPane'
import { intlLocale, txa } from '@/i18n/activeLocale'

/**
 * Summary strip = view: each cell shows a count from the SERVER summary and
 * opens its own view preset (presets go to the server query). "Series without a fansub"
 * is deliberately absent: manga is a shared catalog with no ownership.
 */
const VIEWS: Array<{ id: AdminMangaControlView, label: string, icon: LucideIcon, tone: string, count: (o: AdminMangaControlOverview) => number }> = [
  { id: 'all', get label() { return txa('Tüm seriler') }, icon: Library, tone: 'bg-primary/10 text-primary', count: (o) => o.total },
  { id: 'pending', get label() { return txa('Seri onayı') }, icon: Check, tone: 'bg-amber-500/10 text-amber-500', count: (o) => o.pending },
  { id: 'pending-chapters', get label() { return txa('Bölüm incelemesi') }, icon: ClipboardCheck, tone: 'bg-sky-500/10 text-sky-500', count: (o) => o.pendingChapterSeries },
  { id: 'without-chapters', get label() { return txa('Bölümsüz') }, icon: CircleSlash, tone: 'bg-muted text-muted-foreground', count: (o) => o.withoutChapters },
  { id: 'incomplete-meta', get label() { return txa('Eksik künye') }, icon: AlertTriangle, tone: 'bg-violet-500/10 text-violet-500', count: (o) => o.incompleteMeta },
  { id: 'inactive', get label() { return txa('Yayında değil') }, icon: EyeOff, tone: 'bg-rose-500/10 text-rose-500', count: (o) => o.inactive },
]

type MangaStatus = 'ongoing' | 'completed' | 'hiatus'

function Tick({ checked, onChange, label }: { checked: boolean, onChange: (checked: boolean) => void, label: string }) {
  return <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} aria-label={label} className="size-4 shrink-0 cursor-pointer rounded border-border accent-primary" />
}

/**
 * Manga v2: series desk. The list is paged and filtered on the server
 * (listAdminMangasPage); the selected series on the right, in a drawer on narrow screens. Approval and
 * unpublishing pass a dialog stating the result; chapter review, details
 * and comment / rating moderation are in a detail management window.
 */
function MangaManagementSection() {
  const desk = useDeskLayout()
  const [workspace, setWorkspace] = useState<'series' | 'revisions'>('series')
  const [mangas, setMangas] = useState<AdminMangaControlItem[]>([])
  const [total, setTotal] = useState(0)
  const [overview, setOverview] = useState<AdminMangaControlOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [activeView, setActiveView] = useState<AdminMangaControlView>(DEFAULT_MANGA_CONTROL_VIEW)
  const [status, setStatus] = useState<AdminMangaStatusFilter>('all')
  const [page, setPage] = useState(1)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [confirm, setConfirm] = useState<AdminConfirmRequest | null>(null)
  const [confirmBusy, setConfirmBusy] = useState(false)
  const lastIndexRef = useRef(0)
  const listRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    setPage(1)
    setSelectedIds(new Set())
  }, [search, status, activeView])

  const patchMangaInList = useCallback((mangaId: string, patch: Partial<AdminMangaControlItem>) => {
    setMangas((prev) => prev.map((item) => (item.id === mangaId ? { ...item, ...patch } : item)))
  }, [])

  const detailControl = useMangaDetailControl({ patchMangaInList })

  const loadMangas = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setError(null)
    try {
      const result = await listAdminMangasPage({ page, limit: MANGAS_PER_PAGE, search, visibility: 'all', approval: 'all', status, view: activeView })
      setMangas(result.data)
      setTotal(result.count)
      return true
    } catch (loadError) {
      if (!silent) {
        setMangas([])
        setTotal(0)
        setError(errText(loadError, txa('Seriler yüklenemedi.')))
      }
      return false
    } finally {
      if (!silent) setLoading(false)
    }
  }, [activeView, page, search, status])

  /** The summary comes from the SERVER, not the visible page. */
  const loadOverview = useCallback(async (silent = false) => {
    try {
      setOverview(await getAdminMangaControlOverview({ force: silent }))
      return true
    } catch (overviewError) {
      if (!silent) toast.error(errText(overviewError, txa('Seri özeti yüklenemedi.')))
      return false
    }
  }, [])

  useEffect(() => {
    const timeout = setTimeout(() => setSearch(searchInput.trim()), 300)
    return () => clearTimeout(timeout)
  }, [searchInput])

  useEffect(() => { void loadMangas() }, [loadMangas])
  useEffect(() => { void loadOverview() }, [loadOverview])

  // Sekme gorunurken sessiz tazeleme.
  useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      void Promise.all([loadMangas(true), loadOverview(true)])
    }, 60_000)
    return () => window.clearInterval(intervalId)
  }, [loadMangas, loadOverview])

  const focused = mangas.find((item) => item.id === focusedId) ?? null
  const pageTotal = pageCount(total, MANGAS_PER_PAGE)
  const selected = mangas.filter((item) => selectedIds.has(item.id))

  // On desktop a selection always exists: when the selected series leaves the view, the same position opens.
  useEffect(() => {
    if (focused) {
      lastIndexRef.current = mangas.indexOf(focused)
      return
    }
    if (!desk || loading) return
    const next = mangas[Math.min(lastIndexRef.current, mangas.length - 1)]
    setFocusedId(next ? next.id : null)
  }, [desk, focused, loading, mangas])

  useEffect(() => {
    listRef.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [focusedId])

  const select = (item: AdminMangaControlItem) => {
    setFocusedId(item.id)
    if (!desk) setSheetOpen(true)
  }

  const handleListKey = (event: KeyboardEvent<HTMLUListElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    const index = focused ? mangas.indexOf(focused) : -1
    const next = mangas[Math.max(0, Math.min(mangas.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))]
    if (!next) return
    setFocusedId(next.id)
    requestAnimationFrame(() => listRef.current?.querySelector<HTMLButtonElement>(`[data-manga-id="${next.id}"]`)?.focus())
  }

  async function refreshAfterMutation() {
    clearAdminMangaControlOverviewCache()
    await Promise.all([loadMangas(true), loadOverview(true)])
  }

  async function handleRefresh() {
    setRefreshing(true)
    clearAdminMangaControlOverviewCache()
    try {
      const [listOk, overviewOk] = await Promise.all([loadMangas(true), loadOverview(true)])
      if (!listOk || !overviewOk) toast.warning(txa('Bazı veriler yenilenemedi; son başarılı görünüm korunuyor.'))
    } finally {
      setRefreshing(false)
    }
  }

  async function applyOne(item: AdminMangaControlItem, patch: Partial<AdminMangaControlItem>, run: () => Promise<unknown>, done: string) {
    setBusyId(item.id)
    try {
      await run()
      invalidateAdminMangaControlDetailCache(item.id)
      patchMangaInList(item.id, patch)
      detailControl.patchSelectedMangaDetail(item.id, patch)
      await refreshAfterMutation()
      toast.success(done)
    } catch (actionError) {
      toast.error(errText(actionError, txa('İşlem tamamlanamadı.')))
    } finally {
      setBusyId(null)
    }
  }

  const approve = (item: AdminMangaControlItem) => applyOne(item, { isApproved: true }, () => setAdminMangaApproved(item.id, true), txa('Seri onaylandı.'))

  const askUnapprove = (item: AdminMangaControlItem) => setConfirm({
    title: txa('Onayı geri al'),
    subject: item.title,
    consequence: txa('Seri onay bekleyenlere döner ve onaylanana kadar sitede görünmez. Bölümleri ve okur verisi korunur.'),
    confirmLabel: txa('Onayı geri al'),
    run: () => applyOne(item, { isApproved: false }, () => setAdminMangaApproved(item.id, false), txa('Seri onay bekleyenlere alındı.')),
  })

  const setActive = (item: AdminMangaControlItem, active: boolean) => {
    if (active) {
      void applyOne(item, { isActive: true }, () => setAdminMangaActive(item.id, true), txa('Seri yeniden yayında.'))
      return
    }
    setConfirm({
      title: txa('Seriyi yayından kaldır'),
      subject: item.title,
      consequence: txa('Seri ve bölümleri sitede görünmez, aramada çıkmaz. Takipçiler, yorumlar ve okuma geçmişi korunur; istediğinde yeniden yayına alabilirsin.'),
      confirmLabel: txa('Yayından kaldır'),
      destructive: true,
      run: () => applyOne(item, { isActive: false }, () => setAdminMangaActive(item.id, false), txa('Seri yayından kaldırıldı.')),
    })
  }

  const changeStatus = (item: AdminMangaControlItem, next: MangaStatus) => {
    if (item.status === next) return
    void applyOne(item, { status: next }, () => setAdminMangaStatus(item.id, next), txa('Yayın durumu güncellendi.'))
  }

  /** Bulk action: partial success is not silently swallowed; passes and failures are reported separately. */
  const askBulk = (label: string, targets: AdminMangaControlItem[], apply: (item: AdminMangaControlItem) => Promise<unknown>, consequence: string, destructive = false) => {
    if (targets.length === 0) {
      toast.info(txa('Seçili serilerin hepsi zaten bu durumda.'))
      return
    }
    setConfirm({
      title: label,
      subject: txa('{v1} seri: {v2}', { v1: targets.length, v2: `${targets.slice(0, 3).map((item) => item.title).join(', ')}${targets.length > 3 ? '…' : ''}` }),
      consequence,
      confirmLabel: txa('{v1} seriye uygula', { v1: targets.length }),
      destructive,
      run: async () => {
        const results = await Promise.allSettled(targets.map(apply))
        const passed = results.filter((result) => result.status === 'fulfilled').length
        targets.forEach((item) => invalidateAdminMangaControlDetailCache(item.id))
        setSelectedIds(new Set())
        await refreshAfterMutation()
        if (passed === targets.length) toast.success(txa('{v1} seri güncellendi.', { v1: passed }))
        else toast.warning(txa('{v1} seri güncellendi, {v2} seride işlem tamamlanamadı.', { v1: passed, v2: targets.length - passed }))
      },
    })
  }

  const runConfirm = async () => {
    if (!confirm) return
    setConfirmBusy(true)
    try {
      await confirm.run()
      setConfirm(null)
    } finally {
      setConfirmBusy(false)
    }
  }

  const openManage = (item: AdminMangaControlItem, tab: MangaDetailTab) => {
    setSheetOpen(false)
    detailControl.openDetail(item.id)
    detailControl.setDetailTab(tab)
  }

  const toggleSelected = (id: string, checked: boolean) => setSelectedIds((previous) => {
    const next = new Set(previous)
    if (checked) next.add(id)
    else next.delete(id)
    return next
  })
  const allVisibleSelected = mangas.length > 0 && mangas.every((item) => selectedIds.has(item.id))

  const detail = focused ? (
    <MangaDetailPane
      manga={focused}
      layout={desk ? 'desk' : 'sheet'}
      busy={busyId === focused.id}
      onApprove={() => { void approve(focused) }}
      onUnapprove={() => askUnapprove(focused)}
      onSetActive={(active) => setActive(focused, active)}
      onStatusChange={(next) => changeStatus(focused, next)}
      onOpenManage={(tab) => openManage(focused, tab)}
    />
  ) : null

  return (
    <section className="flex flex-col gap-4 xl:min-h-0 xl:flex-1" aria-busy={loading || refreshing} data-testid="admin-manga-section">
      <AdminSectionHeader
        title={txa('Mangalar')}
        description={txa('Katalogdaki seriler: onay, yayın durumu, bölüm incelemesi ve künye.')}
        actions={<Button variant="outline" size="sm" className="h-9 gap-1.5 rounded-full px-3.5" disabled={loading || refreshing} onClick={() => void handleRefresh()}><RefreshCw className={cn('size-3.5', refreshing && 'animate-spin')} />{txa('Yenile')}</Button>}
      />

      <div className="inline-flex self-start rounded-xl bg-muted/60 p-1" role="tablist" aria-label={txa('Mangalar çalışma alanı')}>
        {([['series', txa('Seriler')], ['revisions', txa('Revizyonlar ve arşiv')]] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={workspace === key}
            onClick={() => setWorkspace(key)}
            data-testid={`admin-manga-workspace-${key}`}
            className={cn('rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors', workspace === key ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
          >
            {label}
          </button>
        ))}
      </div>

      {workspace === 'revisions' ? <div className="xl:min-h-0 xl:flex-1 xl:overflow-y-auto"><ContentRevisionsPanel /></div> : null}

      {workspace === 'series' ? (
        <>
          <section className="overflow-hidden rounded-[20px] border border-border/70 bg-card/60" aria-label={txa('Seri özeti')} data-testid="admin-manga-strip">
            <div className="-mb-px -mr-px grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 [&>*]:border-b [&>*]:border-r [&>*]:border-border/60">
              {VIEWS.map((view) => {
                const active = activeView === view.id
                const value = overview ? view.count(overview) : null
                return (
                  <button key={view.id} type="button" aria-pressed={active} onClick={() => setActiveView(view.id)} data-testid={`admin-manga-view-${view.id}`} className={cn('relative flex items-center gap-3 px-4 py-3 text-left transition-colors', active ? 'bg-primary/[0.07]' : 'hover:bg-muted/40')}>
                    <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-xl max-sm:hidden', view.tone)}><view.icon className="size-[18px]" /></span>
                    <span className="min-w-0">
                      <span className="block truncate text-[11.5px] font-semibold text-muted-foreground">{view.label}</span>
                      <span className="block text-[20px] font-black leading-tight tabular-nums">{value == null ? '—' : value.toLocaleString(intlLocale())}</span>
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
              <Input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} maxLength={120} placeholder={txa('Seri adı, adres, açıklama ya da fansub ara')} aria-label={txa('Serilerde ara')} className="h-9 pl-9 text-[13px]" />
            </div>
            <Select value={status} onValueChange={(value) => setStatus(value as AdminMangaStatusFilter)}>
              <SelectTrigger className="h-9 w-auto text-[13px]" aria-label={txa('Yayın durumu')}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{txa('Tüm yayın durumları')}</SelectItem>
                {STATUS_OPTIONS.map(([value, label]) => <SelectItem key={value} value={value}>{txa(label)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {selected.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary/[0.06] px-3 py-2 text-[12.5px]" data-testid="admin-manga-bulk">
              <b className="tabular-nums">{txa('{v1} seri seçili', { v1: selected.length })}</b>
              <Button size="sm" variant="outline" className="h-8" onClick={() => askBulk(txa('Seçili serileri onayla'), selected.filter((item) => !item.isApproved), (item) => setAdminMangaApproved(item.id, true), txa('Seriler onaylanır ve yayında görünür.'))}>{txa('Onayla')}</Button>
              <Button size="sm" variant="outline" className="h-8" onClick={() => askBulk(txa('Seçili serileri yayına al'), selected.filter((item) => !item.isActive), (item) => setAdminMangaActive(item.id, true), txa('Seriler yeniden yayına alınır.'))}>{txa('Yayına al')}</Button>
              <Button size="sm" variant="outline" className="h-8 text-rose-600 dark:text-rose-300" onClick={() => askBulk(txa('Seçili serileri yayından kaldır'), selected.filter((item) => item.isActive), (item) => setAdminMangaActive(item.id, false), txa('Seriler ve bölümleri sitede görünmez; takipçiler, yorumlar ve okuma geçmişi korunur.'), true)}>{txa('Yayından kaldır')}</Button>
              <Button size="icon-sm" variant="ghost" className="ml-auto" aria-label={txa('Seçimi temizle')} onClick={() => setSelectedIds(new Set())}><X className="size-4" /></Button>
            </div>
          ) : null}

          {error ? <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-[13px] text-destructive">{txa('{v1} Yenile ile tekrar deneyebilirsin.', { v1: error })}</p> : null}

          <div className="grid items-start gap-4 xl:min-h-0 xl:flex-1 xl:grid-cols-[minmax(0,440px)_minmax(0,1fr)] xl:grid-rows-[minmax(0,1fr)]" data-testid="admin-manga-desk">
            <div className="flex min-w-0 flex-col overflow-hidden rounded-[20px] border border-border/70 bg-card/60 xl:max-h-full" aria-busy={loading}>
              {mangas.length > 0 ? (
                <label className="flex items-center gap-2.5 border-b border-border/60 px-4 py-2 text-[12px] text-muted-foreground">
                  <Tick checked={allVisibleSelected} onChange={(checked) => setSelectedIds((previous) => {
                    const next = new Set(previous)
                    mangas.forEach((item) => { if (checked) next.add(item.id); else next.delete(item.id) })
                    return next
                  })} label={txa('Bu sayfadaki serilerin tümünü seç')} />
                  {txa('Bu sayfadakilerin tümü')}
                  <span className="ml-auto tabular-nums">{txa('{v1} seri', { v1: total.toLocaleString(intlLocale()) })}</span>
                </label>
              ) : null}
              {loading && mangas.length === 0 ? (
                <div className="flex flex-col gap-2 p-4">{[0, 1, 2, 3, 4].map((index) => <div key={index} className="h-14 animate-pulse rounded-xl bg-muted/40" />)}</div>
              ) : mangas.length === 0 ? (
                <div className="flex flex-col items-center gap-2 px-6 py-12 text-center" data-testid="admin-manga-empty">
                  <span className="flex size-10 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500"><Check className="size-5" /></span>
                  <span className="text-[13px] font-semibold">{search ? txa('Aramaya uyan seri yok') : activeView === 'all' ? txa('Katalogda seri yok') : txa('Bu görünümde seri yok')}</span>
                  {activeView !== 'all' && !search ? <Button size="sm" variant="outline" className="h-8 rounded-full text-[12px]" onClick={() => setActiveView('all')}>{txa('Tüm serileri göster')}</Button> : null}
                </div>
              ) : (
                <ul className={cn('min-h-0 divide-y divide-border/50 overflow-y-auto transition-opacity', loading && 'opacity-60')} aria-label={txa('Seriler')} onKeyDown={handleListKey} ref={listRef} data-testid="admin-manga-list">
                  {mangas.map((item) => {
                    const missing = mangaMissingMeta(item)
                    return (
                      <li key={item.id} className={cn('relative flex items-center gap-2 pl-4', item.id === focusedId && 'bg-primary/[0.08] before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-primary')}>
                        <Tick checked={selectedIds.has(item.id)} onChange={(checked) => toggleSelected(item.id, checked)} label={txa('{v1} seç', { v1: item.title })} />
                        <button
                          type="button"
                          onClick={() => select(item)}
                          aria-current={item.id === focusedId ? 'true' : undefined}
                          data-manga-id={item.id}
                          data-testid={`admin-manga-row-${item.id}`}
                          className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pr-4 text-left outline-none transition-colors hover:bg-muted/40 focus-visible:bg-muted/50"
                        >
                          <MangaCover manga={item} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-semibold">{item.title}</span>
                            <span className="block truncate text-[11.5px] text-muted-foreground">
                              {txa('{v1} · {v2} bölüm · {v3} okuma', { v1: statusText(item.status), v2: item.chapterStats.total.toLocaleString(intlLocale()), v3: item.totalViews.toLocaleString(intlLocale()) })}
                            </span>
                            {!item.isApproved || !item.isActive || item.chapterStats.pending > 0 || missing.length > 0 || item.isMature ? (
                              <span className="mt-1 flex flex-wrap gap-1">
                                {!item.isApproved ? <MangaTag tone="amber">{txa('Onay bekliyor')}</MangaTag> : null}
                                {!item.isActive ? <MangaTag tone="rose">{txa('Yayında değil')}</MangaTag> : null}
                                {item.chapterStats.pending > 0 ? <MangaTag tone="sky">{txa('{v1} bölüm incelemede', { v1: item.chapterStats.pending })}</MangaTag> : null}
                                {missing.length > 0 ? <MangaTag tone="violet">{txa('Künye eksik')}</MangaTag> : null}
                                {item.isMature ? <MangaTag tone="rose">18+</MangaTag> : null}
                              </span>
                            ) : null}
                          </span>
                          <span className="shrink-0 self-start pt-0.5 text-[11px] tabular-nums text-muted-foreground">{mangaRelativeAge(item.updatedAt).replace(txa(' önce'), '')}</span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
              {total > MANGAS_PER_PAGE ? (
                <footer className="flex items-center justify-between gap-2 border-t border-border/60 px-4 py-2 text-[12px] text-muted-foreground">
                  <span className="tabular-nums">{(page - 1) * MANGAS_PER_PAGE + 1}–{Math.min(total, page * MANGAS_PER_PAGE)} / {total.toLocaleString(intlLocale())}</span>
                  <span className="flex gap-1">
                    <Button size="icon-sm" variant="ghost" aria-label={txa('Önceki sayfa')} disabled={loading || page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft className="size-4" /></Button>
                    <Button size="icon-sm" variant="ghost" aria-label={txa('Sonraki sayfa')} disabled={loading || page >= pageTotal} onClick={() => setPage(page + 1)}><ChevronRight className="size-4" /></Button>
                  </span>
                </footer>
              ) : null}
            </div>

            {desk ? (detail ?? (
              <div className="flex flex-col items-center gap-2 rounded-[20px] border border-dashed border-border/80 px-6 py-16 text-center text-[12.5px] text-muted-foreground">
                <Inbox className="size-5" />{txa('Soldan bir seri seç.')}
              </div>
            )) : null}
          </div>
        </>
      ) : null}

      {!desk ? (
        <Sheet open={sheetOpen && Boolean(focused)} onOpenChange={setSheetOpen}>
          <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-[560px]" onOpenAutoFocus={focusSheetContainer}>
            <SheetTitle className="sr-only">{txa('Seri ayrıntısı')}</SheetTitle>
            <SheetDescription className="sr-only">{txa('Seriyi incele, onayla ya da yayından kaldır.')}</SheetDescription>
            {detail}
          </SheetContent>
        </Sheet>
      ) : null}

      <AdminConfirmDialog request={confirm} busy={confirmBusy} onCancel={() => setConfirm(null)} onConfirm={() => { void runConfirm() }} />

      <MangaDetailControlModal
        isOpen={Boolean(detailControl.selectedMangaId)}
        onClose={detailControl.closeDetail}
        detailLoading={detailControl.detailLoading}
        detailError={detailControl.detailError}
        detailTab={detailControl.detailTab}
        onDetailTabChange={detailControl.setDetailTab}
        onRefreshDetail={() => { void detailControl.refreshDetail() }}
        selectedMangaDetail={detailControl.selectedMangaDetail}
        detailMetrics={detailControl.detailMetrics}
        metricsLoading={detailControl.metricsLoading}
        chapterPageCounts={detailControl.chapterPageCounts}
        coverPreview={detailControl.coverPreview}
        coverFile={detailControl.coverFile}
        coverSaving={detailControl.coverSaving}
        coverInputRef={detailControl.coverInputRef}
        onCoverInputChange={detailControl.handleCoverInputChange}
        onSaveCover={() => { void detailControl.handleSaveCover() }}
        onClearCoverSelection={detailControl.clearCoverSelection}
        genreInput={detailControl.genreInput}
        onGenreInputChange={detailControl.setGenreInput}
        genreDraft={detailControl.genreDraft}
        savingGenres={detailControl.savingGenres}
        seriesTypeDraft={detailControl.seriesTypeDraft}
        onSeriesTypeChange={detailControl.onSeriesTypeChange}
        savingSeriesType={detailControl.savingSeriesType}
        onSaveSeriesType={detailControl.onSaveSeriesType}
        matureDraft={detailControl.matureDraft}
        onMatureChange={detailControl.onMatureChange}
        savingMature={detailControl.savingMature}
        onSaveMature={detailControl.onSaveMature}
        onAddGenre={detailControl.addGenreToDraft}
        onRemoveGenre={detailControl.removeGenreFromDraft}
        onSaveGenres={() => { void detailControl.handleSaveGenres() }}
        descriptionDraft={detailControl.descriptionDraft}
        onDescriptionDraftChange={detailControl.setDescriptionDraft}
        onSaveDescription={() => { void detailControl.handleSaveDescription() }}
        savingDescription={detailControl.savingDescription}
        chapterGroups={detailControl.chapterGroups}
        chapterPublishDraft={detailControl.chapterPublishDraft}
        onChapterPublishDraftChange={detailControl.handleChapterPublishDraftChange}
        detailBusyKey={detailControl.detailBusyKey}
        filteredComments={detailControl.filteredComments}
        commentSearch={detailControl.commentSearch}
        onCommentSearchChange={detailControl.setCommentSearch}
        filteredRatings={detailControl.filteredRatings}
        ratingSearch={detailControl.ratingSearch}
        onRatingSearchChange={detailControl.setRatingSearch}
        ratingSummary={detailControl.ratingSummary}
        onToggleChapterApproved={(chapter) => { void detailControl.handleToggleChapterApproved(chapter) }}
        onToggleChapterActive={(chapter) => { void detailControl.handleToggleChapterActive(chapter) }}
        onSaveChapterPublishAt={(chapter) => { void detailControl.handleSaveChapterPublishAt(chapter) }}
        onToggleCommentPinned={(comment) => { void detailControl.handleToggleCommentPinned(comment) }}
        onToggleCommentActive={(comment) => { void detailControl.handleToggleCommentActive(comment) }}
        onDeleteComment={(comment) => { void detailControl.handleDeleteComment(comment) }}
        onDeleteRating={(rating) => { void detailControl.handleDeleteRating(rating) }}
      />
    </section>
  )
}

export default MangaManagementSection
