import { useMemo, useState } from 'react'
import {
  Activity,
  Ban,
  BookOpen,
  Clock3,
  FileSearch,
  MessageCircle,
  Search,
  ShieldAlert,
  ShieldCheck,
  UserCog,
} from 'lucide-react'
import type {
  AdminUserActivityEvent,
  AdminUserDetailInsights,
  AdminUserModerationEvent,
  AdminUserModerationEventSource,
} from '@/services/adminUserService'
import { AdminSurface } from '@/components/admin/shared/AdminSurface'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { formatDateTime } from './adminUserDetailUtils'
import { intlLocale, txa } from '@/i18n/activeLocale'

type ActivityFilter = 'all' | AdminUserActivityEvent['type']
type ActivityPeriod = 7 | 30
type ModerationFilter = 'all' | AdminUserModerationEventSource

interface InsightsTabProps {
  insights: AdminUserDetailInsights | null
  unavailable?: boolean
  errorText?: string | null
}

export function AdminUserActivityTab({ insights, unavailable, errorText }: InsightsTabProps) {
  const [period, setPeriod] = useState<ActivityPeriod>(30)
  const [filter, setFilter] = useState<ActivityFilter>('all')
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  if (!insights) {
    return <InsightsEmptyState kind="activity" unavailable={unavailable} errorText={errorText} />
  }

  const visibleDays = insights.activity.daily.slice(-Math.min(period, insights.windowDays))
  const cutoff = visibleDays[0]?.date
  const events = insights.activity.events.filter((event) => {
    if (filter !== 'all' && event.type !== filter) return false
    const eventDate = event.createdAt.slice(0, 10)
    if (cutoff && eventDate < cutoff) return false
    return !selectedDate || eventDate === selectedDate
  })
  const visibleTotal = visibleDays.reduce((sum, day) => sum + day.total, 0)
  const visibleReads = visibleDays.reduce((sum, day) => sum + day.reads, 0)
  const visibleComments = visibleDays.reduce((sum, day) => sum + day.comments, 0)
  const visibleActiveDays = visibleDays.filter((day) => day.total > 0).length
  const maxDaily = Math.max(1, ...visibleDays.map((day) => day.total))

  return (
    <div className="grid items-start gap-3 xl:grid-cols-[11.5rem_minmax(0,1fr)_17rem]" data-testid="admin-user-detail-activity">
      <aside className="space-y-3">
        <AdminSurface className="p-3.5">
          <h3 className="text-sm font-semibold text-foreground">{txa('Aktivite Türleri')}</h3>
          <div className="mt-3 space-y-1.5" aria-label={txa('Aktivite türü filtresi')}>
            <ActivityFilterButton icon={Activity} label={txa('Tümü')} value={visibleTotal} active={filter === 'all'} onClick={() => setFilter('all')} />
            <ActivityFilterButton icon={BookOpen} label={txa('Okuma')} value={visibleReads} active={filter === 'user_read'} onClick={() => setFilter('user_read')} />
            <ActivityFilterButton icon={MessageCircle} label={txa('Yorumlar')} value={visibleComments} active={filter === 'user_comment'} onClick={() => setFilter('user_comment')} />
          </div>
        </AdminSurface>

        <AdminSurface className="p-3.5">
          <p className="text-xs font-semibold text-foreground">{txa('Dönem Özeti')}</p>
          <p className="mt-3 text-2xl font-semibold tabular-nums text-primary">{visibleActiveDays}</p>
          <p className="text-[10px] text-muted-foreground">{txa('aktif gün / {v1} gün', { v1: visibleDays.length })}</p>
          <div className="mt-3 border-t border-border pt-3 text-[10px] leading-4 text-muted-foreground">
            {txa('Oturum açma için güvenilir olay kaynağı bulunmadığından bu dağılıma eklenmez.')}
          </div>
        </AdminSurface>
      </aside>

      <div className="space-y-3">
        <AdminSurface className="p-3.5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-foreground">{txa('{v1} Günlük Aktivite Trendi', { v1: period })}</h3>
              <p className="mt-1 text-[10px] text-muted-foreground">{txa('Okuma ve manga yorumu olaylarından doğrulanır.')}</p>
            </div>
            <div className="flex rounded-lg border border-border bg-muted/30 p-1" aria-label={txa('Aktivite dönemi')}>
              {([7, 30] as const).map((days) => (
                <Button
                  key={days}
                  type="button"
                  variant={period === days ? 'secondary' : 'ghost'}
                  size="sm"
                  className="min-h-8 px-3 text-[11px]"
                  onClick={() => { setPeriod(days); setSelectedDate(null) }}
                >
                  {txa('{v1} Gün', { v1: days })}
                </Button>
              ))}
            </div>
          </div>

          <div className="mt-3 grid grid-cols-4 gap-1.5">
            <CompactMetric label={txa('Toplam')} value={visibleTotal} />
            <CompactMetric label={txa('Okuma')} value={visibleReads} />
            <CompactMetric label={txa('Yorum')} value={visibleComments} />
            <CompactMetric label={txa('Aktif gün')} value={visibleActiveDays} />
          </div>

          <div className="mt-3 flex h-32 items-end gap-1 rounded-lg border border-border bg-muted/15 px-2 pb-2 pt-5" role="img" aria-label={txa('{v1} günlük aktivite sütun grafiği', { v1: period })}>
            {visibleDays.map((day) => {
              const isSelected = selectedDate === day.date
              const height = day.total === 0 ? 4 : Math.max(12, Math.round((day.total / maxDaily) * 100))
              return (
                <button
                  key={day.date}
                  type="button"
                  className="group flex min-w-0 flex-1 items-end self-stretch rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`${new Date(`${day.date}T12:00:00`).toLocaleDateString(intlLocale())}: ${day.total} olay`}
                  aria-pressed={isSelected}
                  onClick={() => setSelectedDate(isSelected ? null : day.date)}
                >
                  <span className={cn('w-full rounded-sm bg-primary/60 transition-colors group-hover:bg-primary', isSelected && 'bg-primary')} style={{ height: `${height}%` }} />
                </button>
              )
            })}
          </div>
          <div className="mt-1.5 flex items-center justify-between text-[9px] text-muted-foreground">
            <span>{visibleDays[0] ? new Date(`${visibleDays[0].date}T12:00:00`).toLocaleDateString(intlLocale(), { day: 'numeric', month: 'short' }) : '-'}</span>
            <span>{selectedDate ? txa('{v1} seçili', { v1: new Date(`${selectedDate}T12:00:00`).toLocaleDateString(intlLocale()) }) : txa('Bir günü seçerek akışı süzün')}</span>
            <span>{txa('Bugün')}</span>
          </div>
        </AdminSurface>

        <div className="grid min-h-64 gap-3 lg:grid-cols-[0.9fr_1.1fr]">
          <ActivityHeatmap insights={insights} />
          <AdminSurface className="h-full p-3.5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-foreground">{txa('Aktivite Akışı')}</h3>
              {selectedDate ? (
                <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-[10px]" onClick={() => setSelectedDate(null)}>{txa('Günü temizle')}</Button>
              ) : null}
            </div>
            <div className="mt-2.5 space-y-1.5">
              {events.length === 0 ? <EmptyData text={txa('Bu filtrelerle eşleşen aktivite olayı yok.')} compact /> : events.slice(0, 4).map((event) => (
                <ActivityEventRow key={event.id} event={event} />
              ))}
            </div>
          </AdminSurface>
        </div>
      </div>

      <aside className="space-y-3">
        <AdminSurface className="p-3.5">
          <h3 className="text-sm font-semibold text-foreground">{txa('Etkileşim Dağılımı')}</h3>
          <div className="mt-3 space-y-3">
            <DistributionRow label={txa('Okuma')} value={visibleReads} total={visibleTotal} tone="primary" />
            <DistributionRow label={txa('Manga yorumu')} value={visibleComments} total={visibleTotal} tone="accent" />
          </div>
        </AdminSurface>

        <AdminSurface className="p-3.5">
          <h3 className="text-sm font-semibold text-foreground">{txa('Moderasyon Sinyalleri')}</h3>
          <div className="mt-3 space-y-2">
            <SignalRow label={txa('Kullanıcı raporları')} value={insights.moderation.reports.total} />
            <SignalRow label={txa('Güvenlik olayları')} value={insights.moderation.securityEventCount} />
            <SignalRow label={txa('Admin işlemleri')} value={insights.moderation.adminActionCount} />
            <SignalRow label={txa('Aktif yaptırım')} value={insights.moderation.currentBan.isBanned ? txa('Var') : txa('Yok')} positive={!insights.moderation.currentBan.isBanned} />
          </div>
        </AdminSurface>

        <AdminSurface className="p-3.5">
          <h3 className="text-sm font-semibold text-foreground">{txa('Son Sinyal')}</h3>
          <div className="mt-3 flex items-start gap-3 rounded-lg border border-border bg-muted/20 p-3">
            <Clock3 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
            <div>
              <p className="text-xs font-medium text-foreground">{insights.activity.lastAt ? formatDateTime(insights.activity.lastAt) : txa('Aktivite bulunmuyor')}</p>
              <p className="mt-1 text-[10px] leading-4 text-muted-foreground">{txa('Snapshot: {v1}', { v1: formatDateTime(insights.generatedAt) })}</p>
            </div>
          </div>
        </AdminSurface>
      </aside>
    </div>
  )
}

