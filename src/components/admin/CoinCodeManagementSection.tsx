import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import {
  Ban, ChevronLeft, ChevronRight, Clock, Coins, Download, History, Inbox, KeyRound, Plus, RefreshCw, Search, Ticket, X, type LucideIcon,
} from 'lucide-react'
import {
  bulkSetAdminCoinCodesActive,
  getAdminCoinCodeOverview,
  listAdminCoinActivationsPage,
  listAdminCoinCodesPage,
  type AdminCoinActivationCursor,
  type AdminCoinCodeCursor,
  type AdminCoinCodeOverview,
  type AdminRedeemCodeItem,
  type AdminRedeemUsageEvent,
} from '@/services/redeemCodeService'
import { AdminReasonDialog } from '@/components/admin/shared/AdminReasonDialog'
import { AdminSectionHeader } from '@/components/admin/shared/AdminSectionHeader'
import { focusSheetContainer, useDeskLayout } from '@/components/admin/shared/useDeskLayout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { toast } from '@/services/toastService'
import { CoinCodeDetailPane } from './coinCodes/CoinCodeDetailPane'
import { CoinCodeGenerateDialog } from './coinCodes/CoinCodeGenerateDialog'
import {
  downloadCsv,
  formatCodeTarget,
  formatDateTime,
  resolveCodeStatus,
  resolveUsageTarget,
  STATUS_TONE,
  toErrorMessage,
} from './coinCodes/coinCodeManagementUtils'
import { intlLocale, txa } from '@/i18n/activeLocale'

type CodeTarget = 'all' | 'user' | 'fansub' | 'both'
type CodeStatus = 'all' | 'active' | 'passive' | 'expired' | 'used'
type ActivationTarget = 'all' | 'user' | 'fansub'
type CoinCodeTab = 'codes' | 'usages'

export const COIN_CODES_PER_PAGE = 20
const EXPORT_PAGE = 100
const EXPORT_MAX = 5000

const VIEWS: Array<{ id: CodeStatus, label: string, icon: LucideIcon, tone: string, count: (o: AdminCoinCodeOverview) => number }> = [
  { id: 'all', get label() { return txa('Tüm kodlar') }, icon: Ticket, tone: 'bg-primary/10 text-primary', count: (o) => o.totalCodes },
  { id: 'active', get label() { return txa('Kullanılabilir') }, icon: KeyRound, tone: 'bg-emerald-500/10 text-emerald-500', count: (o) => o.activeCodes },
  { id: 'used', get label() { return txa('Kullanılmış') }, icon: History, tone: 'bg-sky-500/10 text-sky-500', count: (o) => o.usedCodes },
  { id: 'expired', get label() { return txa('Süresi dolan') }, icon: Clock, tone: 'bg-amber-500/10 text-amber-500', count: (o) => o.expiredCodes },
  { id: 'passive', get label() { return txa('Pasif') }, icon: Ban, tone: 'bg-rose-500/10 text-rose-500', count: (o) => o.passiveCodes },
]

const TARGETS: Array<[CodeTarget, string]> = [
  ['all', 'Tüm hedefler'],
  ['user', 'Kişisel bakiye'],
  ['fansub', 'Fansub kasası'],
  ['both', 'Bakiye ya da kasa'],
]

const compactFormat = new Intl.NumberFormat(intlLocale(), { notation: 'compact', maximumFractionDigits: 1 })
const compact = (value: number) => compactFormat.format(value)

function Tick({ checked, indeterminate = false, label, onChange }: { checked: boolean, indeterminate?: boolean, label: string, onChange: (checked: boolean) => void }) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      checked={checked}
      ref={(node) => { if (node) node.indeterminate = indeterminate }}
      onChange={(event) => onChange(event.target.checked)}
      onClick={(event) => event.stopPropagation()}
      className="size-4 shrink-0 cursor-pointer accent-primary"
    />
  )
}

