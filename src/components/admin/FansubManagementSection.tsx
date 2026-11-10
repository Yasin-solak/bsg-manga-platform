import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { BadgeCheck, ChevronLeft, ChevronRight, EyeOff, Inbox, RefreshCw, Search, Sparkles, Users, Wrench, type LucideIcon } from 'lucide-react'
import { AdminConfirmDialog, type AdminConfirmRequest } from '@/components/admin/shared/AdminConfirmDialog'
import { AdminSectionHeader } from '@/components/admin/shared/AdminSectionHeader'
import { focusSheetContainer, useDeskLayout } from '@/components/admin/shared/useDeskLayout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import type { AdminFansubManagementOverview, AdminFansubManagementView, AdminFansubTrustFilter, AdminManagedFansub } from '@/services/adminService'
import { toast } from '@/services/toastService'
import { AdminFansubDetailModal } from './fansubs/AdminFansubDetailModal'
import { FansubAvatar, FansubDetailPane, FansubTag } from './fansubs/FansubDetailPane'
import { FANSUBS_PER_PAGE, fansubRelativeAge, pageCount, type DetailTab } from './fansubs/fansubManagementUtils'
import { useFansubManagementHashSync } from './fansubs/useFansubManagementHashSync'
import { useFansubManagementState } from './fansubs/useFansubManagementState'
import { intlLocale, txa } from '@/i18n/activeLocale'

/**
 * Summary strip = view (from the server summary). "Pending fixes" is not a view,
 * only info: the number of teams with reported and removed content.
 */
const VIEWS: Array<{ id: AdminFansubManagementView, label: string, icon: LucideIcon, tone: string, count: (o: AdminFansubManagementOverview) => number | null }> = [
  { id: 'all', get label() { return txa('Tüm fansublar') }, icon: Users, tone: 'bg-primary/10 text-primary', count: (o) => o.total },
  { id: 'active', get label() { return txa('Aktif') }, icon: Users, tone: 'bg-emerald-500/10 text-emerald-500', count: (o) => o.active },
  { id: 'inactive', get label() { return txa('Pasif') }, icon: EyeOff, tone: 'bg-rose-500/10 text-rose-500', count: (o) => Math.max(0, o.total - o.active) },
  { id: 'new', get label() { return txa('Yeni (7 gün)') }, icon: Sparkles, tone: 'bg-sky-500/10 text-sky-500', count: (o) => o.newFansubs },
  { id: 'verified', get label() { return txa('Doğrulanmış') }, icon: BadgeCheck, tone: 'bg-violet-500/10 text-violet-500', count: (o) => (o.verificationAvailable ? o.verified : null) },
]

const TRUST_OPTIONS: Array<[AdminFansubTrustFilter, string]> = [
  ['all', 'Tüm güven düzeyleri'],
  ['trusted', 'Güvenilir'],
  ['standard', 'Standart'],
  ['review', 'İncelemeli'],
]

/**
 * Fansubs v2: team desk. The list is paged and filtered on the server
 * (list_admin_fansub_management_page); the selected team on the right, in a drawer on narrow
 * screens: summary, community server and status. Members, series, economy and
 * management history are in a detail management window.
 */
