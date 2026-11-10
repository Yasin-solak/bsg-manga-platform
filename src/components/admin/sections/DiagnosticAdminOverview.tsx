import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Activity, BellRing, Check, ChevronLeft, ChevronRight, Gauge, Inbox, LayoutList, RefreshCw, Search, ShieldCheck, Users, type LucideIcon } from 'lucide-react'
import { toUserFacingErrorMessage } from '@/services/userFacingError'
import { readDiagnosticOverview, acknowledgeDiagnosticAlert, setDiagnosticCollection, type DiagnosticOverview } from '@/services/diagnosticsService'
import { AdminConfirmDialog, type AdminConfirmRequest } from '../shared/AdminConfirmDialog'
import { AdminSectionHeader } from '../shared/AdminSectionHeader'
import { focusSheetContainer, useDeskLayout } from '../shared/useDeskLayout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { ReviewOwner, ReviewReport } from './AdminReviewShared'
import { reviewDate } from './adminReviewFormat'
import { intlLocale, txa } from '@/i18n/activeLocale'

/**
 * Diagnostics v2: technical event desk. The summary strip opens views; events are
 * listed on the left, the selected event's report on the right (in a drawer on narrow screens).
 * Long lists are paged. Turning collection off needs confirmation: no new records arrive.
 */
const metricNames: Record<string, string> = { get lcp() { return txa('Ana içeriğin görünmesi') }, get inp() { return txa('Etkileşim gecikmesi') }, get cls() { return txa('Sayfa kayması') }, get fcp() { return txa('İlk içeriğin görünmesi') }, get ttfb() { return txa('Sunucu yanıtı') }, get service_error() { return txa('Servis hatası') }, get ui_error() { return txa('Arayüz hatası') }, get promise_error() { return txa('İşlenmeyen hata') }, get media_error() { return txa('Görsel/medya hatası') }, get render_error() { return txa('Görüntüleme hatası') }, get cleanup_delayed() { return txa('Temizlik gecikmesi') } }

// web.dev esikleri (p75): iyi / gelistirilmeli sinirlari.
const VITALS: Record<string, [number, number]> = { lcp: [2500, 4000], inp: [200, 500], cls: [0.1, 0.25], fcp: [1800, 3000], ttfb: [800, 1800] }
const PER_PAGE = 12

type Tab = 'alerts' | 'events' | 'performance' | 'groups'
type DiagnosticEventRow = DiagnosticOverview['recent'][number]

function vitalTone(code: string, value: number) {
  const limits = VITALS[code]
  if (!limits) return { dot: 'bg-muted-foreground/40', label: '' }
  if (value <= limits[0]) return { dot: 'bg-emerald-500', label: txa('İyi') }
  if (value <= limits[1]) return { dot: 'bg-amber-500', label: txa('Geliştirilmeli') }
  return { dot: 'bg-rose-500', label: txa('Zayıf') }
}

function Pager({ page, total, onPage }: { page: number; total: number; onPage: (next: number) => void }) {
  if (total <= PER_PAGE) return null
  const last = Math.ceil(total / PER_PAGE)
  return (
    <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-border/60 px-4 py-2 text-[12px] text-muted-foreground">
      <span className="tabular-nums">{(page - 1) * PER_PAGE + 1}–{Math.min(total, page * PER_PAGE)} / {total.toLocaleString(intlLocale())}</span>
      <span className="flex gap-1">
        <Button size="icon-sm" variant="ghost" aria-label={txa('Önceki sayfa')} disabled={page <= 1} onClick={() => onPage(page - 1)}><ChevronLeft className="size-4" /></Button>
        <Button size="icon-sm" variant="ghost" aria-label={txa('Sonraki sayfa')} disabled={page >= last} onClick={() => onPage(page + 1)}><ChevronRight className="size-4" /></Button>
      </span>
    </footer>
  )
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col items-center gap-2 px-6 py-12 text-center text-[13px] text-muted-foreground" role="status"><Inbox className="size-5" />{children}</div>
}

function EventDetail({ event }: { event: DiagnosticEventRow }) {
  return (
    <div className="min-w-0 space-y-4 p-5" data-testid="admin-diagnostics-detail">
      <div className="min-w-0">
        <h2 className="text-[15px] font-bold">{metricNames[event.code] || event.code}</h2>
        <p className="mt-1 break-words text-[12px] text-muted-foreground">{event.route} · {reviewDate(event.created_at)}</p>
      </div>
      <ReviewOwner username={event.username} id={event.user_id} />
      <div>
        <h3 className="mb-1.5 text-[12px] font-semibold text-muted-foreground">{txa('Teknik rapor')}</h3>
        <ReviewReport value={event.technical} />
      </div>
    </div>
  )
}