export function AdminUserModerationTab({ insights, unavailable, errorText }: InsightsTabProps) {
  const [filter, setFilter] = useState<ModerationFilter>('all')
  const [query, setQuery] = useState('')
  const events = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase(intlLocale())
    return insights?.moderation.events.filter((event) => {
      if (filter !== 'all' && event.source !== filter) return false
      if (!normalizedQuery) return true
      return [moderationEventLabel(event.type), event.summary, event.actorUsername, event.actorRole, outcomeLabel(event.outcome)]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase(intlLocale()).includes(normalizedQuery))
    }) ?? []
  }, [filter, insights, query])

  if (!insights) {
    return <InsightsEmptyState kind="moderation" unavailable={unavailable} errorText={errorText} />
  }

  const moderation = insights.moderation
  const totalEvents = moderation.events.length
  return (
    <div className="grid items-start gap-3 lg:grid-cols-[17rem_minmax(0,1fr)]" data-testid="admin-user-detail-moderation">
      <aside className="space-y-3">
        <AdminSurface className="p-3.5">
          <h3 className="text-sm font-semibold text-foreground">{txa('Moderasyon Özeti')}</h3>
          <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-1">
            <ModerationSummaryButton icon={Activity} label={txa('Toplam olay')} value={totalEvents} active={filter === 'all'} onClick={() => setFilter('all')} />
            <ModerationSummaryButton icon={FileSearch} label={txa('Kullanıcı raporları')} value={moderation.reports.total} active={filter === 'report'} onClick={() => setFilter(filter === 'report' ? 'all' : 'report')} />
            <ModerationSummaryButton icon={ShieldAlert} label={txa('Güvenlik olayları')} value={moderation.securityEventCount} active={filter === 'security'} onClick={() => setFilter(filter === 'security' ? 'all' : 'security')} />
            <ModerationSummaryButton icon={UserCog} label={txa('Admin işlemleri')} value={moderation.adminActionCount} active={filter === 'audit'} onClick={() => setFilter(filter === 'audit' ? 'all' : 'audit')} />
          </div>
        </AdminSurface>

        <AdminSurface className={cn('p-3.5', moderation.currentBan.isBanned ? 'border-destructive/40' : 'border-primary/25')}>
          <div className="flex items-center gap-2">
            {moderation.currentBan.isBanned ? <Ban className="size-4 text-destructive" aria-hidden="true" /> : <ShieldCheck className="size-4 text-primary" aria-hidden="true" />}
            <h3 className="text-sm font-semibold text-foreground">{txa('Mevcut Risk Durumu')}</h3>
          </div>
          <p className={cn('mt-3 text-lg font-semibold', moderation.currentBan.isBanned ? 'text-destructive' : 'text-primary')}>
            {moderation.currentBan.isBanned ? txa('Banlı') : txa('Aktif yaptırım yok')}
          </p>
          {moderation.currentBan.reason ? <p className="mt-2 text-[11px] leading-4 text-muted-foreground">{txa('Neden: {v1}', { v1: moderation.currentBan.reason })}</p> : null}
          {moderation.currentBan.until ? <p className="mt-1 text-[11px] text-muted-foreground">{txa('Bitiş: {v1}', { v1: formatDateTime(moderation.currentBan.until) })}</p> : null}
        </AdminSurface>

        <AdminSurface className="p-3.5">
          <h3 className="text-sm font-semibold text-foreground">{txa('Rapor Sonuçları')}</h3>
          <div className="mt-3 space-y-1.5 text-xs">
            <CountRow label={txa('Bekleyen')} value={moderation.reports.pending} />
            <CountRow label={txa('Çözülen')} value={moderation.reports.resolved} />
            <CountRow label={txa('Reddedilen')} value={moderation.reports.dismissed} />
          </div>
        </AdminSurface>
      </aside>

      <AdminSurface className="min-w-0 p-3.5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-foreground">{txa('Denetlenebilir Olay Akışı')}</h3>
            <p className="mt-1 text-[10px] text-muted-foreground">{txa('Aktör, sonuç ve zaman bilgileri sunucu kayıtlarından gelir.')}</p>
          </div>
          <div className="flex flex-wrap gap-1.5" aria-label={txa('Moderasyon kaynağı filtresi')}>
            {([['all', txa('Tümü')], ['security', txa('Güvenlik')], ['report', txa('Rapor')], ['audit', txa('Admin')]] as const).map(([value, label]) => (
              <Button key={value} type="button" variant={filter === value ? 'secondary' : 'outline'} size="sm" className="min-h-8 px-3 text-[10px]" onClick={() => setFilter(value)}>
                {label}
              </Button>
            ))}
          </div>
        </div>

        <label className="relative mt-3 block">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} className="h-9 pl-9 text-xs" placeholder={txa('Etkinlik, aktör veya sonuç ara...')} aria-label={txa('Moderasyon etkinliklerinde ara')} />
        </label>

        <div className="mt-3 overflow-hidden rounded-lg border border-border">
          <div className="hidden grid-cols-[9rem_minmax(0,1fr)_9rem_7.5rem] gap-3 border-b border-border bg-muted/35 px-3 py-2 text-[10px] font-semibold text-muted-foreground md:grid">
            <span>{txa('Tür')}</span><span>{txa('Açıklama')}</span><span>{txa('Aktör')}</span><span>{txa('Tarih / Sonuç')}</span>
          </div>
          <div className="divide-y divide-border">
            {events.length === 0 ? <EmptyData text={txa('Bu kaynakta moderasyon kaydı bulunmuyor.')} compact /> : events.slice(0, 8).map((event) => (
              <ModerationEventRow key={`${event.source}-${event.id}`} event={event} />
            ))}
          </div>
        </div>
        <p className="mt-2 text-[10px] text-muted-foreground">{txa('Toplam {v1} etkinlik', { v1: events.length.toLocaleString(intlLocale()) })}</p>
      </AdminSurface>
    </div>
  )
}

