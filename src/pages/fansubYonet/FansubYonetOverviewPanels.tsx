/**
 * FansubYonetOverviewPanels: studio v2 overview panels.
 *
 * Same design language as profile tabs (ProfileTabKit: Panel, Meter, ToneIcon).
 * Dense layout: rows and strips instead of large empty boxes. Panels stay meaningful with little
 * data (a short hint instead of an empty chart, "next steps" suggestions).
 */
import { useState, type ReactNode } from 'react'
import { Link } from '@/i18n/router'
import type { LucideIcon } from 'lucide-react'
import {
  BellRinging,
  BookOpen,
  CalendarBlank,
  CaretRight,
  ChartBar,
  ChatsCircle,
  Check,
  CheckCircle,
  Clock,
  Coins,
  Eye,
  FilePlus,
  Flag,
  Hash,
  Lightning,
  LockSimple,
  Megaphone,
  RocketLaunch,
  Stack,
  UserPlus,
  Users,
  UsersThree,
  WarningCircle,
  X,
  type Icon,
} from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { buildCoverPlaceholder } from '@/lib/coverPlaceholder'
import { cn } from '@/lib/utils'
import { getTeamTagLabel } from '@/components/fansub/FansubMembershipPanel.shared'
import { StudioDailyBars } from '@/components/fansub/StudioCharts'
import { Meter, Panel, ToneIcon, type PanelTone } from '@/pages/profile/ProfileTabKit'
import type {
  FansubCommunityV2Summary,
  FansubManageActivityTimeseries,
  FansubManageAnalyticsActivityItem,
  FansubManageAnalyticsMomentum,
  FansubManageAnalyticsOverview,
  FansubManageOverviewCockpit,
} from '@/services/fansubManageService'
import type { FansubBoostSnapshot } from '@/services/fansubBoostService'
import type { FansubJoinRequest } from '@/services/fansubMembershipService'
import { resolveFansubBoostMilestoneState } from '@/lib/fansubBoostPresentation'
import type { FansubYonetTab } from './useFansubYonetState'
import { StudioStatStrip, type StudioStat } from './StudioStatStrip'
import { intlLocale, txa } from '@/i18n/activeLocale'

// ─── Ortak yardimcilar ──────────────────────────────────────────────────────
export function formatNumber(value: number | null | undefined) {
  return Math.max(0, value || 0).toLocaleString(intlLocale())
}

export function formatCompact(value: number | null | undefined) {
  const safe = Math.max(0, value || 0)
  const short = (value: number, digits: number) => value.toLocaleString(intlLocale(), { maximumFractionDigits: digits })
  if (safe >= 1_000_000) return `${short(safe / 1_000_000, safe >= 10_000_000 ? 0 : 1)} mn`
  if (safe >= 10_000) return `${short(safe / 1000, safe >= 100_000 ? 0 : 1)} bin`
  return safe.toLocaleString(intlLocale())
}

export function formatRelative(value: string | null | undefined) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  const diffMs = Date.now() - date.getTime()
  const future = diffMs < 0
  const absMin = Math.round(Math.abs(diffMs) / 60000)
  if (absMin < 1) return future ? 'birazdan' : txa('az önce')
  if (absMin < 60) return future ? txa('{v1} dk sonra', { v1: absMin }) : txa('{v1} dk önce', { v1: absMin })
  const absHour = Math.round(absMin / 60)
  if (absHour < 24) return future ? txa('{v1} sa sonra', { v1: absHour }) : txa('{v1} sa önce', { v1: absHour })
  const absDay = Math.round(absHour / 24)
  if (absDay < 30) return future ? txa('{v1} gün sonra', { v1: absDay }) : txa('{v1} gün önce', { v1: absDay })
  return date.toLocaleDateString(intlLocale())
}

/** Eski sekmelerin (post arsivi) kullandigi sade kart kabugu. */
export function SectionCard({
  title,
  icon: IconCmp,
  action,
  children,
  className,
}: {
  title: string
  icon: LucideIcon
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('flex flex-col rounded-[20px] border border-border/70 bg-card/60 p-5', className)}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <IconCmp className="h-4 w-4 text-primary" />
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  )
}