function FansubManagementSection() {
  const desk = useDeskLayout()
  const management = useFansubManagementState()
  const {
    fansubs, fansubTotal, fansubLoading, fansubError, fansubSearchInput, setFansubSearchInput, setFansubStatus,
    fansubView, setFansubView, fansubTrust, setFansubTrust, fansubPage, setFansubPage, selectedFansubId, setSelectedFansubId,
    selectedFansub, fansubBusyId, overview, loadFansubs, loadOverview, tab, setTab, toggleFansubActive,
  } = management
  const [sheetOpen, setSheetOpen] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [confirm, setConfirm] = useState<AdminConfirmRequest | null>(null)
  const [confirmBusy, setConfirmBusy] = useState(false)
  const lastIndexRef = useRef(0)
  const listRef = useRef<HTMLUListElement>(null)
  const handleDetailTabChange = useFansubManagementHashSync(tab, setTab)
  const totalPages = pageCount(fansubTotal, FANSUBS_PER_PAGE)
  const focused = fansubs.find((item) => item.id === selectedFansubId) ?? null

  // On desktop a selection always exists: when the selected team leaves the view, the same position opens.
  useEffect(() => {
    if (focused) {
      lastIndexRef.current = fansubs.indexOf(focused)
      return
    }
    if (!desk || fansubLoading) return
    const next = fansubs[Math.min(lastIndexRef.current, fansubs.length - 1)]
    if (next) setSelectedFansubId(next.id)
  }, [desk, fansubLoading, fansubs, focused, setSelectedFansubId])

  useEffect(() => {
    listRef.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [selectedFansubId])

  const select = (fansub: AdminManagedFansub) => {
    setSelectedFansubId(fansub.id)
    if (!desk) setSheetOpen(true)
  }

  const handleListKey = (event: KeyboardEvent<HTMLUListElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    const index = focused ? fansubs.indexOf(focused) : -1
    const next = fansubs[Math.max(0, Math.min(fansubs.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))]
    if (!next) return
    setSelectedFansubId(next.id)
    requestAnimationFrame(() => listRef.current?.querySelector<HTMLButtonElement>(`[data-fansub-id="${next.id}"]`)?.focus())
  }

  const setView = (view: AdminFansubManagementView) => {
    setFansubView(view)
    setFansubStatus(view === 'active' ? 'active' : view === 'inactive' ? 'inactive' : 'all')
    setFansubPage(1)
  }

  async function handleRefresh() {
    setRefreshing(true)
    try {
      await Promise.all([loadFansubs(), loadOverview()])
    } catch {
      toast.warning(txa('Bazı veriler yenilenemedi; son başarılı görünüm korunuyor.'))
    } finally {
      setRefreshing(false)
    }
  }

  const openDetail = (fansub: AdminManagedFansub, initialTab: DetailTab) => {
    setSelectedFansubId(fansub.id)
    handleDetailTabChange(initialTab)
    setSheetOpen(false)
    setDetailOpen(true)
  }

  const setActive = (fansub: AdminManagedFansub, active: boolean) => {
    const run = async () => {
      await toggleFansubActive(fansub)
      await loadOverview()
    }
    if (active) {
      void run()
      return
    }
    const members = fansub.memberCount ?? 0
    setConfirm({
      title: txa('Fansubu pasife al'),
      subject: fansub.name,
      consequence: txa('Fansub sayfası ve serileri sitede görünmez, topluluk sunucusu katılıma kapanır. {v1} ve geçmişe "fansub kapatıldı" olarak yazılır; yeniden etkinleştirmek üyelikleri geri getirmez.', { v1: members > 0 ? txa('{v1} ekip üyeliği sonlandırılır', { v1: members }) : txa('Ekip üyelikleri sonlandırılır') }),
      confirmLabel: txa('Pasife al'),
      destructive: true,
      run,
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

  const detail = focused ? (
    <FansubDetailPane
      fansub={focused}
      layout={desk ? 'desk' : 'sheet'}
      busy={fansubBusyId === focused.id}
      trustAvailable={overview?.trustAvailable === true}
      onSetActive={(active) => setActive(focused, active)}
      onOpenDetail={(initialTab) => openDetail(focused, initialTab)}
    />
  ) : null

  return (
    <section className="flex flex-col gap-4 xl:min-h-0 xl:flex-1" aria-busy={fansubLoading || refreshing} data-testid="admin-fansubs-section">
      <AdminSectionHeader
        title={txa('Fansublar')}
        description={txa('Ekipler: durum, üyeler, seriler, ekonomi ve topluluk sunucusu.')}
        actions={<Button variant="outline" size="sm" className="h-9 gap-1.5 rounded-full px-3.5" disabled={fansubLoading || refreshing} onClick={() => void handleRefresh()}><RefreshCw className={cn('size-3.5', refreshing && 'animate-spin')} />{txa('Yenile')}</Button>}
      />

      <section className="overflow-hidden rounded-[20px] border border-border/70 bg-card/60" aria-label={txa('Fansub özeti')} data-testid="admin-fansubs-strip">
        <div className="-mb-px -mr-px grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 [&>*]:border-b [&>*]:border-r [&>*]:border-border/60">
          {VIEWS.map((view) => {
            const active = fansubView === view.id
            const value = overview ? view.count(overview) : null
            const disabled = view.id === 'verified' && overview?.verificationAvailable !== true
            return (
              <button key={view.id} type="button" aria-pressed={active} disabled={disabled} onClick={() => setView(view.id)} data-testid={`admin-fansubs-view-${view.id}`} className={cn('relative flex items-center gap-3 px-4 py-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60', active ? 'bg-primary/[0.07]' : 'hover:bg-muted/40')}>
                <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-xl max-sm:hidden', view.tone)}><view.icon className="size-[18px]" /></span>
                <span className="min-w-0">
                  <span className="block truncate text-[11.5px] font-semibold text-muted-foreground">{view.label}</span>
                  <span className="block text-[20px] font-black leading-tight tabular-nums">{value == null ? '—' : value.toLocaleString(intlLocale())}</span>
                </span>
                <span className={cn('pointer-events-none absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-primary transition-transform', active ? 'scale-x-100' : 'scale-x-0')} aria-hidden="true" />
              </button>
            )
          })}
          <div className="flex items-center gap-3 px-4 py-3" data-testid="admin-fansubs-pending-review">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500 max-sm:hidden"><Wrench className="size-[18px]" /></span>
            <span className="min-w-0">
              <span className="block truncate text-[11.5px] font-semibold text-muted-foreground">{txa('Düzeltmede')}</span>
              <span className="block text-[20px] font-black leading-tight tabular-nums">{overview ? overview.pendingReview.toLocaleString(intlLocale()) : '—'}</span>
            </span>
          </div>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={fansubSearchInput} onChange={(event) => { setFansubSearchInput(event.target.value); setFansubPage(1) }} maxLength={120} placeholder={txa('Fansub adı, adresi ya da yöneticisi')} aria-label={txa('Fansublarda ara')} className="h-9 pl-9 text-[13px]" />
        </div>
        {overview?.trustAvailable ? (
          <Select value={fansubTrust} onValueChange={(value) => { setFansubTrust(value as AdminFansubTrustFilter); setFansubPage(1) }}>
            <SelectTrigger className="h-9 w-auto text-[13px]" aria-label={txa('Güven düzeyi')}><SelectValue /></SelectTrigger>
            <SelectContent>{TRUST_OPTIONS.map(([value, label]) => <SelectItem key={value} value={value}>{txa(label)}</SelectItem>)}</SelectContent>
          </Select>
        ) : null}
      </div>

      {fansubError ? <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-[13px] text-destructive">{txa('{v1} Yenile ile tekrar deneyebilirsin.', { v1: fansubError })}</p> : null}

      <div className="grid items-start gap-4 xl:min-h-0 xl:flex-1 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)] xl:grid-rows-[minmax(0,1fr)]" data-testid="admin-fansubs-desk">
        <div className="flex min-w-0 flex-col overflow-hidden rounded-[20px] border border-border/70 bg-card/60 xl:max-h-full" aria-busy={fansubLoading}>
          {fansubLoading && fansubs.length === 0 ? (
            <div className="flex flex-col gap-2 p-4">{[0, 1, 2, 3, 4].map((index) => <div key={index} className="h-14 animate-pulse rounded-xl bg-muted/40" />)}</div>
          ) : fansubs.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-12 text-center" data-testid="admin-fansubs-empty">
              <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground"><Users className="size-5" /></span>
              <span className="text-[13px] font-semibold">{fansubSearchInput.trim() ? txa('Aramaya uyan fansub yok') : txa('Bu görünümde fansub yok')}</span>
              {fansubView !== 'all' ? <Button size="sm" variant="outline" className="h-8 rounded-full text-[12px]" onClick={() => setView('all')}>{txa('Tüm fansubları göster')}</Button> : null}
            </div>
          ) : (
            <ul className={cn('min-h-0 divide-y divide-border/50 overflow-y-auto transition-opacity', fansubLoading && 'opacity-60')} aria-label={txa('Fansublar')} onKeyDown={handleListKey} ref={listRef} data-testid="admin-fansubs-list">
              {fansubs.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => select(item)}
                    aria-current={item.id === selectedFansubId ? 'true' : undefined}
                    data-fansub-id={item.id}
                    data-testid={`admin-fansubs-row-${item.id}`}
                    className={cn(
                      'relative flex w-full items-center gap-3 px-4 py-2.5 text-left outline-none transition-colors hover:bg-muted/40 focus-visible:bg-muted/50',
                      item.id === selectedFansubId && 'bg-primary/[0.08] before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-primary',
                    )}
                  >
                    <FansubAvatar fansub={item} />
                    <span className="min-w-0 flex-1">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate text-[13px] font-semibold">{item.name}</span>
                        {item.isVerified ? <BadgeCheck className="size-3.5 shrink-0 text-sky-500" aria-label={txa('Doğrulanmış')} /> : null}
                      </span>
                      <span className="block truncate text-[11.5px] text-muted-foreground">
                        {txa('{v1} üye · {v2} seri · {v3} takipçi', { v1: (item.memberCount ?? 0).toLocaleString(intlLocale()), v2: item.mangaCount.toLocaleString(intlLocale()), v3: item.followerCount.toLocaleString(intlLocale()) })}
                      </span>
                      {!item.isActive || item.pendingReviewCount ? (
                        <span className="mt-1 flex flex-wrap gap-1">
                          {!item.isActive ? <FansubTag tone="rose">{txa('Pasif')}</FansubTag> : null}
                          {item.pendingReviewCount ? <FansubTag tone="amber">{txa('{v1} düzeltme bekliyor', { v1: item.pendingReviewCount })}</FansubTag> : null}
                        </span>
                      ) : null}
                    </span>
                    <span className="shrink-0 self-start pt-0.5 text-[11px] tabular-nums text-muted-foreground">{fansubRelativeAge(item.lastActivityAt).replace(txa(' önce'), '')}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {fansubTotal > FANSUBS_PER_PAGE ? (
            <footer className="flex items-center justify-between gap-2 border-t border-border/60 px-4 py-2 text-[12px] text-muted-foreground">
              <span className="tabular-nums">{(fansubPage - 1) * FANSUBS_PER_PAGE + 1}–{Math.min(fansubTotal, fansubPage * FANSUBS_PER_PAGE)} / {fansubTotal.toLocaleString(intlLocale())}</span>
              <span className="flex gap-1">
                <Button size="icon-sm" variant="ghost" aria-label={txa('Önceki sayfa')} disabled={fansubLoading || fansubPage <= 1} onClick={() => setFansubPage(fansubPage - 1)}><ChevronLeft className="size-4" /></Button>
                <Button size="icon-sm" variant="ghost" aria-label={txa('Sonraki sayfa')} disabled={fansubLoading || fansubPage >= totalPages} onClick={() => setFansubPage(fansubPage + 1)}><ChevronRight className="size-4" /></Button>
              </span>
            </footer>
          ) : null}
        </div>

        {desk ? (detail ?? (
          <div className="flex flex-col items-center gap-2 rounded-[20px] border border-dashed border-border/80 px-6 py-16 text-center text-[12.5px] text-muted-foreground">
            <Inbox className="size-5" />{txa('Soldan bir fansub seç.')}
          </div>
        )) : null}
      </div>

      {!desk ? (
        <Sheet open={sheetOpen && Boolean(focused)} onOpenChange={setSheetOpen}>
          <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-[560px]" onOpenAutoFocus={focusSheetContainer}>
            <SheetTitle className="sr-only">{txa('Fansub ayrıntısı')}</SheetTitle>
            <SheetDescription className="sr-only">{txa('Fansubu incele, topluluk sunucusunu gör ya da durumunu değiştir.')}</SheetDescription>
            {detail}
          </SheetContent>
        </Sheet>
      ) : null}

      <AdminConfirmDialog request={confirm} busy={confirmBusy} onCancel={() => setConfirm(null)} onConfirm={() => { void runConfirm() }} />

      <AdminFansubDetailModal
        {...management}
        isOpen={detailOpen && Boolean(selectedFansub)}
        refreshing={refreshing}
        onClose={() => setDetailOpen(false)}
        onRefresh={() => handleRefresh()}
        onTabChange={handleDetailTabChange}
      />
    </section>
  )
}

export default FansubManagementSection