function Pager({ page, total, perPage, canPrevious, canNext, loading, onPrevious, onNext }: {
  page: number, total: number, perPage: number, canPrevious: boolean, canNext: boolean, loading: boolean, onPrevious: () => void, onNext: () => void
}) {
  if (total <= perPage) return null
  return (
    <footer className="flex items-center justify-between gap-2 border-t border-border/60 px-4 py-2 text-[12px] text-muted-foreground">
      <span className="tabular-nums">{(page - 1) * perPage + 1}–{Math.min(total, page * perPage)} / {total.toLocaleString(intlLocale())}</span>
      <span className="flex gap-1">
        <Button size="icon-sm" variant="ghost" aria-label={txa('Önceki sayfa')} disabled={loading || !canPrevious} onClick={onPrevious}><ChevronLeft className="size-4" /></Button>
        <Button size="icon-sm" variant="ghost" aria-label={txa('Sonraki sayfa')} disabled={loading || !canNext} onClick={onNext}><ChevronRight className="size-4" /></Button>
      </span>
    </footer>
  )
}

/**
 * Coin codes v2: code desk. Summary strip = status view (from the server
 * summary); codes are cursor-paged on the server, the selected code on the right (in a drawer on narrow
 * screens) with its users. Redemptions are in a separate tab. Generation is in a dialog;
 * deactivating / activating asks for a reason (audit record). CSV
 * export is all records matching the filter, not the visible page.
 */