type NavigateTab = (tab: FansubYonetTab) => void

// ─── 1. Ana metrik seridi ───────────────────────────────────────────────────
function Delta({ value, label }: { value: number, label: string }) {
  return value > 0
    ? <span className="font-semibold text-emerald-500">+{formatNumber(value)} {label}</span>
    : <span>{label === 'bu hafta' ? txa('Bu hafta değişim yok') : '—'}</span>
}

export function KpiRow({
  overview,
  momentum,
  boostEnabled,
  boostSnapshot,
  community,
}: {
  overview?: FansubManageAnalyticsOverview
  momentum?: FansubManageAnalyticsMomentum
  boostEnabled: boolean
  boostSnapshot: FansubBoostSnapshot | null
  community: FansubCommunityV2Summary | null
}) {
  const server = community?.server
  const items: StudioStat[] = [
    { key: 'followers', icon: Users, tone: 'primary', label: txa('Takipçi'), value: formatCompact(overview?.followerCount), sub: <Delta value={momentum?.newFollowers7d || 0} label={txa('bu hafta')} /> },
    { key: 'views', icon: Eye, tone: 'sky', label: txa('Görüntülenme'), value: formatCompact(overview?.totalViews), sub: txa('{v1} seride toplam', { v1: formatNumber(overview?.totalMangaCount) }) },
    { key: 'chapters', icon: Stack, tone: 'violet', label: txa('Bölüm'), value: formatNumber(overview?.totalChapterCount), sub: (momentum?.newChapters30d || 0) > 0 ? txa('30 günde +{v1}', { v1: formatNumber(momentum?.newChapters30d) }) : txa('30 günde yeni yok') },
    boostEnabled
      ? { key: 'boost', icon: RocketLaunch, tone: 'amber', label: txa('Destekçi'), value: formatNumber(boostSnapshot?.activeSupporterCount), sub: txa('{v1} takviye gücü', { v1: formatNumber(boostSnapshot?.activePower) }) }
      : { key: 'donation', icon: Coins, tone: 'amber', label: txa('Bağış'), value: formatCompact(overview?.totalDonationAmount), sub: txa('{v1} bağış', { v1: formatNumber(overview?.totalDonationCount) }) },
    { key: 'server', icon: ChatsCircle, tone: 'emerald', label: txa('Sunucu üyesi'), value: server ? formatNumber(community?.stats.members) : '—', sub: server ? <Delta value={community?.stats.newMembers7d || 0} label={txa('bu hafta')} /> : txa('Sunucu henüz açılmadı') },
  ]
  return <StudioStatStrip items={items} testId="studio-kpis" />
}

// ─── 2. Yapilacaklar (bekleyen isler + sonraki adimlar) ─────────────────────
type TaskItem = { id: string, icon: Icon, tone: PanelTone, count: number, title: string, tab: FansubYonetTab }
type NextStep = { id: string, icon: Icon, tone: PanelTone, title: string, hint: string, onClick: () => void }

