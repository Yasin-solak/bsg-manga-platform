/**
 * FansubYonetStatsTab v2: studio 'Statistics' tab.
 *
 * A one-row metric strip, a selectable daily bar chart (with 7 / 30 day summaries),
 * series performance, status distribution and recent management actions (audit log).
 */
import { useCallback, useEffect, useState } from 'react'
import {
  ArrowClockwise,
  BookOpen,
  ChartBar,
  Coins,
  Eye,
  ShieldCheck,
  Stack,
  Users,
} from '@phosphor-icons/react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  getFansubManageActivityTimeseries,
  getFansubManageAnalyticsSummary,
  type FansubManageActivityTimeseries,
  type FansubManageAnalyticsActivityItem,
  type FansubManageAnalyticsSummary,
} from '@/services/fansubManageService'
import type { FansubBoostSnapshot } from '@/services/fansubBoostService'
import { StudioDailyBars } from '@/components/fansub/StudioCharts'
import { Panel } from '@/pages/profile/ProfileTabKit'
import { formatCompact, formatRelative } from './FansubYonetOverviewPanels'
import { StudioStatStrip } from './StudioStatStrip'
import { intlLocale, txa } from '@/i18n/activeLocale'

type HeroMetricKey = 'followers' | 'chapters' | 'donationAmount'

const HERO_METRICS: Array<{ key: HeroMetricKey; label: string; unit: string; bar: string }> = [
  { key: 'followers', get label() { return txa('Takipçi') }, get unit() { return txa('yeni takipçi') }, bar: 'bg-primary' },
  { key: 'chapters', get label() { return txa('Bölüm') }, get unit() { return txa('yeni bölüm') }, bar: 'bg-violet-400' },
  { key: 'donationAmount', get label() { return txa('Bağış') }, get unit() { return txa('coin bağış') }, bar: 'bg-amber-400' },
]

type FansubYonetStatsTabProps = {
  fansubId: string
  fansubName: string
  boostSnapshot: FansubBoostSnapshot | null
}

function formatNumber(value: number) {
  return Math.max(0, value || 0).toLocaleString(intlLocale())
}

function actorInitials(value: string | null) {
  if (!value) return '?'
  return value.trim().split(/\s+/).slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join('')
}

function formatActorRole(role: string) {
  switch (role) {
    case 'site_admin':
      return txa('Site yöneticisi')
    case 'fansub_admin':
      return txa('Admin')
    case 'fansub_moderator':
      return txa('Moderatör')
    default:
      return txa('Ekip')
  }
}

function formatActivityAction(action: string) {
  switch (action) {
    case 'fansub.profile.upsert':
      return txa('Profil')
    case 'fansub.member.role.update':
      return txa('Rol')
    case 'fansub.member.remove':
      return txa('Üye')
    case 'fansub.chapter.remove':
      return txa('Bölüm')
    default:
      return txa('Hareket')
  }
}

function ActivityRow({ item }: { item: FansubManageAnalyticsActivityItem }) {
  return (
    <li className="flex items-center gap-3 py-2">
      <Avatar size="sm" className="border border-border/70 bg-background">
        {item.actor.avatarUrl ? <AvatarImage src={item.actor.avatarUrl} alt="" /> : null}
        <AvatarFallback>{actorInitials(item.actor.username)}</AvatarFallback>
      </Avatar>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold" title={item.summary}>{item.summary}</span>
        <span className="block truncate text-[11.5px] text-muted-foreground">
          {item.actor.username || txa('Bilinmeyen kullanıcı')} · {formatActorRole(item.actor.role)} · {formatRelative(item.createdAt)}
        </span>
      </span>
      <span className="flex-none rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold text-muted-foreground">{formatActivityAction(item.action)}</span>
    </li>
  )
}

/** One-row stacked status bar. */
function StatusBar({ label, segments }: { label: string, segments: Array<{ label: string, value: number, bar: string }> }) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0)
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-[12.5px]">
        <span className="font-semibold">{label}</span>
        <span className="tabular-nums text-muted-foreground">{formatNumber(total)}</span>
      </div>
      <div className="flex h-2 overflow-hidden rounded-full bg-foreground/[0.06]">
        {total > 0 && segments.map((segment) => segment.value > 0 && (
          <span key={segment.label} className={segment.bar} style={{ width: `${(segment.value / total) * 100}%` }} />
        ))}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
        {segments.map((segment) => (
          <span key={segment.label} className="inline-flex items-center gap-1">
            <span className={cn('size-1.5 rounded-full', segment.bar)} />{segment.label} <b className="tabular-nums text-foreground">{formatNumber(segment.value)}</b>
          </span>
        ))}
      </div>
    </div>
  )
}