function CoinCodeManagementSection() {
  const desk = useDeskLayout()
  const [tab, setTab] = useState<CoinCodeTab>('codes')
  const [overview, setOverview] = useState<AdminCoinCodeOverview | null>(null)
  const [overviewError, setOverviewError] = useState('')
  const [generateOpen, setGenerateOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const [codes, setCodes] = useState<AdminRedeemCodeItem[]>([])
  const [codeTotal, setCodeTotal] = useState(0)
  const [codeLoading, setCodeLoading] = useState(true)
  const [codeError, setCodeError] = useState('')
  const [codeSearchInput, setCodeSearchInput] = useState('')
  const [codeSearch, setCodeSearch] = useState('')
  const [codeTarget, setCodeTarget] = useState<CodeTarget>('all')
  const [codeStatus, setCodeStatus] = useState<CodeStatus>('all')
  const [codeCursor, setCodeCursor] = useState<AdminCoinCodeCursor | undefined>()
  const [codeCursorStack, setCodeCursorStack] = useState<Array<AdminCoinCodeCursor | undefined>>([])
  const [nextCodeCursor, setNextCodeCursor] = useState<AdminCoinCodeCursor | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [statusRequest, setStatusRequest] = useState<{ ids: string[], active: boolean, label: string } | null>(null)
  const [statusReason, setStatusReason] = useState('')
  const [statusBusy, setStatusBusy] = useState(false)
  const [exporting, setExporting] = useState(false)

  const [events, setEvents] = useState<AdminRedeemUsageEvent[]>([])
  const [eventTotal, setEventTotal] = useState(0)
  const [eventLoading, setEventLoading] = useState(true)
  const [eventError, setEventError] = useState('')
  const [eventSearchInput, setEventSearchInput] = useState('')
  const [eventSearch, setEventSearch] = useState('')
  const [eventTarget, setEventTarget] = useState<ActivationTarget>('all')
  const [eventCursor, setEventCursor] = useState<AdminCoinActivationCursor | undefined>()
  const [eventCursorStack, setEventCursorStack] = useState<Array<AdminCoinActivationCursor | undefined>>([])
  const [nextEventCursor, setNextEventCursor] = useState<AdminCoinActivationCursor | null>(null)

  const lastIndexRef = useRef(0)
  const listRef = useRef<HTMLUListElement>(null)
  const focused = codes.find((item) => item.id === focusedId) ?? null

  const loadOverview = useCallback(async () => {
    try {
      setOverview(await getAdminCoinCodeOverview(7))
      setOverviewError('')
    } catch (error) {
      setOverviewError(toErrorMessage(error, txa('Coin kodu özeti yüklenemedi.')))
    }
  }, [])

  const loadCodes = useCallback(async () => {
    setCodeLoading(true)
    try {
      const page = await listAdminCoinCodesPage({ limit: COIN_CODES_PER_PAGE, search: codeSearch, targetType: codeTarget, status: codeStatus, cursor: codeCursor })
      setCodes(page.items)
      setCodeTotal(page.total)
      setNextCodeCursor(page.nextCursor)
      setCodeError('')
    } catch (error) {
      setCodeError(toErrorMessage(error, txa('Kodlar yüklenemedi.')))
    } finally {
      setCodeLoading(false)
    }
  }, [codeCursor, codeSearch, codeStatus, codeTarget])

  const loadEvents = useCallback(async () => {
    setEventLoading(true)
    try {
      const page = await listAdminCoinActivationsPage({ limit: COIN_CODES_PER_PAGE, search: eventSearch, targetType: eventTarget, cursor: eventCursor })
      setEvents(page.items)
      setEventTotal(page.total)
      setNextEventCursor(page.nextCursor)
      setEventError('')
    } catch (error) {
      setEventError(toErrorMessage(error, txa('Kullanımlar yüklenemedi.')))
    } finally {
      setEventLoading(false)
    }
  }, [eventCursor, eventSearch, eventTarget])

  useEffect(() => { void loadOverview() }, [loadOverview])
  useEffect(() => { void loadCodes() }, [loadCodes])
  useEffect(() => { if (tab === 'usages') void loadEvents() }, [loadEvents, tab])

  useEffect(() => {
    const next = codeSearchInput.trim()
    if (next === codeSearch) return undefined
    const handle = window.setTimeout(() => {
      setCodeCursor(undefined)
      setCodeCursorStack([])
      setSelectedIds([])
      setCodeSearch(next)
    }, 300)
    return () => window.clearTimeout(handle)
  }, [codeSearch, codeSearchInput])

  useEffect(() => {
    const next = eventSearchInput.trim()
    if (next === eventSearch) return undefined
    const handle = window.setTimeout(() => {
      setEventCursor(undefined)
      setEventCursorStack([])
      setEventSearch(next)
    }, 300)
    return () => window.clearTimeout(handle)
  }, [eventSearch, eventSearchInput])

  // On desktop a selection always exists: when the selected code leaves the view, the same position opens.
  useEffect(() => {
    if (focused) {
      lastIndexRef.current = codes.indexOf(focused)
      return
    }
    if (!desk || codeLoading) return
    const next = codes[Math.min(lastIndexRef.current, codes.length - 1)]
    if (next) setFocusedId(next.id)
  }, [codeLoading, codes, desk, focused])

  useEffect(() => {
    listRef.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [focusedId])

  const resetCodePage = () => {
    setCodeCursor(undefined)
    setCodeCursorStack([])
    setSelectedIds([])
  }

  const setView = (status: CodeStatus) => {
    setTab('codes')
    setCodeStatus(status)
    resetCodePage()
  }

  const select = (item: AdminRedeemCodeItem) => {
    setFocusedId(item.id)
    if (!desk) setSheetOpen(true)
  }

  const handleListKey = (event: KeyboardEvent<HTMLUListElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    const index = focused ? codes.indexOf(focused) : -1
    const next = codes[Math.max(0, Math.min(codes.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))]
    if (!next) return
    setFocusedId(next.id)
    requestAnimationFrame(() => listRef.current?.querySelector<HTMLButtonElement>(`[data-code-id="${next.id}"]`)?.focus())
  }

  async function refresh() {
    setRefreshing(true)
    try {
      await Promise.all([loadOverview(), loadCodes(), tab === 'usages' ? loadEvents() : Promise.resolve()])
    } finally {
      setRefreshing(false)
    }
  }

  async function copyText(value: string, message: string) {
    try {
      await navigator.clipboard.writeText(value)
      toast.success(message)
    } catch {
      toast.error(txa('Panoya kopyalanamadı.'))
    }
  }

  const askStatus = (targets: AdminRedeemCodeItem[], active: boolean) => {
    const ids = targets.filter((item) => item.isActive !== active).map((item) => item.id)
    if (!ids.length) return
    setStatusRequest({ ids, active, label: targets.length === 1 ? targets[0].code : txa('{v1} kod', { v1: ids.length }) })
    setStatusReason('')
  }

  async function applyStatus() {
    if (!statusRequest || statusReason.trim().length < 5) return
    setStatusBusy(true)
    try {
      const result = await bulkSetAdminCoinCodesActive({ codeIds: statusRequest.ids, isActive: statusRequest.active, reason: statusReason })
      toast.success(statusRequest.active ? txa('{v1} kod etkinleştirildi.', { v1: result.updatedCount }) : txa('{v1} kod pasife alındı.', { v1: result.updatedCount }))
      setStatusRequest(null)
      setSelectedIds([])
      await Promise.all([loadOverview(), loadCodes()])
    } catch (error) {
      toast.error(toErrorMessage(error, txa('Kod durumu değiştirilemedi.')))
    } finally {
      setStatusBusy(false)
    }
  }

  // ALL codes matching the filter (the old version downloaded only the 10 visible codes).
  async function exportCodes() {
    setExporting(true)
    try {
      const rows: AdminRedeemCodeItem[] = []
      let cursor: AdminCoinCodeCursor | undefined
      do {
        const page = await listAdminCoinCodesPage({ limit: EXPORT_PAGE, search: codeSearch, targetType: codeTarget, status: codeStatus, cursor })
        rows.push(...page.items)
        cursor = page.nextCursor ?? undefined
      } while (cursor && rows.length < EXPORT_MAX)
      downloadCsv('coin-kodlari.csv', [
        [txa('Kod'), txa('Coin'), txa('Hedef'), txa('Kullanım'), txa('Durum'), txa('Son kullanma'), txa('Seri'), txa('Kanal'), txa('Not')],
        ...rows.map((item) => [item.code, item.value, formatCodeTarget(item.targetType), `${item.usedCount}/${item.maxUses}`, resolveCodeStatus(item).label, formatDateTime(item.expiresAt), item.seriesLabel, item.distributionChannel, item.notes]),
      ])
      toast.success(txa('{v1} kod CSV olarak indirildi.', { v1: rows.length }))
    } catch (error) {
      toast.error(toErrorMessage(error, txa('CSV hazırlanamadı.')))
    } finally {
      setExporting(false)
    }
  }

  async function exportEvents() {
    setExporting(true)
    try {
      const rows: AdminRedeemUsageEvent[] = []
      let cursor: AdminCoinActivationCursor | undefined
      do {
        const page = await listAdminCoinActivationsPage({ limit: EXPORT_PAGE, search: eventSearch, targetType: eventTarget, cursor })
        rows.push(...page.items)
        cursor = page.nextCursor ?? undefined
      } while (cursor && rows.length < EXPORT_MAX)
      downloadCsv('coin-kodu-kullanimlari.csv', [
        [txa('Zaman'), txa('Kod'), txa('Kullanan'), txa('Nereye'), txa('Coin')],
        ...rows.map((item) => [formatDateTime(item.redeemedAt), item.code, item.username, resolveUsageTarget(item), item.creditedValue]),
      ])
      toast.success(txa('{v1} kullanım CSV olarak indirildi.', { v1: rows.length }))
    } catch (error) {
      toast.error(toErrorMessage(error, txa('CSV hazırlanamadı.')))
    } finally {
      setExporting(false)
    }
  }

  const selectedCodes = codes.filter((item) => selectedIds.includes(item.id))
  const allOnPageSelected = codes.length > 0 && codes.every((item) => selectedIds.includes(item.id))
  const codePage = codeCursorStack.length + 1
  const eventPage = eventCursorStack.length + 1

  const detail = focused ? (
    <CoinCodeDetailPane
      code={focused}
      layout={desk ? 'desk' : 'sheet'}
      onCopy={() => { void copyText(focused.code, txa('Kod panoya kopyalandı.')) }}
      onSetActive={(active) => askStatus([focused], active)}
    />
  ) : null

  return (
    <section className="flex flex-col gap-4 xl:min-h-0 xl:flex-1" aria-busy={codeLoading || refreshing} data-testid="admin-coin-codes">
      <AdminSectionHeader
        title={txa('Coin kodları')}
        description={txa('Kod üret, dağıtımı ve açık riski izle, kullanımları incele.')}
        actions={(
          <span className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-9 gap-1.5 rounded-full px-3.5" disabled={refreshing} onClick={() => { void refresh() }}><RefreshCw className={cn('size-3.5', refreshing && 'animate-spin')} />{txa('Yenile')}</Button>
            <Button size="sm" className="h-9 gap-1.5 rounded-full px-3.5" onClick={() => setGenerateOpen(true)} data-testid="coin-code-generate-open"><Plus className="size-4" />{txa('Kod üret')}</Button>
          </span>
        )}
      />

      {overviewError ? <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-[13px] text-destructive">{overviewError}</p> : null}

      <section className="overflow-hidden rounded-[20px] border border-border/70 bg-card/60" aria-label={txa('Coin kodu özeti')} data-testid="coin-codes-strip">
        <div className="-mb-px -mr-px grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 [&>*]:border-b [&>*]:border-r [&>*]:border-border/60">
          {VIEWS.map((view) => {
            const active = tab === 'codes' && codeStatus === view.id
            const value = overview ? view.count(overview) : null
            return (
              <button key={view.id} type="button" aria-pressed={active} onClick={() => setView(view.id)} data-testid={`coin-codes-view-${view.id}`} className={cn('relative flex items-center gap-3 px-4 py-3 text-left transition-colors', active ? 'bg-primary/[0.07]' : 'hover:bg-muted/40')}>
                <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-xl max-sm:hidden', view.tone)}><view.icon className="size-[18px]" /></span>
                <span className="min-w-0">
                  <span className="block truncate text-[11.5px] font-semibold text-muted-foreground">{view.label}</span>
                  <span className="block text-[20px] font-black leading-tight tabular-nums">{value == null ? '—' : value.toLocaleString(intlLocale())}</span>
                  {view.id === 'active' && overview?.expiringSevenDays ? <span className="block truncate text-[11px] text-amber-700 dark:text-amber-300" title={txa('7 gün içinde süresi dolacak kod')}>{txa('7 günde biten: {v1}', { v1: overview.expiringSevenDays })}</span> : null}
                </span>
                <span className={cn('pointer-events-none absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-primary transition-transform', active ? 'scale-x-100' : 'scale-x-0')} aria-hidden="true" />
              </button>
            )
          })}
          <div className="flex items-center gap-3 px-4 py-3" data-testid="coin-codes-exposure">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500 max-sm:hidden"><Coins className="size-[18px]" /></span>
            <span className="min-w-0">
              <span className="block truncate text-[11.5px] font-semibold text-muted-foreground">{txa('Açık risk')}</span>
              <span className="block truncate text-[20px] font-black leading-tight tabular-nums" title={txa('Kullanılabilir kodların kalan haklarıyla dağıtabileceği en fazla coin')}>
                {overview ? compact(overview.activeExposureCoin) : '—'}
              </span>
              {overview ? <span className="block truncate text-[11px] text-muted-foreground">{txa('{v1} dağıtıldı', { v1: compact(overview.distributedCoin) })}</span> : null}
            </span>
          </div>
        </div>
      </section>

      <div className="inline-flex self-start rounded-xl bg-muted/60 p-1" role="tablist" aria-label={txa('Coin kodu bölümleri')}>
        {([['codes', txa('Kodlar'), Ticket], ['usages', txa('Kullanımlar'), History]] as const).map(([id, label, Icon]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} data-testid={`coin-codes-tab-${id}`} className={cn('inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors', tab === id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
            <Icon className="size-3.5" />{label}
            {id === 'usages' && overview ? <span className="rounded-full bg-muted px-1.5 text-[11px] tabular-nums">{overview.totalActivations.toLocaleString(intlLocale())}</span> : null}
          </button>
        ))}
      </div>

      {tab === 'codes' ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={codeSearchInput} onChange={(event) => setCodeSearchInput(event.target.value)} maxLength={80} placeholder={txa('Kod, seri ya da kanal')} aria-label={txa('Kodlarda ara')} className="h-9 pl-9 text-[13px]" />
            </div>
            <Select value={codeTarget} onValueChange={(value) => { setCodeTarget(value as CodeTarget); resetCodePage() }}>
              <SelectTrigger className="h-9 w-auto text-[13px]" aria-label={txa('Hedef')}><SelectValue /></SelectTrigger>
              <SelectContent>{TARGETS.map(([value, label]) => <SelectItem key={value} value={value}>{txa(label)}</SelectItem>)}</SelectContent>
            </Select>
            <Button variant="outline" size="sm" className="h-9 gap-1.5" disabled={exporting || codeTotal === 0} onClick={() => { void exportCodes() }}><Download className="size-4" />{txa('CSV ({v1})', { v1: codeTotal.toLocaleString(intlLocale()) })}</Button>
          </div>

          {codeError ? <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-[13px] text-destructive">{codeError}</p> : null}

          <div className="grid items-start gap-4 xl:min-h-0 xl:flex-1 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)] xl:grid-rows-[minmax(0,1fr)]" data-testid="coin-codes-desk">
            <div className="flex min-w-0 flex-col overflow-hidden rounded-[20px] border border-border/70 bg-card/60 xl:max-h-full" aria-busy={codeLoading}>
              {codes.length > 0 ? (
                <div className="flex min-h-11 items-center gap-2 border-b border-border/60 px-4 py-1.5 text-[12px]" data-testid="coin-codes-bulk">
                  <Tick checked={allOnPageSelected} indeterminate={selectedIds.length > 0 && !allOnPageSelected} label={txa('Sayfadaki kodları seç')} onChange={(checked) => setSelectedIds(checked ? codes.map((item) => item.id) : [])} />
                  {selectedIds.length === 0 ? (
                    <span className="text-muted-foreground">{txa('{v1} kod', { v1: codeTotal.toLocaleString(intlLocale()) })}</span>
                  ) : (
                    <>
                      <span className="font-semibold">{txa('{v1} seçili', { v1: selectedIds.length })}</span>
                      <span className="ml-auto flex items-center gap-1">
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-[12px] text-rose-600 dark:text-rose-300" onClick={() => askStatus(selectedCodes, false)} data-testid="coin-codes-bulk-deactivate">{txa('Pasife al')}</Button>
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-[12px]" onClick={() => askStatus(selectedCodes, true)}>{txa('Etkinleştir')}</Button>
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-[12px]" onClick={() => { void copyText(selectedCodes.map((item) => item.code).join('\n'), txa('{v1} kod kopyalandı.', { v1: selectedCodes.length })) }}>{txa('Kopyala')}</Button>
                        <Button size="icon-sm" variant="ghost" aria-label={txa('Seçimi temizle')} onClick={() => setSelectedIds([])}><X className="size-3.5" /></Button>
                      </span>
                    </>
                  )}
                </div>
              ) : null}
              {codeLoading && codes.length === 0 ? (
                <div className="flex flex-col gap-2 p-4">{[0, 1, 2, 3, 4].map((index) => <div key={index} className="h-12 animate-pulse rounded-xl bg-muted/40" />)}</div>
              ) : codes.length === 0 ? (
                <div className="flex flex-col items-center gap-2 px-6 py-12 text-center" data-testid="coin-codes-empty">
                  <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground"><Ticket className="size-5" /></span>
                  <span className="text-[13px] font-semibold">{codeSearch ? txa('Aramaya uyan kod yok') : txa('Bu görünümde kod yok')}</span>
                  {codeStatus !== 'all' || codeTarget !== 'all' ? <Button size="sm" variant="outline" className="h-8 rounded-full text-[12px]" onClick={() => { setCodeTarget('all'); setView('all') }}>{txa('Tüm kodları göster')}</Button> : <Button size="sm" className="h-8 rounded-full text-[12px]" onClick={() => setGenerateOpen(true)}>{txa('İlk kodları üret')}</Button>}
                </div>
              ) : (
                <ul className={cn('min-h-0 divide-y divide-border/50 overflow-y-auto transition-opacity', codeLoading && 'opacity-60')} aria-label={txa('Kodlar')} onKeyDown={handleListKey} ref={listRef} data-testid="coin-codes-list">
                  {codes.map((item) => {
                    const status = resolveCodeStatus(item)
                    const current = item.id === focusedId
                    return (
                      <li key={item.id} className={cn('relative flex items-center gap-3 pl-4 transition-colors hover:bg-muted/40', current && 'bg-primary/[0.08] before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-primary')}>
                        <Tick checked={selectedIds.includes(item.id)} label={txa('{v1} seç', { v1: item.code })} onChange={(checked) => setSelectedIds((list) => (checked ? [...list, item.id] : list.filter((id) => id !== item.id)))} />
                        <button
                          type="button"
                          onClick={() => select(item)}
                          aria-current={current ? 'true' : undefined}
                          data-code-id={item.id}
                          data-testid={`coin-codes-row-${item.id}`}
                          className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pr-4 text-left outline-none focus-visible:bg-muted/50"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-mono text-[13px] font-semibold">{item.code}</span>
                            <span className="block truncate text-[11.5px] text-muted-foreground">
                              {txa('{v1} · {v2}/{v3} kullanım{v4}', { v1: formatCodeTarget(item.targetType), v2: item.usedCount, v3: item.maxUses, v4: item.seriesLabel ? ` · ${item.seriesLabel}` : '' })}
                            </span>
                          </span>
                          <span className="flex shrink-0 flex-col items-end gap-1">
                            <span className="text-[12px] font-bold tabular-nums text-amber-600 dark:text-amber-300">{item.value.toLocaleString(intlLocale())}</span>
                            {status.id !== 'active' ? <span className={cn('rounded-md px-1.5 py-px text-[10.5px] font-bold', STATUS_TONE[status.id])}>{status.label}</span> : null}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
              <Pager
                page={codePage}
                total={codeTotal}
                perPage={COIN_CODES_PER_PAGE}
                loading={codeLoading}
                canPrevious={codeCursorStack.length > 0}
                canNext={Boolean(nextCodeCursor)}
                onPrevious={() => {
                  setSelectedIds([])
                  setCodeCursor(codeCursorStack[codeCursorStack.length - 1])
                  setCodeCursorStack((previous) => previous.slice(0, -1))
                }}
                onNext={() => {
                  if (!nextCodeCursor) return
                  setSelectedIds([])
                  setCodeCursorStack((previous) => [...previous, codeCursor])
                  setCodeCursor(nextCodeCursor)
                }}
              />
            </div>

            {desk ? (detail ?? (
              <div className="flex flex-col items-center gap-2 rounded-[20px] border border-dashed border-border/80 px-6 py-16 text-center text-[12.5px] text-muted-foreground">
                <Inbox className="size-5" />{txa('Soldan bir kod seç.')}
              </div>
            )) : null}
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={eventSearchInput} onChange={(event) => setEventSearchInput(event.target.value)} maxLength={80} placeholder={txa('Kod, kullanıcı ya da fansub')} aria-label={txa('Kullanımlarda ara')} className="h-9 pl-9 text-[13px]" />
            </div>
            <Select value={eventTarget} onValueChange={(value) => { setEventTarget(value as ActivationTarget); setEventCursor(undefined); setEventCursorStack([]) }}>
              <SelectTrigger className="h-9 w-auto text-[13px]" aria-label={txa('Nereye')}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{txa('Tümü')}</SelectItem>
                <SelectItem value="user">{txa('Kişisel bakiye')}</SelectItem>
                <SelectItem value="fansub">{txa('Fansub kasası')}</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" className="h-9 gap-1.5" disabled={exporting || eventTotal === 0} onClick={() => { void exportEvents() }}><Download className="size-4" />{txa('CSV ({v1})', { v1: eventTotal.toLocaleString(intlLocale()) })}</Button>
          </div>

          {eventError ? <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-[13px] text-destructive">{eventError}</p> : null}

          <div className="flex min-w-0 flex-col overflow-hidden rounded-[20px] border border-border/70 bg-card/60 xl:min-h-0 xl:flex-1" aria-busy={eventLoading} data-testid="coin-usages">
            {eventLoading && events.length === 0 ? (
              <div className="flex flex-col gap-2 p-4">{[0, 1, 2, 3, 4].map((index) => <div key={index} className="h-12 animate-pulse rounded-xl bg-muted/40" />)}</div>
            ) : events.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-6 py-12 text-center text-[13px] font-semibold" data-testid="coin-usages-empty">
                <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground"><History className="size-5" /></span>
                {eventSearch ? txa('Aramaya uyan kullanım yok') : txa('Henüz kod kullanılmadı')}
              </div>
            ) : (
              <ul className={cn('min-h-0 divide-y divide-border/50 overflow-y-auto transition-opacity', eventLoading && 'opacity-60')} aria-label={txa('Kullanımlar')} data-testid="coin-usages-list">
                {events.map((item) => (
                  <li key={item.id} className="flex items-center gap-3 px-4 py-2.5">
                    {item.userAvatarUrl ? <img src={item.userAvatarUrl} alt="" loading="lazy" className="size-8 shrink-0 rounded-full border border-border bg-muted object-cover" /> : <span className="size-8 shrink-0 rounded-full bg-muted" />}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold">@{item.username} <span className="font-normal text-muted-foreground">→ {resolveUsageTarget(item)}</span></span>
                      <span className="block truncate font-mono text-[11.5px] text-muted-foreground">{item.code}</span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-[12px] font-bold tabular-nums text-amber-600 dark:text-amber-300">+{item.creditedValue.toLocaleString(intlLocale())}</span>
                      <span className="block text-[11px] tabular-nums text-muted-foreground">{formatDateTime(item.redeemedAt)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <Pager
              page={eventPage}
              total={eventTotal}
              perPage={COIN_CODES_PER_PAGE}
              loading={eventLoading}
              canPrevious={eventCursorStack.length > 0}
              canNext={Boolean(nextEventCursor)}
              onPrevious={() => {
                setEventCursor(eventCursorStack[eventCursorStack.length - 1])
                setEventCursorStack((previous) => previous.slice(0, -1))
              }}
              onNext={() => {
                if (!nextEventCursor) return
                setEventCursorStack((previous) => [...previous, eventCursor])
                setEventCursor(nextEventCursor)
              }}
            />
          </div>
        </>
      )}

      {!desk ? (
        <Sheet open={sheetOpen && Boolean(focused) && tab === 'codes'} onOpenChange={setSheetOpen}>
          <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-[520px]" onOpenAutoFocus={focusSheetContainer}>
            <SheetTitle className="sr-only">{txa('Kod ayrıntısı')}</SheetTitle>
            <SheetDescription className="sr-only">{txa('Kodu incele, kopyala ya da durumunu değiştir.')}</SheetDescription>
            {detail}
          </SheetContent>
        </Sheet>
      ) : null}

      <CoinCodeGenerateDialog
        open={generateOpen}
        onOpenChange={setGenerateOpen}
        onCreated={() => {
          setCodeStatus('all')
          setTab('codes')
          resetCodePage()
          void Promise.all([loadOverview(), loadCodes()])
        }}
      />

      <AdminReasonDialog
        isOpen={statusRequest !== null}
        title={statusRequest?.active ? txa('Kodu etkinleştir') : txa('Kodu pasife al')}
        description={statusRequest
          ? statusRequest.active
            ? txa('{v1}: süresi ve kullanım hakkı kaldıysa yeniden kullanılabilir olur. Neden denetim kaydına yazılır.', { v1: statusRequest.label })
            : txa('{v1}: hemen kullanılamaz olur; daha önce yüklenen coinler geri alınmaz. Neden denetim kaydına yazılır.', { v1: statusRequest.label })
          : ''}
        reason={statusReason}
        minLength={5}
        confirmLabel={statusRequest?.active ? txa('Etkinleştir') : txa('Pasife al')}
        isBusy={statusBusy}
        onReasonChange={setStatusReason}
        onClose={() => { if (!statusBusy) setStatusRequest(null) }}
        onConfirm={() => { void applyStatus() }}
      />
    </section>
  )
}

export default CoinCodeManagementSection