export function AttentionPanel({
  pendingChapters,
  problemChapters,
  pendingJoinRequests,
  serverJoinRequests,
  serverReports,
  joinRequests,
  reviewingId,
  nextSteps = [],
  onReview,
  onNavigateTab,
}: {
  pendingChapters: number
  problemChapters: number
  pendingJoinRequests: number
  serverJoinRequests: number
  serverReports: number
  joinRequests: FansubJoinRequest[]
  reviewingId: string | null
  /** Growth suggestions when there is no pending work (or little data). */
  nextSteps?: NextStep[]
  onReview: (requestId: string, action: 'approve' | 'reject') => void
  onNavigateTab: NavigateTab
}) {
  const allTasks: TaskItem[] = [
    { id: 'chapters', icon: Stack, tone: 'amber', count: pendingChapters, title: txa('Onay bekleyen bölüm'), tab: 'bolumler' },
    { id: 'problem', icon: WarningCircle, tone: 'rose', count: problemChapters, title: txa('Sorunlu bölüm'), tab: 'bolumler' },
    { id: 'team', icon: UserPlus, tone: 'sky', count: pendingJoinRequests, title: txa('Ekip başvurusu'), tab: 'uyelik' },
    { id: 'server', icon: ChatsCircle, tone: 'violet', count: serverJoinRequests, title: txa('Sunucu başvurusu'), tab: 'topluluk' },
    { id: 'reports', icon: Flag, tone: 'rose', count: serverReports, title: txa('Açık şikâyet'), tab: 'topluluk' },
  ]
  const tasks = allTasks.filter((task) => task.count > 0)
  const total = tasks.reduce((sum, task) => sum + task.count, 0)
  const steps = nextSteps.slice(0, tasks.length ? 2 : 3)

  return (
    <Panel title={txa('Yapılacaklar')} icon={BellRinging} tone="amber" meta={total ? txa('{v1} iş bekliyor', { v1: total }) : txa('Bekleyen iş yok')} testId="studio-attention">
      {tasks.length === 0 ? (
        <p className="flex items-center gap-2 rounded-xl bg-emerald-500/[0.08] px-3 py-2 text-[12.5px] font-semibold text-emerald-600 dark:text-emerald-300">
          <CheckCircle size={15} weight="fill" />{txa('Her şey yolunda')}
        </p>
      ) : (
        <ul className="-mx-2 flex flex-col">
          {tasks.map((task) => (
            <li key={task.id}>
              <button type="button" onClick={() => onNavigateTab(task.tab)} className="group flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-accent/50">
                <ToneIcon icon={task.icon} tone={task.tone} size="sm" />
                <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{task.title}</span>
                <span className="rounded-full bg-foreground/[0.07] px-2 text-[12px] font-black tabular-nums">{task.count}</span>
                <CaretRight size={12} className="text-muted-foreground group-hover:text-foreground" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {joinRequests.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1 border-t border-border/60 pt-2">
          {joinRequests.slice(0, 3).map((request) => {
            const name = request.requester?.username || txa('Kullanıcı')
            const busy = reviewingId === request.id
            return (
              <li key={request.id} className="flex items-center gap-2.5 py-1">
                <span className="size-7 flex-none overflow-hidden rounded-full bg-muted">
                  {request.requester?.avatarUrl ? <img src={request.requester.avatarUrl} alt="" className="size-full object-cover" /> : <span className="flex size-full items-center justify-center text-[11px] font-bold text-muted-foreground">{name.slice(0, 1).toUpperCase()}</span>}
                </span>
                <span className="min-w-0 flex-1" title={request.message || undefined}>
                  <span className="block truncate text-[12.5px] font-semibold">{name}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">{request.message || txa('Mesaj bırakmadı')}</span>
                </span>
                <Button type="button" size="icon-sm" variant="ghost" disabled={busy} aria-label={txa('{v1} başvurusunu reddet', { v1: name })} onClick={() => onReview(request.id, 'reject')}>
                  <X size={14} weight="bold" />
                </Button>
                <Button type="button" size="icon-sm" disabled={busy} aria-label={txa('{v1} başvurusunu onayla', { v1: name })} onClick={() => onReview(request.id, 'approve')}>
                  <Check size={14} weight="bold" />
                </Button>
              </li>
            )
          })}
        </ul>
      )}

      {steps.length > 0 && (
        <div className="mt-3 border-t border-border/60 pt-2.5">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{txa('Sonraki adımlar')}</p>
          <ul className="-mx-2 flex flex-col">
            {steps.map((step) => (
              <li key={step.id}>
                <button type="button" onClick={step.onClick} className="group flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-accent/50">
                  <ToneIcon icon={step.icon} tone={step.tone} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-semibold">{step.title}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">{step.hint}</span>
                  </span>
                  <CaretRight size={12} className="text-muted-foreground group-hover:text-foreground" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  )
}

export type { NextStep as FansubStudioNextStep }

// ─── 3. Buyume grafigi ──────────────────────────────────────────────────────
type SeriesKey = 'followers' | 'chapters' | 'donations' | 'messages'

export function GrowthPanel({ timeseries, community }: { timeseries: FansubManageActivityTimeseries | null, community: FansubCommunityV2Summary | null }) {
  const options: Array<{ key: SeriesKey, label: string, unit: string, data: number[], days: string[], bar: string }> = [
    { key: 'followers', label: txa('Takipçi'), unit: txa('yeni takipçi'), data: timeseries?.followers || [], days: timeseries?.days || [], bar: 'bg-primary' },
    { key: 'chapters', label: txa('Bölüm'), unit: txa('yeni bölüm'), data: timeseries?.chapters || [], days: timeseries?.days || [], bar: 'bg-violet-400' },
    { key: 'donations', label: txa('Bağış'), unit: txa('coin bağış'), data: timeseries?.donationAmount || [], days: timeseries?.days || [], bar: 'bg-amber-400' },
  ]
  if (community?.server) {
    options.push({ key: 'messages', label: txa('Sunucu'), unit: 'mesaj', data: community.daily.map((d) => d.messages), days: community.daily.map((d) => d.day), bar: 'bg-emerald-400' })
  }
  const [selected, setSelected] = useState<SeriesKey>('followers')
  const active = options.find((option) => option.key === selected) || options[0]
  const total = active.data.reduce((sum, value) => sum + value, 0)
  const activeDays = active.data.filter((value) => value > 0).length
  const format = (day?: string) => (day ? new Date(`${day}T00:00:00`).toLocaleDateString(intlLocale(), { day: 'numeric', month: 'short' }) : '')

  return (
    <Panel title={txa('Büyüme')} icon={ChartBar} tone="primary" meta={txa('Son {v1} gün', { v1: active.days.length || 30 })} testId="studio-growth">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <span className="flex items-baseline gap-2">
          <span className="text-[24px] font-black leading-none tabular-nums">{formatNumber(total)}</span>
          <span className="text-[12px] text-muted-foreground">{active.unit}{total > 0 ? txa(' · {v1} aktif gün', { v1: activeDays }) : ''}</span>
        </span>
        <div className="flex rounded-full border border-border/70 bg-background/40 p-0.5" role="tablist" aria-label={txa('Grafik verisi')}>
          {options.map((option) => (
            <button
              key={option.key}
              type="button"
              role="tab"
              aria-selected={option.key === active.key}
              onClick={() => setSelected(option.key)}
              className={cn('rounded-full px-2.5 py-0.5 text-[12px] font-semibold transition-colors', option.key === active.key ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground')}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      {total === 0 ? (
        <p className="flex h-[96px] items-center justify-center rounded-xl border border-dashed border-border/70 text-[12.5px] text-muted-foreground">
          {txa('Bu dönemde {v1} yok.', { v1: active.unit })}
        </p>
      ) : (
        <>
          <StudioDailyBars data={active.data} labels={active.days.map((day) => format(day))} height={96} barClassName={active.bar} />
          <div className="mt-1.5 flex justify-between text-[11px] text-muted-foreground">
            <span>{format(active.days[0])}</span>
            <span>{format(active.days[active.days.length - 1])}</span>
          </div>
        </>
      )}
    </Panel>
  )
}

// ─── 4. Takviye ─────────────────────────────────────────────────────────────
export function BoostPanel({ snapshot, fansubName, canOpenTab, onNavigateTab }: { snapshot: FansubBoostSnapshot | null, fansubName: string, canOpenTab: boolean, onNavigateTab: NavigateTab }) {
  const milestone = resolveFansubBoostMilestoneState(snapshot, fansubName)
  const tierLabel = snapshot?.capabilities?.tierLabel || (snapshot?.tierLevel ? `Seviye ${snapshot.tierLevel}` : txa('Başlangıç'))
  return (
    <Panel
      title={txa('Takviye')}
      icon={RocketLaunch}
      tone="amber"
      meta={tierLabel}
      action={canOpenTab ? { label: txa('Ayrıntı'), onClick: () => onNavigateTab('takviye') } : undefined}
      testId="studio-boost"
    >
      <div className="flex items-baseline gap-3 text-[12px] text-muted-foreground">
        <span><b className="text-[20px] font-black tabular-nums text-foreground">{formatNumber(snapshot?.activePower)}</b> {txa('güç')}</span>
        <span><b className="tabular-nums text-foreground">{formatNumber(snapshot?.activeSupporterCount)}</b> {txa('destekçi')}</span>
        <span><b className="tabular-nums text-foreground">{formatNumber(snapshot?.activeGrantCount)}</b>{' '}{txa('aktif')}</span>
      </div>
      <Meter percent={milestone.isMaxTier ? 100 : snapshot?.tierProgressPercent || 0} className="mt-2.5" barClassName="from-amber-400 to-amber-300" />
      <p className="mt-1.5 text-[11.5px] text-muted-foreground">
        {milestone.isMaxTier
          ? txa('Tüm seviyeler açık.')
          : <><b className="text-foreground">{txa('{v1} güç', { v1: formatNumber(milestone.remainingPower) })}</b> {txa('sonra Seviye {v1}', { v1: milestone.nextTierLevel ?? (snapshot?.tierLevel || 0) + 1 })}</>}
      </p>
    </Panel>
  )
}

// ─── 5. Kisayollar ──────────────────────────────────────────────────────────
export function QuickActionsPanel({
  canCreateContent,
  canWriteNotice,
  publicHref,
  serverId,
  onCreateManga,
  onCreateChapter,
  onNavigateTab,
}: {
  canCreateContent: boolean
  canWriteNotice: boolean
  publicHref: string
  serverId: string | null
  onCreateManga: () => void
  onCreateChapter: () => void
  onNavigateTab: NavigateTab
}) {
  const pill = 'inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background/40 px-3 py-1.5 text-[12px] font-semibold transition-colors hover:bg-accent/60'
  return (
    <nav className="flex flex-wrap gap-1.5" aria-label={txa('Kısayollar')} data-testid="studio-shortcuts">
      {canCreateContent && (
        <>
          <button type="button" className={pill} onClick={onCreateChapter}><FilePlus size={14} weight="bold" className="text-primary" />{txa('Bölüm ekle')}</button>
          <button type="button" className={pill} onClick={onCreateManga}><BookOpen size={14} weight="bold" className="text-violet-400" />{txa('Seri ekle')}</button>
        </>
      )}
      {canWriteNotice && (
        <button type="button" className={pill} onClick={() => onNavigateTab('duyurular')}><Megaphone size={14} weight="bold" className="text-amber-400" />{txa('Duyuru yaz')}</button>
      )}
      {serverId && (
        <Link className={pill} to={`/topluluk?sunucu=${encodeURIComponent(serverId)}`}><ChatsCircle size={14} weight="bold" className="text-emerald-400" />{txa('Sunucuya git')}</Link>
      )}
      <Link className={pill} to={publicHref}><Eye size={14} weight="bold" className="text-sky-400" />{txa('Profili gör')}</Link>
    </nav>
  )
}

// ─── 6. Yayin hatti + yaklasan ──────────────────────────────────────────────
const PIPELINE: Array<{ key: keyof FansubManageOverviewCockpit['pipeline'], label: string, bar: string }> = [
  { key: 'published', get label() { return txa('Yayında') }, bar: 'bg-emerald-400' },
  { key: 'scheduled', get label() { return txa('Planlı') }, bar: 'bg-sky-400' },
  { key: 'pending', get label() { return txa('Onayda') }, bar: 'bg-amber-400' },
  { key: 'draft', get label() { return txa('Taslak') }, bar: 'bg-muted-foreground/50' },
  { key: 'problem', get label() { return txa('Sorunlu') }, bar: 'bg-rose-400' },
]

export function PipelinePanel({ cockpit, onNavigateTab }: { cockpit: FansubManageOverviewCockpit, onNavigateTab: NavigateTab }) {
  const pipeline = cockpit.pipeline
  const total = PIPELINE.reduce((sum, step) => sum + pipeline[step.key], 0)
  const steps = PIPELINE.filter((step) => step.key === 'published' || pipeline[step.key] > 0)
  return (
    <Panel title={txa('Yayın hattı')} icon={Stack} tone="violet" meta={txa('{v1} bölüm', { v1: formatNumber(total) })} action={{ label: txa('Bölümler'), onClick: () => onNavigateTab('bolumler') }} className="h-full" testId="studio-pipeline">
      <div className="flex h-2 overflow-hidden rounded-full bg-foreground/[0.06]">
        {total > 0 && PIPELINE.map((step) => pipeline[step.key] > 0 && (
          <span key={step.key} className={step.bar} style={{ width: `${(pipeline[step.key] / total) * 100}%` }} />
        ))}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px]">
        {steps.map((step) => (
          <li key={step.key} className="flex items-center gap-1.5">
            <span className={cn('size-2 flex-none rounded-full', step.bar)} />
            <span className="text-muted-foreground">{step.label}</span>
            <b className="tabular-nums">{formatNumber(pipeline[step.key])}</b>
          </li>
        ))}
      </ul>

      <p className="mb-1 mt-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"><CalendarBlank size={12} weight="bold" />{txa('Sıradaki yayınlar')}</p>
      {cockpit.upcoming.length ? (
        <ul className="flex flex-col gap-1.5">
          {cockpit.upcoming.slice(0, 3).map((item) => (
            <li key={item.id} className="flex items-center gap-2.5">
              <img src={item.coverImageUrl || buildCoverPlaceholder(item.mangaTitle)} alt="" className="h-9 w-6 flex-none rounded object-cover" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] font-semibold">{item.mangaTitle}</span>
                <span className="block truncate text-[11px] text-muted-foreground">{txa('Bölüm {v1}', { v1: item.chapterNumber })}{item.title ? ` · ${item.title}` : ''}</span>
              </span>
              <span className="flex flex-none items-center gap-1 text-[11px] font-semibold text-sky-500"><Clock size={11} weight="bold" />{formatRelative(item.publishAt)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[12px] text-muted-foreground">{txa('Planlı bölüm yok. Bölüm eklerken yayın tarihi seçebilirsin.')}</p>
      )}
    </Panel>
  )
}

// ─── 7. Community server ───────────────────────────────────────────────────
export function ServerPanel({ community, canOpenTab, onNavigateTab, className }: { community: FansubCommunityV2Summary | null, canOpenTab: boolean, onNavigateTab: NavigateTab, className?: string }) {
  const server = community?.server
  const action = canOpenTab ? { label: server ? txa('Yönet') : txa('Kur'), onClick: () => onNavigateTab('topluluk') } : undefined
  if (!server) {
    return (
      <Panel title={txa('Sunucu')} icon={ChatsCircle} tone="emerald" meta={txa('Henüz açılmadı')} action={action} className={cn('h-full', className)} testId="studio-server">
        <p className="text-[12.5px] text-muted-foreground">{txa('Okurlarınla kanallarda sohbet etmek için fansub sunucunu aç; seri kanalları, roller ve moderasyon buradan yönetilir.')}</p>
      </Panel>
    )
  }
  const channels = [...community.channels].filter((channel) => !channel.archived).sort((a, b) => b.messages7d - a.messages7d).slice(0, 3)
  return (
    <Panel title={txa('Sunucu')} icon={ChatsCircle} tone="emerald" meta={server.name} action={action} className={cn('h-full', className)} testId="studio-server">
      {!community.enabled && (
        <p className="mb-2 rounded-lg bg-amber-500/[0.08] px-2.5 py-1.5 text-[11.5px] text-amber-700 dark:text-amber-300">
          {txa('Topluluk site genelinde kapalı; sunucu okurlara görünmüyor.')}
        </p>
      )}
      <div className="flex gap-4 text-[12px] text-muted-foreground">
        <span><b className="text-[16px] font-black tabular-nums text-foreground">{formatNumber(community.stats.members)}</b> {txa('üye')}</span>
        <span><b className="text-[16px] font-black tabular-nums text-foreground">{formatNumber(community.stats.messages7d)}</b> {txa('mesaj/7g')}</span>
        <span><b className="text-[16px] font-black tabular-nums text-foreground">{formatNumber(community.stats.chatters7d)}</b> {txa('konuşan')}</span>
      </div>
      {channels.length > 0 && (
        <ul className="mt-2 flex flex-col">
          {channels.map((channel) => (
            <li key={channel.id} className="flex items-center gap-2 py-1 text-[12.5px]">
              {channel.isPrivate ? <LockSimple size={13} className="text-muted-foreground" /> : <Hash size={13} className="text-muted-foreground" />}
              <span className="min-w-0 flex-1 truncate font-semibold">{channel.name}</span>
              <span className="text-[11px] tabular-nums text-muted-foreground">{channel.messages7d ? txa('{v1} mesaj', { v1: formatNumber(channel.messages7d) }) : formatRelative(channel.lastMessageAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

// ─── 8. Ekip + son hareketler ───────────────────────────────────────────────
function activityTone(action: string): { icon: Icon, tone: PanelTone } {
  if (action.includes('chapter')) return { icon: Stack, tone: 'violet' }
  if (action.includes('manga')) return { icon: BookOpen, tone: 'primary' }
  if (action.includes('member')) return { icon: UsersThree, tone: 'sky' }
  if (action.includes('notice')) return { icon: Megaphone, tone: 'amber' }
  return { icon: Lightning, tone: 'neutral' }
}

export function TeamActivityPanel({ cockpit, activity, onNavigateTab }: { cockpit: FansubManageOverviewCockpit, activity: FansubManageAnalyticsActivityItem[], onNavigateTab: NavigateTab }) {
  const team = cockpit.team
  return (
    <Panel title={txa('Ekip')} icon={UsersThree} tone="sky" meta={txa('{v1} kişi', { v1: formatNumber(team.total) })} action={{ label: txa('Üyeler'), onClick: () => onNavigateTab('uyelik') }} className="h-full" testId="studio-team">
      <div className="flex flex-wrap gap-1">
        {[[txa('Admin'), team.admins], [txa('Moderatör'), team.moderators], [txa('Üye'), team.members]].filter(([, value]) => Number(value) > 0).map(([label, value]) => (
          <span key={label} className="rounded-full border border-border/70 bg-background/40 px-2 py-0.5 text-[11.5px]">
            <b className="tabular-nums">{value}</b> <span className="text-muted-foreground">{label}</span>
          </span>
        ))}
        {team.tags.slice(0, 3).map((tag) => (
          <span key={tag.tag} className="rounded-full bg-sky-400/10 px-2 py-0.5 text-[11.5px] text-sky-600 dark:text-sky-300">
            {getTeamTagLabel(tag.tag)} · {tag.count}
          </span>
        ))}
      </div>
      <p className="mb-1 mt-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{txa('Son hareketler')}</p>
      {activity.length ? (
        <ul className="flex flex-col gap-1.5">
          {activity.slice(0, 4).map((item) => {
            const tone = activityTone(item.action)
            return (
              <li key={item.id} className="flex items-start gap-2">
                <ToneIcon icon={tone.icon} tone={tone.tone} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] leading-snug" title={item.summary}>{item.summary}</span>
                  <span className="block text-[11px] text-muted-foreground">{item.actor.username || txa('Sistem')} · {formatRelative(item.createdAt)}</span>
                </span>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="text-[12px] text-muted-foreground">{txa('Henüz kayıtlı ekip hareketi yok.')}</p>
      )}
    </Panel>
  )
}