export function DiagnosticAdminOverview() {
  const [data, setData] = useState<DiagnosticOverview | null>(null)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const generation = useRef(0)
  const run = useCallback(async (action?: () => Promise<void>) => {
    const current = ++generation.current
    setBusy(true)
    setError('')
    try {
      await action?.()
      const next = await readDiagnosticOverview()
      if (current === generation.current) setData(next)
    } catch (reason) {
      if (current === generation.current) setError(toUserFacingErrorMessage(reason, txa('Tanılama özeti yüklenemedi.')))
    } finally {
      if (current === generation.current) setBusy(false)
    }
  }, [])
  const cancel = useCallback(() => { generation.current++ }, [])
  useEffect(() => { void run(); return cancel }, [run, cancel])
  return <AdminDiagnosticsView data={data} busy={busy} error={error} onRefresh={() => void run()} onCollection={(value) => run(() => setDiagnosticCollection(value))} onAcknowledge={(id) => void run(() => acknowledgeDiagnosticAlert(id))} />
}

export function AdminDiagnosticsView({ data, busy, error, onRefresh, onCollection, onAcknowledge }: {
  data: DiagnosticOverview | null
  busy: boolean
  error: string
  onRefresh: () => void
  onCollection: (value: boolean) => Promise<void>
  onAcknowledge: (id: string) => void
}) {
  const desk = useDeskLayout()
  const [tab, setTab] = useState<Tab>('alerts')
  const [search, setSearch] = useState('')
  const [onlyPending, setOnlyPending] = useState(true)
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [confirm, setConfirm] = useState<AdminConfirmRequest | null>(null)
  const [confirmBusy, setConfirmBusy] = useState(false)

  const pendingAlerts = useMemo(() => (data?.alerts ?? []).filter((alert) => !alert.acknowledged_at).length, [data])
  const events = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase(intlLocale())
    return (data?.recent ?? []).filter((event) => !needle || `${event.username || ''} ${event.user_id} ${metricNames[event.code] || event.code} ${event.route}`.toLocaleLowerCase(intlLocale()).includes(needle))
  }, [data, search])
  const alerts = useMemo(() => (data?.alerts ?? []).filter((alert) => !onlyPending || !alert.acknowledged_at), [data, onlyPending])
  const groups = data?.groups ?? []
  const metrics = data?.metrics ?? []
  const selected = events.find((event) => event.id === selectedId) ?? null

  const switchTab = (next: Tab) => {
    setTab(next)
    setPage(1)
  }
  const slice = <T,>(rows: T[]) => rows.slice((page - 1) * PER_PAGE, page * PER_PAGE)

  const askCollection = (value: boolean) => {
    if (value) {
      void onCollection(true)
      return
    }
    setConfirm({
      title: txa('Tanılama toplamayı kapat'),
      subject: txa('Tüm kullanıcılar için'),
      consequence: txa('Kapatınca yeni kayıtlar sunucuda reddedilir. Kullanıcıların tercihleri korunur.'),
      confirmLabel: txa('Kapat'),
      destructive: true,
      run: () => onCollection(false),
    })
  }

  const strip: Array<{ id: string; label: string; value: string; hint: string; icon: LucideIcon; tone: string; tab?: Tab; alert?: boolean }> = data ? [
    { id: 'alerts', label: txa('Bekleyen alarm'), value: pendingAlerts.toLocaleString(intlLocale()), hint: txa('15 dakikada bir denetlenir'), icon: BellRing, tone: pendingAlerts ? 'bg-rose-500/10 text-rose-500' : 'bg-emerald-500/10 text-emerald-500', tab: 'alerts', alert: pendingAlerts > 0 },
    { id: 'events', label: txa('Teknik olay'), value: data.total.toLocaleString(intlLocale()), hint: txa('Son 14 gün'), icon: Activity, tone: 'bg-sky-500/10 text-sky-500', tab: 'events' },
    { id: 'accounts', label: txa('İlgili hesap'), value: data.accounts.toLocaleString(intlLocale()), hint: txa('Son 14 gün'), icon: Users, tone: 'bg-violet-500/10 text-violet-500', tab: 'groups' },
    { id: 'performance', label: txa('Performans ölçümleri'), value: metrics.length.toLocaleString(intlLocale()), hint: txa('Tam sayfa açılışları'), icon: Gauge, tone: 'bg-amber-500/10 text-amber-500', tab: 'performance' },
  ] : []

  const TABS: Array<[Tab, string, LucideIcon]> = [['alerts', txa('Alarmlar'), BellRing], ['events', txa('Olaylar'), Activity], ['performance', txa('Performans'), Gauge], ['groups', txa('Dağılım'), LayoutList]]

  return (
    <section className="flex flex-col gap-4 xl:min-h-0 xl:flex-1" aria-busy={busy} data-testid="admin-diagnostics">
      <AdminSectionHeader
        title={txa('Tanılama')}
        description={txa('Teknik olayları, performansı ve inceleme bekleyen alarmları takip et.')}
        actions={<Button variant="outline" size="sm" disabled={busy} onClick={onRefresh}><RefreshCw className={cn('size-3.5', busy && 'animate-spin')} />{txa('Yenile')}</Button>}
      />
      {error ? <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-[13px] text-destructive">{error}{data ? txa(' Son başarıyla yüklenen veriler gösteriliyor.') : ''}</p> : null}

      {!data ? (
        <div className="rounded-[20px] border border-border/70 bg-card/60"><EmptyRow>{busy ? txa('Tanılama verileri yükleniyor…') : txa('Özet yüklenemedi. Yenile düğmesiyle tekrar dene.')}</EmptyRow></div>
      ) : (
        <>
          <section className="overflow-hidden rounded-[20px] border border-border/70 bg-card/60" aria-label={txa('Tanılama özeti')} data-testid="admin-diagnostics-strip">
            <div className="-mb-px -mr-px grid grid-cols-2 xl:grid-cols-5 [&>*]:border-b [&>*]:border-r [&>*]:border-border/60">
              {strip.map((item) => (
                <button key={item.id} type="button" aria-pressed={tab === item.tab} onClick={() => item.tab && switchTab(item.tab)} className="flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/30">
                  <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-xl max-sm:hidden', item.tone)}><item.icon className="size-[18px]" /></span>
                  <span className="min-w-0">
                    <span className="block truncate text-[11.5px] font-semibold text-muted-foreground">{item.label}</span>
                    <span className={cn('block text-[20px] font-black leading-tight tabular-nums', item.alert && 'text-rose-600 dark:text-rose-400')}>{item.value}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">{item.hint}</span>
                  </span>
                </button>
              ))}
              <div className="flex items-center gap-3 px-4 py-3">
                <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-xl max-sm:hidden', data.collection_enabled ? 'bg-emerald-500/10 text-emerald-500' : 'bg-muted text-muted-foreground')}><ShieldCheck className="size-[18px]" /></span>
                <span className="min-w-0 flex-1">
                  <label htmlFor="admin-diagnostic-collection" className="block truncate text-[11.5px] font-semibold text-muted-foreground">{txa('Toplama')}</label>
                  <span className="block text-[14px] font-bold">{data.collection_enabled ? txa('Toplanıyor') : txa('Kapalı')}</span>
                </span>
                <Switch id="admin-diagnostic-collection" aria-label={txa('Tanılama toplama')} checked={data.collection_enabled} disabled={busy} onCheckedChange={askCollection} />
              </div>
            </div>
          </section>

          <div className="inline-flex self-start rounded-xl bg-muted/60 p-1" role="tablist" aria-label={txa('Tanılama kayıtları')}>
            {TABS.map(([id, label, Icon]) => (
              <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => switchTab(id)} data-testid={`admin-diagnostics-tab-${id}`} className={cn('inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-semibold transition-colors', tab === id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
                <Icon className="size-3.5" />{label}
              </button>
            ))}
          </div>

          {tab === 'alerts' ? (
            <div className="flex min-w-0 flex-col overflow-hidden rounded-[20px] border border-border/70 bg-card/60 xl:min-h-0 xl:flex-1" data-testid="admin-diagnostics-alerts">
              <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border/60 px-4 py-2.5">
                <p className="text-[12px] text-muted-foreground">{txa('Son saatte en az 20 örnek ve 5 hesap')}</p>
                <Button variant="ghost" size="sm" onClick={() => { setOnlyPending((value) => !value); setPage(1) }}>{onlyPending ? txa('Tüm alarmları göster') : txa('Yalnız bekleyenler')}</Button>
              </header>
              {!alerts.length ? <EmptyRow>{onlyPending ? txa('İnceleme bekleyen alarm yok.') : txa('Alarm eşiğine ulaşan kayıt yok.')}</EmptyRow> : (
                <ul className="min-h-0 flex-1 divide-y divide-border/50 overflow-y-auto">
                  {slice(alerts).map((alert) => (
                    <li key={alert.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                      <span className="min-w-[200px] flex-1">
                        <span className="block text-[13.5px] font-semibold">{metricNames[alert.kind] || alert.kind}</span>
                        <span className="block break-words text-[12px] text-muted-foreground">{alert.dimension}</span>
                      </span>
                      <span className="text-[12px] tabular-nums text-muted-foreground">{txa('{v1} örnek', { v1: alert.samples })} · {txa('Değer: {v1}', { v1: alert.value ?? '—' })}</span>
                      <span className="text-[12px] text-muted-foreground">{reviewDate(alert.created_at)}</span>
                      {alert.acknowledged_at
                        ? <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-emerald-700 dark:text-emerald-300"><Check className="size-3.5" />{txa('İncelendi')}</span>
                        : <Button size="sm" variant="outline" disabled={busy} onClick={() => onAcknowledge(alert.id)}>{txa('İncelendi işaretle')}</Button>}
                    </li>
                  ))}
                </ul>
              )}
              <Pager page={page} total={alerts.length} onPage={setPage} />
            </div>
          ) : null}

          {tab === 'events' ? (
            <div className="grid items-start gap-4 xl:min-h-0 xl:flex-1 xl:grid-cols-[minmax(0,460px)_minmax(0,1fr)] xl:grid-rows-[minmax(0,1fr)]" data-testid="admin-diagnostics-events">
              <div className="flex min-w-0 flex-col overflow-hidden rounded-[20px] border border-border/70 bg-card/60 xl:h-full xl:min-h-0">
                <header className="shrink-0 border-b border-border/60 p-3">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input className="pl-9" aria-label={txa('Son olaylarda ara')} placeholder={txa('Kullanıcı, olay veya sayfa ara…')} value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} />
                  </div>
                  <p className="mt-2 text-[11.5px] text-muted-foreground">{txa('Son 50 olay · arama bu kayıtlar içindedir.')}</p>
                </header>
                {!events.length ? <EmptyRow>{txa('Gösterilecek olay yok.')}</EmptyRow> : (
                  <ul className="min-h-0 flex-1 divide-y divide-border/50 overflow-y-auto">
                    {slice(events).map((event) => (
                      <li key={event.id}>
                        <button type="button" aria-pressed={selectedId === event.id} onClick={() => { setSelectedId(event.id); setSheetOpen(true) }} className={cn('block w-full px-4 py-2.5 text-left transition-colors hover:bg-muted/30', selectedId === event.id && 'bg-muted/50')}>
                          <span className="flex items-baseline justify-between gap-2">
                            <span className="truncate text-[13.5px] font-semibold">{metricNames[event.code] || event.code}</span>
                            <span className="shrink-0 text-[11.5px] text-muted-foreground">{reviewDate(event.created_at)}</span>
                          </span>
                          <span className="block truncate text-[12px] text-muted-foreground">{event.username ? `@${event.username}` : txa('Kullanıcı adı bulunamadı')} · {event.route}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <Pager page={page} total={events.length} onPage={setPage} />
              </div>
              {desk ? (
                <div className="h-full min-h-0 min-w-0 overflow-y-auto rounded-[20px] border border-border/70 bg-card/60">
                  {selected ? <EventDetail event={selected} /> : <EmptyRow>{txa('Soldan bir olay seç.')}</EmptyRow>}
                </div>
              ) : (
                <Sheet open={sheetOpen && Boolean(selected)} onOpenChange={setSheetOpen}>
                  <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-[520px]" onOpenAutoFocus={focusSheetContainer}>
                    <SheetTitle className="sr-only">{txa('Teknik olay ayrıntısı')}</SheetTitle>
                    <SheetDescription className="sr-only">{txa('Olayın sahibi ve kaydedilen teknik rapor.')}</SheetDescription>
                    {selected ? <EventDetail event={selected} /> : null}
                  </SheetContent>
                </Sheet>
              )}
            </div>
          ) : null}

          {tab === 'performance' ? (
            <div className="min-w-0 overflow-hidden rounded-[20px] border border-border/70 bg-card/60 xl:min-h-0 xl:overflow-y-auto" data-testid="admin-diagnostics-performance">
              <p className="border-b border-border/60 px-4 py-2.5 text-[12px] text-muted-foreground">{txa('Son 14 gün · Tam sayfa açılışları örneklemi. Eksik ölçümler sıfır olarak gösterilmez.')}</p>
              {!metrics.length ? <EmptyRow>{txa('Henüz performans ölçümü yok.')}</EmptyRow> : (
                <ul className="divide-y divide-border/50">
                  {metrics.map((metric) => {
                    const tone = vitalTone(metric.code, metric.p75)
                    const format = (value: number) => `${value.toLocaleString(intlLocale(), { maximumFractionDigits: 3 })}${metric.code === 'cls' ? '' : ' ms'}`
                    return (
                      <li key={metric.code} className="grid grid-cols-2 items-center gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_repeat(3,90px)_70px]">
                        <span className="col-span-2 min-w-0 sm:col-span-1">
                          <span className="flex items-center gap-2 text-[13.5px] font-semibold"><span className={cn('size-2 rounded-full', tone.dot)} aria-hidden="true" />{metric.code.toUpperCase()}{tone.label ? <span className="text-[11.5px] font-medium text-muted-foreground">{tone.label}</span> : null}</span>
                          <span className="block truncate text-[12px] text-muted-foreground">{metricNames[metric.code]}</span>
                        </span>
                        {([['p50', metric.p50], ['p75', metric.p75], ['p95', metric.p95]] as const).map(([label, value]) => (
                          <span key={label}><span className="block text-[11px] text-muted-foreground">{label}</span><span className="text-[13px] font-semibold tabular-nums">{format(value)}</span></span>
                        ))}
                        <span><span className="block text-[11px] text-muted-foreground">{txa('Örnek')}</span><span className="text-[13px] font-semibold tabular-nums">{metric.samples.toLocaleString(intlLocale())}</span></span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          ) : null}

          {tab === 'groups' ? (
            <div className="flex min-w-0 flex-col overflow-hidden rounded-[20px] border border-border/70 bg-card/60 xl:min-h-0 xl:flex-1" data-testid="admin-diagnostics-groups">
              <p className="shrink-0 border-b border-border/60 px-4 py-2.5 text-[12px] text-muted-foreground">{txa('Olay, sayfa, cihaz ve uygulama sürümüne göre gruplanır.')}</p>
              {!groups.length ? <EmptyRow>{txa('Henüz dağılım verisi yok.')}</EmptyRow> : (
                <ul className="min-h-0 flex-1 divide-y divide-border/50 overflow-y-auto">
                  {slice(groups).map((group, index) => (
                    <li key={`${group.code}-${group.route}-${group.device}-${group.build}-${index}`} className="flex items-center gap-3 px-4 py-2.5">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-semibold">{metricNames[group.code] || group.code}</span>
                        <span className="block truncate text-[12px] text-muted-foreground">{group.route} · {group.device} · {group.build}</span>
                      </span>
                      <span className="shrink-0 text-[15px] font-black tabular-nums">{group.count.toLocaleString(intlLocale())}</span>
                    </li>
                  ))}
                </ul>
              )}
              <Pager page={page} total={groups.length} onPage={setPage} />
            </div>
          ) : null}

          <p className="shrink-0 text-[11.5px] leading-5 text-muted-foreground">
            {txa('Bu kayıtlar tanılaması açık kullanıcıların örneklemidir; tüm sitenin hata oranını göstermez. Yönetici erişimleri kaydedilir.')}{' '}
            {txa('Teknik temizlik: {v1} · Görsel temizliği: {v2}', { v1: reviewDate(data.cleanup_at), v2: reviewDate(data.screenshot_cleanup_at) })}
          </p>
        </>
      )}

      <AdminConfirmDialog
        request={confirm}
        busy={confirmBusy}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          if (!confirm) return
          setConfirmBusy(true)
          void confirm.run().finally(() => {
            setConfirmBusy(false)
            setConfirm(null)
          })
        }}
      />
    </section>
  )
}