export default function FansubYonetStatsTab({
  fansubId,
  fansubName,
  boostSnapshot,
}: FansubYonetStatsTabProps) {
  const [analytics, setAnalytics] = useState<FansubManageAnalyticsSummary | null>(null)
  const [timeseries, setTimeseries] = useState<FansubManageActivityTimeseries | null>(null)
  const [heroMetric, setHeroMetric] = useState<HeroMetricKey>('followers')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const hasAdvancedAnalytics = boostSnapshot?.capabilities?.hasAdvancedAnalytics === true

  const loadAnalytics = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [summary, series] = await Promise.all([
        getFansubManageAnalyticsSummary(fansubId),
        getFansubManageActivityTimeseries(fansubId, 30).catch(() => null),
      ])
      setAnalytics(summary)
      setTimeseries(series)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : txa('İstatistikler yüklenemedi.'))
      setAnalytics(null)
      setTimeseries(null)
    } finally {
      setLoading(false)
    }
  }, [fansubId])

  useEffect(() => {
    void loadAnalytics()
  }, [loadAnalytics])

  const overview = analytics?.overview
  const momentum = analytics?.momentum
  const statuses = analytics?.statuses
  const topMangas = analytics?.topMangas || []
  const recentActivity = analytics?.recentActivity || []

  if (loading && !analytics) {
    return <Panel><p className="py-10 text-center text-[13px] text-muted-foreground">{txa('İstatistikler yükleniyor…')}</p></Panel>
  }

  if (error || !overview || !momentum || !statuses) {
    return (
      <section className="flex flex-col gap-3 rounded-[20px] border border-destructive/40 bg-card/60 p-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-destructive">{error || txa('İstatistikler yüklenemedi.')}</p>
        <Button type="button" variant="outline" onClick={() => { void loadAnalytics() }}>{txa('Tekrar dene')}</Button>
      </section>
    )
  }

  const activeHero = HERO_METRICS.find((metric) => metric.key === heroMetric) ?? HERO_METRICS[0]
  const heroSeries = timeseries ? timeseries[activeHero.key] : []
  const heroDays = timeseries?.days || []
  const heroTotal = heroSeries.reduce((sum, value) => sum + value, 0)
  const heroWeek = heroSeries.slice(-7).reduce((sum, value) => sum + value, 0)
  const formatDay = (day?: string) => (day ? new Date(`${day}T00:00:00`).toLocaleDateString(intlLocale(), { day: 'numeric', month: 'short' }) : '')
  const maxViews = Math.max(1, ...topMangas.map((manga) => manga.totalViews))

  return (
    <div className="flex flex-col gap-4" data-testid="studio-stats">
      <StudioStatStrip
        items={[
          { key: 'followers', icon: Users, tone: 'primary', label: txa('Takipçi'), value: formatCompact(overview.followerCount), sub: txa('7 günde +{v1}', { v1: formatNumber(momentum.newFollowers7d) }) },
          { key: 'views', icon: Eye, tone: 'sky', label: txa('Görüntülenme'), value: formatCompact(overview.totalViews), sub: `${formatNumber(overview.totalMangaCount)} seride` },
          { key: 'chapters', icon: Stack, tone: 'violet', label: txa('Bölüm'), value: formatNumber(overview.totalChapterCount), sub: txa('30 günde +{v1}', { v1: formatNumber(momentum.newChapters30d) }) },
          { key: 'donations', icon: Coins, tone: 'amber', label: txa('Bağış'), value: formatCompact(overview.totalDonationAmount), sub: txa('{v1} bağış · {v2}', { v1: formatNumber(overview.totalDonationCount), v2: overview.lastDonationAt ? formatRelative(overview.lastDonationAt) : txa('henüz yok') }) },
        ]}
      />

      <Panel
        title={txa('Günlük akış')}
        icon={ChartBar}
        tone="primary"
        meta={txa('{v1} · son {v2} gün{v3}', { v1: fansubName, v2: heroDays.length || 30, v3: hasAdvancedAnalytics ? txa(' · gelişmiş istatistik açık') : '' })}
        testId="studio-stats-growth"
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <span className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span><b className="text-[24px] font-black tabular-nums">{formatNumber(heroTotal)}</b> <span className="text-[12px] text-muted-foreground">{activeHero.unit} {txa('/ 30 gün')}</span></span>
            <span className="text-[12px] text-muted-foreground">{txa('son 7 gün:')} <b className="tabular-nums text-foreground">{formatNumber(heroWeek)}</b></span>
          </span>
          <span className="flex items-center gap-2">
            <div className="flex rounded-full border border-border/70 bg-background/40 p-0.5" role="tablist" aria-label={txa('Grafik verisi')}>
              {HERO_METRICS.map((metric) => (
                <button
                  key={metric.key}
                  type="button"
                  role="tab"
                  aria-selected={heroMetric === metric.key}
                  onClick={() => setHeroMetric(metric.key)}
                  className={cn('rounded-full px-2.5 py-0.5 text-[12px] font-semibold transition-colors', heroMetric === metric.key ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground')}
                >
                  {metric.label}
                </button>
              ))}
            </div>
            <Button type="button" variant="ghost" size="icon-sm" className="rounded-full" onClick={() => { void loadAnalytics() }} disabled={loading} aria-label={txa('Yenile')} title={txa('Yenile')}>
              <ArrowClockwise size={14} className={cn(loading && 'animate-spin')} />
            </Button>
          </span>
        </div>
        {heroTotal > 0 ? (
          <>
            <StudioDailyBars data={heroSeries} labels={heroDays.map((day) => formatDay(day))} height={110} barClassName={activeHero.bar} />
            <div className="mt-1.5 flex justify-between text-[11px] text-muted-foreground">
              <span>{formatDay(heroDays[0])}</span>
              <span>{formatDay(heroDays[heroDays.length - 1])}</span>
            </div>
          </>
        ) : (
          <p className="flex h-[110px] items-center justify-center rounded-xl border border-dashed border-border/70 text-[12.5px] text-muted-foreground">{txa('Son 30 günde {v1} yok.', { v1: activeHero.unit })}</p>
        )}
      </Panel>

      <div className="grid items-start gap-4 xl:grid-cols-12">
        <Panel title={txa('Seri performansı')} icon={BookOpen} tone="violet" meta={txa('Görüntülenmeye göre')} className="xl:col-span-7">
          {topMangas.length === 0 ? (
            <p className="text-[12.5px] text-muted-foreground">{txa('Seri ekledikçe burada okunma sıralaması oluşur.')}</p>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {topMangas.map((manga, index) => (
                <li key={manga.id} className="flex items-center gap-3">
                  <span className="w-5 flex-none text-right text-[12px] font-black tabular-nums text-muted-foreground">{index + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="mb-1 flex items-baseline justify-between gap-2 text-[12.5px]">
                      <span className="truncate font-semibold">{manga.title}</span>
                      <span className="flex-none tabular-nums text-muted-foreground">{txa('{v1} · {v2} takipçi', { v1: formatCompact(manga.totalViews), v2: formatNumber(manga.followerCount) })}</span>
                    </span>
                    <span className="block h-1.5 overflow-hidden rounded-full bg-foreground/[0.06]">
                      <span className="block h-full rounded-full bg-violet-400" style={{ width: `${Math.max(3, (manga.totalViews / maxViews) * 100)}%` }} />
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title={txa('Durum dağılımı')} icon={Stack} tone="emerald" className="xl:col-span-5">
          <div className="flex flex-col gap-4">
            <StatusBar label={txa('Seriler')} segments={[
              { label: txa('Onaylı'), value: statuses.mangas.approved, bar: 'bg-emerald-400' },
              { label: txa('Onayda'), value: statuses.mangas.pending, bar: 'bg-amber-400' },
            ]} />
            <StatusBar label={txa('Bölümler')} segments={[
              { label: txa('Yayında'), value: Math.max(0, statuses.chapters.approved - statuses.chapters.scheduled), bar: 'bg-emerald-400' },
              { label: txa('Planlı'), value: statuses.chapters.scheduled, bar: 'bg-sky-400' },
              { label: txa('Onayda'), value: statuses.chapters.pending, bar: 'bg-amber-400' },
            ]} />
          </div>
        </Panel>
      </div>

      <Panel title={txa('Son yönetim hareketleri')} icon={ShieldCheck} tone="neutral" meta={txa('Profil, ekip ve bölüm tarafındaki kritik hareketler burada izlenir.')}>
        {recentActivity.length === 0 ? (
          <p className="text-[12.5px] text-muted-foreground">{txa('Henüz kayıtlı hareket yok.')}</p>
        ) : (
          <ul className="divide-y divide-border/50">
            {recentActivity.map((item) => (
              <ActivityRow key={item.id} item={item} />
            ))}
          </ul>
        )}
      </Panel>
    </div>
  )
}