function ActivityHeatmap({ insights }: { insights: AdminUserDetailInsights }) {
  const weekdays = [txa('Pzt'), txa('Sal'), txa('Çar'), txa('Per'), txa('Cum'), txa('Cmt'), txa('Paz')]
  const hours = [0, 3, 6, 9, 12, 15, 18, 21]
  const bucketTotals = new Map<string, number>()
  for (const bucket of insights.activity.timeBuckets) {
    const hourGroup = Math.floor(bucket.hour / 3) * 3
    const key = `${bucket.weekday}-${hourGroup}`
    bucketTotals.set(key, (bucketTotals.get(key) ?? 0) + bucket.total)
  }
  const max = Math.max(1, ...bucketTotals.values())

  return (
    <AdminSurface className="h-full p-3.5">
      <h3 className="text-sm font-semibold text-foreground">{txa('Aktif Saatler')}</h3>
      <div className="mt-3 overflow-x-auto">
        <div className="grid min-w-[17rem] grid-cols-[2rem_repeat(8,minmax(1.2rem,1fr))] gap-1 text-[9px] text-muted-foreground">
          <span />
          {hours.map((hour) => <span key={hour} className="text-center">{String(hour).padStart(2, '0')}</span>)}
          {weekdays.map((day, dayIndex) => (
            <div key={day} className="contents">
              <span className="flex items-center">{day}</span>
              {hours.map((hour) => {
                const value = bucketTotals.get(`${dayIndex + 1}-${hour}`) ?? 0
                return (
                  <span key={hour} className="relative h-4 overflow-hidden rounded bg-muted" title={txa('{v1} {v2}:00 · {v3} olay', { v1: day, v2: String(hour).padStart(2, '0'), v3: value })}>
                    {value > 0 ? <span className="absolute inset-0 bg-primary" style={{ opacity: 0.18 + (value / max) * 0.82 }} /> : null}
                  </span>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </AdminSurface>
  )
}

function ActivityFilterButton({ icon: Icon, label, value, active, onClick }: { icon: typeof Activity; label: string; value: number; active: boolean; onClick: () => void }) {
  return (
    <button type="button" className={cn('flex min-h-9 w-full items-center gap-2 rounded-lg px-2.5 text-left transition-colors', active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted')} aria-pressed={active} onClick={onClick}>
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate text-[11px] font-medium">{label}</span>
      <Badge variant={active ? 'default' : 'secondary'} className="px-1.5 text-[9px]">{value.toLocaleString(intlLocale())}</Badge>
    </button>
  )
}

function CompactMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 px-2.5 py-2">
      <p className="text-sm font-semibold tabular-nums text-foreground">{value.toLocaleString(intlLocale())}</p>
      <p className="mt-0.5 truncate text-[9px] text-muted-foreground">{label}</p>
    </div>
  )
}

function ActivityEventRow({ event }: { event: AdminUserActivityEvent }) {
  const Icon = event.type === 'user_read' ? BookOpen : MessageCircle
  const title = event.type === 'user_read' ? txa('Okuma') : txa('Manga yorumu')
  const context = [event.mangaTitle, event.chapterNumber != null ? txa('{v1}. bölüm', { v1: event.chapterNumber }) : null].filter(Boolean).join(' · ')
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2 rounded-lg border border-border bg-muted/20 p-2 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
      <span className="flex size-7 items-center justify-center rounded-full bg-primary/10 text-primary"><Icon className="size-3.5" aria-hidden="true" /></span>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold text-foreground">{title}</p>
        <p className="truncate text-[10px] leading-4 text-muted-foreground">{context || event.summary || txa('Aktivite olayı')}</p>
      </div>
      <time className="col-start-2 text-[9px] text-muted-foreground sm:col-start-auto" dateTime={event.createdAt}>{formatDateTime(event.createdAt)}</time>
    </div>
  )
}

function ModerationEventRow({ event }: { event: AdminUserModerationEvent }) {
  const Icon = event.source === 'report' ? FileSearch : event.source === 'audit' ? UserCog : ShieldAlert
  const actor = event.actorUsername ? `@${event.actorUsername}` : txa('Sistem')
  return (
    <div className="grid gap-2 bg-card px-3 py-2.5 md:grid-cols-[9rem_minmax(0,1fr)_9rem_7.5rem] md:items-center md:gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-full', severityClass(event.severity))}><Icon className="size-3.5" aria-hidden="true" /></span>
        <p className="truncate text-[10px] font-semibold text-foreground">{moderationEventLabel(event.type)}</p>
      </div>
      <p className="line-clamp-2 text-[10px] leading-4 text-muted-foreground">{event.summary || txa('Açıklama bulunmuyor.')}</p>
      <div className="min-w-0">
        <p className="truncate text-[10px] font-medium text-foreground">{actor}</p>
        {event.actorRole ? <p className="text-[9px] text-muted-foreground">{event.actorRole}</p> : null}
      </div>
      <div>
        <time className="block text-[9px] text-muted-foreground" dateTime={event.createdAt}>{formatDateTime(event.createdAt)}</time>
        <Badge variant="outline" className="mt-1 text-[8px]">{outcomeLabel(event.outcome)}</Badge>
      </div>
    </div>
  )
}

function InsightsEmptyState({ kind, unavailable, errorText }: { kind: 'activity' | 'moderation'; unavailable?: boolean; errorText?: string | null }) {
  const Icon = kind === 'activity' ? Activity : ShieldCheck
  const title = kind === 'activity' ? txa('Aktivite verisi henüz hazır değil') : txa('Moderasyon geçmişi henüz hazır değil')
  return (
    <AdminSurface className="flex min-h-64 flex-col items-center justify-center border-dashed p-8 text-center">
      <span className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="size-5" aria-hidden="true" /></span>
      <h3 className="mt-4 text-sm font-semibold text-foreground">{title}</h3>
      <p className="mt-2 max-w-xl text-xs leading-5 text-muted-foreground">
        {errorText || (unavailable
          ? txa('Yeni admin detay okuma modeli veritabanına uygulandığında bu alan otomatik olarak gerçek kayıtlarla dolacak.')
          : txa('Doğrulanmış sunucu kayıtları yükleniyor.'))}
      </p>
      {unavailable ? <Badge variant="outline" className="mt-4">{txa('Veritabanı migrationı bekleniyor')}</Badge> : null}
    </AdminSurface>
  )
}

function DistributionRow({ label, value, total, tone }: { label: string; value: number; total: number; tone: 'primary' | 'accent' }) {
  const percent = total > 0 ? Math.round((value / total) * 100) : 0
  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-xs"><span>{label}</span><span className="tabular-nums text-muted-foreground">{value} · %{percent}</span></div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted"><div className={cn('h-full rounded-full', tone === 'primary' ? 'bg-primary' : 'bg-amber-500')} style={{ width: `${percent}%` }} /></div>
    </div>
  )
}

function SignalRow({ label, value, positive = false }: { label: string; value: number | string; positive?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/70 pb-2 last:border-0 last:pb-0">
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <strong className={cn('text-xs tabular-nums text-foreground', positive && 'text-emerald-600 dark:text-emerald-400')}>{value}</strong>
    </div>
  )
}

function ModerationSummaryButton({ icon: Icon, label, value, active, onClick }: { icon: typeof FileSearch; label: string; value: number; active: boolean; onClick: () => void }) {
  return (
    <button type="button" className={cn('grid min-h-13 w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-lg border p-2.5 text-left transition-colors', active ? 'border-primary/40 bg-primary/10' : 'border-border bg-muted/20 hover:bg-muted/40')} aria-pressed={active} onClick={onClick}>
      <Icon className="size-4 text-primary" aria-hidden="true" /><span className="text-[11px] font-medium text-foreground">{label}</span><strong className="tabular-nums text-foreground">{value}</strong>
    </button>
  )
}

function CountRow({ label, value }: { label: string; value: number }) {
  return <div className="flex items-center justify-between gap-3 rounded-md bg-muted/30 px-2.5 py-1.5"><span className="text-muted-foreground">{label}</span><strong className="tabular-nums text-foreground">{value}</strong></div>
}

function EmptyData({ text, compact = false }: { text: string; compact?: boolean }) {
  return <p className={cn('border-dashed border-border text-center text-xs text-muted-foreground', compact ? 'p-5' : 'rounded-lg border p-6')}>{text}</p>
}

function severityClass(severity: AdminUserModerationEvent['severity']) {
  if (severity === 'critical' || severity === 'high') return 'bg-destructive/10 text-destructive'
  if (severity === 'medium') return 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
  return 'bg-primary/10 text-primary'
}

function moderationEventLabel(type: string) {
  if (type === 'user_banned') return txa('Kullanıcı banlandı')
  if (type === 'user_unbanned') return txa('Kullanıcı banı kaldırıldı')
  if (type === 'user_role_changed') return txa('Rol değiştirildi')
  if (type === 'user_report') return txa('Kullanıcı raporlandı')
  return type.split('.').join(' ')
}

function outcomeLabel(outcome: string) {
  if (outcome === 'pending') return txa('Bekliyor')
  if (outcome === 'resolved') return txa('Çözüldü')
  if (outcome === 'dismissed') return txa('Reddedildi')
  if (outcome === 'enforced') return txa('Uygulandı')
  return txa('Tamamlandı')
}
