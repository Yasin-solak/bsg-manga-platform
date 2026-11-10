import { useMemo, useState } from 'react'
import { Link } from '@/i18n/router'
import {
  ChevronDown,
  ChevronUp,
  Crown,
  HandCoins,
  Heart,
  MessageCircle,
  Quote,
  Sparkles,
  Star,
  Users,
  Zap,
} from 'lucide-react'
import { AvatarFrame } from '@components/common/AvatarFrame'
import FansubIdentityTagChip from '@/components/common/FansubIdentityTagChip'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { canRenderFansubSupporterSummary } from '@/lib/fansubBoostCapabilityGovernance'
import { resolveFansubBoostSupporterIdentityBadgeLabel } from '@/lib/fansubBoostPresentation'
import type { FansubIdentityTagPresentation } from '@/lib/fansubIdentityTags'
import type {
  FansubBoostRewardCapabilities,
  FansubBoostSnapshot,
  FansubBoostSupporterPreview,
  FansubBoostSupporterState,
} from '@/services/fansubBoostService'
import type { FansubDonationActivityItem } from '@/services/fansubService'
import { cn } from '@/lib/utils'
import { intlLocale, txa } from '@/i18n/activeLocale'

type FansubSupporterWallProps = {
  snapshot: FansubBoostSnapshot | null
  supporterState: FansubBoostSupporterState | null
  supporterPreview: FansubBoostSupporterPreview[]
  recentDonationPreview: FansubDonationActivityItem[]
  className?: string
}

type SupportActivityEntry = {
  userId: string
  username: string
  usernameSlug?: string
  avatarUrl: string | null
  activeFansubIdentityTag: FansubIdentityTagPresentation | null
  source: 'boost' | 'donation' | 'hybrid'
  highestActivePlanCode: string | null
  supporterRewardTier: number
  rewardCapabilities: FansubBoostRewardCapabilities | null
  latestMessage: string | null
  rewardHighlights: string[]
  donationAmount30d: number
  donationCount30d: number
  lastDonationAt: string | null
}

type DonationAggregate = {
  userId: string
  username: string
  usernameSlug?: string
  avatarUrl: string | null
  donationAmount30d: number
  donationCount30d: number
  lastDonationAt: string | null
  latestDonationNote: string | null
}

const PLAN_STYLES: Record<string, {
  gradient: string
  border: string
  text: string
  bg: string
  icon: typeof Zap
  label: string
}> = {
  monthly: {
    gradient: 'from-blue-500 to-cyan-500',
    border: 'border-blue-400/40',
    text: 'text-blue-400',
    bg: 'bg-blue-500/10',
    icon: Zap,
    get label() { return txa('Destekçi') },
  },
  mega: {
    gradient: 'from-violet-500 to-purple-500',
    border: 'border-violet-400/40',
    text: 'text-violet-400',
    bg: 'bg-violet-500/10',
    icon: Star,
    get label() { return txa('Mega') },
  },
  top: {
    gradient: 'from-amber-400 via-orange-500 to-rose-500',
    border: 'border-amber-400/50',
    text: 'text-amber-400',
    bg: 'bg-amber-500/10',
    icon: Crown,
    get label() { return txa('Efsane') },
  },
}

const DONATION_STYLE = {
  gradient: 'from-emerald-500 to-cyan-500',
  border: 'border-emerald-400/35',
  text: 'text-emerald-400',
  bg: 'bg-emerald-500/10',
  icon: HandCoins,
  get label() { return txa('Bağış') },
} as const

function getPlanStyle(code: string | null | undefined) {
  if (!code) return PLAN_STYLES.monthly
  return PLAN_STYLES[code] ?? PLAN_STYLES.monthly
}

function getActivityStyle(entry: SupportActivityEntry) {
  if (!entry.highestActivePlanCode) return DONATION_STYLE
  return getPlanStyle(entry.highestActivePlanCode)
}

function profileHref(usernameSlug?: string) {
  return usernameSlug ? `/profil/${encodeURIComponent(usernameSlug)}` : null
}

function buildRecentDonationAggregates(donations: FansubDonationActivityItem[]): DonationAggregate[] {
  const aggregates = new Map<string, DonationAggregate>()

  donations.forEach((donation) => {
    if (!donation.donor?.id || !donation.donor.username) return

    const existing = aggregates.get(donation.donor.id)
    const amount = Math.max(0, Number(donation.amount) || 0)
    const nextLastDonationAt = !existing?.lastDonationAt
      || new Date(donation.createdAt).getTime() > new Date(existing.lastDonationAt).getTime()
      ? donation.createdAt
      : existing.lastDonationAt
    const nextLatestDonationNote = donation.note?.trim()
      ? donation.note.trim()
      : existing?.latestDonationNote || null

    aggregates.set(donation.donor.id, {
      userId: donation.donor.id,
      username: donation.donor.username,
      usernameSlug: donation.donor.usernameSlug,
      avatarUrl: donation.donor.avatarUrl || null,
      donationAmount30d: (existing?.donationAmount30d || 0) + amount,
      donationCount30d: (existing?.donationCount30d || 0) + 1,
      lastDonationAt: nextLastDonationAt,
      latestDonationNote: nextLatestDonationNote,
    })
  })

  return Array.from(aggregates.values()).sort((a, b) => {
    if (b.donationAmount30d !== a.donationAmount30d) {
      return b.donationAmount30d - a.donationAmount30d
    }

    return new Date(b.lastDonationAt || 0).getTime() - new Date(a.lastDonationAt || 0).getTime()
  })
}

function buildSupportActivityEntries(
  supporters: FansubBoostSupporterPreview[],
  donationAggregates: DonationAggregate[],
): SupportActivityEntry[] {
  const entries = new Map<string, SupportActivityEntry>()

  supporters.forEach((supporter) => {
    entries.set(supporter.supporterUserId, {
      userId: supporter.supporterUserId,
      username: supporter.username,
      usernameSlug: supporter.usernameSlug,
      avatarUrl: supporter.avatarUrl,
      activeFansubIdentityTag: supporter.activeFansubIdentityTag ?? null,
      source: 'boost',
      highestActivePlanCode: supporter.highestActivePlanCode,
      supporterRewardTier: supporter.supporterRewardTier,
      rewardCapabilities: supporter.rewardCapabilities,
      latestMessage: supporter.latestSupporterNote?.trim() || null,
      rewardHighlights: supporter.rewardCapabilities?.rewardHighlights || [],
      donationAmount30d: 0,
      donationCount30d: 0,
      lastDonationAt: null,
    })
  })

  donationAggregates.forEach((donor) => {
    const existing = entries.get(donor.userId)
    if (existing) {
      entries.set(donor.userId, {
        ...existing,
        source: 'hybrid',
        latestMessage: existing.latestMessage || donor.latestDonationNote,
        donationAmount30d: donor.donationAmount30d,
        donationCount30d: donor.donationCount30d,
        lastDonationAt: donor.lastDonationAt,
      })
      return
    }

    entries.set(donor.userId, {
      userId: donor.userId,
      username: donor.username,
      usernameSlug: donor.usernameSlug,
      avatarUrl: donor.avatarUrl,
      activeFansubIdentityTag: null,
      source: 'donation',
      highestActivePlanCode: null,
      supporterRewardTier: 0,
      rewardCapabilities: null,
      latestMessage: donor.latestDonationNote,
      rewardHighlights: [],
      donationAmount30d: donor.donationAmount30d,
      donationCount30d: donor.donationCount30d,
      lastDonationAt: donor.lastDonationAt,
    })
  })

  const sourceOrder: Record<SupportActivityEntry['source'], number> = {
    hybrid: 3,
    boost: 2,
    donation: 1,
  }
  const planOrder: Record<string, number> = { top: 3, mega: 2, monthly: 1 }

  return Array.from(entries.values()).sort((a, b) => {
    const sourceDiff = sourceOrder[b.source] - sourceOrder[a.source]
    if (sourceDiff !== 0) return sourceDiff

    const planDiff = (planOrder[b.highestActivePlanCode || ''] || 0) - (planOrder[a.highestActivePlanCode || ''] || 0)
    if (planDiff !== 0) return planDiff

    if (b.donationAmount30d !== a.donationAmount30d) {
      return b.donationAmount30d - a.donationAmount30d
    }

    return new Date(b.lastDonationAt || 0).getTime() - new Date(a.lastDonationAt || 0).getTime()
  })
}

function UserIdentity({
  username,
  usernameSlug,
  className,
}: {
  username: string
  usernameSlug?: string
  className?: string
}) {
  const href = profileHref(usernameSlug)
  if (!href) {
    return <span className={className}>{username}</span>
  }

  return (
    <Link to={href} className={className}>
      {username}
    </Link>
  )
}

function UserAvatar({
  username,
  usernameSlug,
  avatarUrl,
  size,
  className,
}: {
  username: string
  usernameSlug?: string
  avatarUrl: string | null
  size: number
  className?: string
}) {
  const href = profileHref(usernameSlug)
  const avatarNode = (
    <div className={className}>
      <AvatarFrame
        src={avatarUrl || `https://api.dicebear.com/7.x/bottts/svg?seed=${username}`}
        alt={username}
        size={size}
        frameType="default"
      />
    </div>
  )

  if (!href) return avatarNode
  return <Link to={href}>{avatarNode}</Link>
}

function formatDonationSummary(entry: SupportActivityEntry) {
  if (entry.donationCount30d <= 0) return null
  return txa('{v1} coin / {v2} bağış', { v1: entry.donationAmount30d.toLocaleString(intlLocale()), v2: entry.donationCount30d })
}

function SupporterCard({
  entry,
  highlighted = false,
  showMessage = true,
  boostCapabilities,
}: {
  entry: SupportActivityEntry
  highlighted?: boolean
  showMessage?: boolean
  boostCapabilities?: FansubBoostSnapshot['capabilities'] | null
}) {
  const activityStyle = getActivityStyle(entry)
  const Icon = activityStyle.icon
  const isTopSupporter = entry.highestActivePlanCode === 'top'
  const donationSummary = formatDonationSummary(entry)
  const identityBadgeLabel = resolveFansubBoostSupporterIdentityBadgeLabel(
    entry.rewardCapabilities,
    activityStyle.label,
    boostCapabilities,
  )

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl border p-4 transition-all hover:shadow-lg',
        highlighted ? `${activityStyle.border} ${activityStyle.bg}` : 'border-border/60 bg-card/50 hover:border-border',
        isTopSupporter && 'ring-1 ring-amber-400/20',
      )}
    >
      {isTopSupporter ? (
        <div
          className="pointer-events-none absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-amber-400/5 to-transparent"
          style={{ backgroundSize: '200% 100%' }}
          aria-hidden
        />
      ) : null}

      <div className="relative flex items-start gap-3">
        <UserAvatar
          username={entry.username}
          usernameSlug={entry.usernameSlug}
          avatarUrl={entry.avatarUrl}
          size={48}
          className="rounded-full ring-2 ring-background"
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <UserIdentity
              username={entry.username}
              usernameSlug={entry.usernameSlug}
              className="truncate font-semibold text-foreground hover:text-primary"
            />
            <FansubIdentityTagChip tag={entry.activeFansubIdentityTag} size='xs' />

            {entry.highestActivePlanCode ? (
              <span
                className={cn(
                  'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
                  activityStyle.border,
                  activityStyle.bg,
                  activityStyle.text,
                )}
              >
                <Icon className="size-3" />
                {activityStyle.label}
              </span>
            ) : null}

            {entry.donationCount30d > 0 ? (
              <span
                className={cn(
                  'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
                  DONATION_STYLE.border,
                  DONATION_STYLE.bg,
                  DONATION_STYLE.text,
                )}
              >
                <HandCoins className="size-3" />
                {txa('Bağış')}
              </span>
            ) : null}

            {identityBadgeLabel ? (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-primary/20 bg-primary/8 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                <Sparkles className="size-3" />
                {identityBadgeLabel}
              </span>
            ) : null}
          </div>

          {showMessage && entry.latestMessage ? (
            <div className="mt-2 flex items-start gap-2">
              <Quote className="mt-0.5 size-3.5 shrink-0 rotate-180 text-muted-foreground" />
              <p className="line-clamp-2 break-words text-sm italic leading-relaxed text-muted-foreground">
                {entry.latestMessage}
              </p>
            </div>
          ) : null}

          {donationSummary || entry.rewardHighlights.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {donationSummary ? (
                <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-muted/30 px-2 py-0.5 text-[10px] text-muted-foreground">
                  <HandCoins className="size-2.5" />
                  <span className="truncate">{donationSummary}</span>
                </span>
              ) : null}

              {entry.rewardHighlights.slice(0, donationSummary ? 1 : 2).map((highlight, idx) => (
                <span
                  key={`${entry.userId}-${idx}`}
                  className="inline-flex max-w-full items-center gap-1 rounded-full bg-muted/30 px-2 py-0.5 text-[10px] text-muted-foreground"
                >
                  <Sparkles className="size-2.5" />
                  <span className="truncate">{highlight}</span>
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function SupporterAvatarStack({
  entries,
  totalCount,
  maxVisible = 5,
}: {
  entries: SupportActivityEntry[]
  totalCount: number
  maxVisible?: number
}) {
  const visibleEntries = entries.slice(0, maxVisible)
  const remainingCount = Math.max(0, totalCount - maxVisible)

  return (
    <div className="flex items-center">
      <div className="flex -space-x-3">
        {visibleEntries.map((entry, idx) => {
          const activityStyle = getActivityStyle(entry)
          return (
            <div
              key={entry.userId}
              className={cn(
                'relative rounded-full ring-2 ring-background transition-transform hover:z-10 hover:scale-110',
                idx === 0 && 'z-[5]',
                idx === 1 && 'z-[4]',
                idx === 2 && 'z-[3]',
              )}
              title={entry.username}
            >
              <UserAvatar
                username={entry.username}
                usernameSlug={entry.usernameSlug}
                avatarUrl={entry.avatarUrl}
                size={36}
              />
              <span
                className={cn(
                  'absolute -bottom-0.5 -right-0.5 size-3 rounded-full ring-2 ring-background',
                  `bg-gradient-to-br ${activityStyle.gradient}`,
                )}
              />
            </div>
          )
        })}
      </div>
      {remainingCount > 0 ? (
        <span className="ml-3 text-sm font-medium text-muted-foreground">
          +{remainingCount.toLocaleString(intlLocale())}{' '}{txa('katilimci')}
        </span>
      ) : null}
    </div>
  )
}

function FeaturedNotes({
  entries,
  maxNotes = 2,
}: {
  entries: SupportActivityEntry[]
  maxNotes?: number
}) {
  const notesWithContent = useMemo(() => {
    return entries
      .filter((entry) => entry.latestMessage && entry.latestMessage.trim().length > 0)
      .slice(0, maxNotes)
  }, [entries, maxNotes])

  if (notesWithContent.length === 0) return null

  return (
    <div className="space-y-3">
      {notesWithContent.map((entry) => {
        const activityStyle = getActivityStyle(entry)
        return (
          <div
            key={entry.userId}
            className={cn(
              'rounded-xl border p-3',
              activityStyle.border,
              activityStyle.bg,
            )}
          >
            <div className="flex items-start gap-2">
              <MessageCircle className={cn('mt-0.5 size-4 shrink-0', activityStyle.text)} />
              <div className="min-w-0 flex-1">
                <p className="break-words text-sm italic leading-relaxed text-foreground">
                  "{entry.latestMessage}"
                </p>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {'- '}
                  <UserIdentity
                    username={entry.username}
                    usernameSlug={entry.usernameSlug}
                    className="font-medium hover:text-primary"
                  />
                  <FansubIdentityTagChip tag={entry.activeFansubIdentityTag} size='xs' className='ml-1 align-middle' />
                </p>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function SupporterMetricCard({
  icon: Icon,
  label,
  value,
  accentClassName,
}: {
  icon: typeof Users
  label: string
  value: string
  accentClassName: string
}) {
  return (
    <div className="rounded-2xl border border-amber-400/15 bg-background/70 px-4 py-3 backdrop-blur-sm">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
        <Icon className={cn('size-3.5', accentClassName)} />
        {label}
      </div>
      <div className="mt-2 text-xl font-semibold text-foreground">{value}</div>
    </div>
  )
}

export default function FansubSupporterWall({
  snapshot,
  supporterState,
  supporterPreview,
  recentDonationPreview,
  className,
}: FansubSupporterWallProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const canShowSupporterSummary = canRenderFansubSupporterSummary(
    snapshot?.capabilities,
    snapshot ? 'resolved' : 'unknown',
  )

  const totalSupporters = snapshot?.activeSupporterCount ?? 0
  const donationAggregates = useMemo(
    () => buildRecentDonationAggregates(recentDonationPreview),
    [recentDonationPreview],
  )
  const combinedEntries = useMemo(
    () => buildSupportActivityEntries(supporterPreview, donationAggregates),
    [donationAggregates, supporterPreview],
  )
  const recentDonorCount = donationAggregates.length
  const totalParticipants = combinedEntries.length
  const hasAnyEntries = totalSupporters > 0 || combinedEntries.length > 0

  const collapsedCount = 4
  const visibleEntries = isExpanded ? combinedEntries : combinedEntries.slice(0, collapsedCount)
  const canExpand = combinedEntries.length > collapsedCount
  const isCurrentUserSupporter = Boolean(supporterState && supporterState.activeGrantCount > 0)
  const hasMessages = combinedEntries.some((entry) => entry.latestMessage)

  if (!canShowSupporterSummary) return null

  if (!hasAnyEntries) {
    return (
      <Card className={cn('rounded-[28px] border-border/60 bg-background p-6', className)}>
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="mb-4 flex size-16 items-center justify-center rounded-2xl bg-muted/30">
            <Heart className="size-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold text-foreground">{txa('Henüz görünen katkı yok')}</h3>
          <p className="mt-2 max-w-[300px] text-sm text-muted-foreground">
            {txa('İlk takviye veya bağış ile bu alanda fansubun destek zinciri görünmeye başlar.')}
          </p>
        </div>
      </Card>
    )
  }

  return (
    <Card
      className={cn(
        'overflow-hidden rounded-[28px] border-border/60 bg-background',
      className,
    )}
      data-testid="fansub-supporter-wall"
      data-supporter-summary-visible={canShowSupporterSummary ? 'true' : 'false'}
    >
      <div className='border-b border-border/50 px-6 py-4'>
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className='flex size-10 items-center justify-center rounded-xl bg-primary/10'>
              <HandCoins className="size-5 text-primary" />
            </div>
            <div className="min-w-0">
              <h2 className="font-semibold text-foreground">{txa('Bağış ve takviyede bulunanlar')}</h2>
              <p className="text-sm text-muted-foreground">
                {txa('Aktif destekçiler ve son 30 günde bağış yapanlar burada birlikte görünür.')}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <div className="hidden rounded-full border border-border/60 bg-card/60 px-2.5 py-1 text-[11px] text-muted-foreground sm:inline-flex">
              {totalParticipants.toLocaleString(intlLocale())}{' '}{txa('gorunen isim')}
            </div>

            {isCurrentUserSupporter && supporterState ? (
              <Badge
                variant="outline"
                className={cn(
                  'rounded-full px-3 py-1 text-xs font-semibold',
                  getPlanStyle(supporterState.highestActivePlanCode).border,
                  getPlanStyle(supporterState.highestActivePlanCode).bg,
                  getPlanStyle(supporterState.highestActivePlanCode).text,
                )}
              >
                <Heart className="mr-1.5 size-3 fill-current" />
                {txa('Sen de destekçisin')}
              </Badge>
            ) : null}
          </div>
        </div>

        <div className="mt-4">
          <SupporterAvatarStack entries={combinedEntries} totalCount={totalParticipants} />
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <SupporterMetricCard
            icon={Users}
            label={txa('Aktif destekçi')}
            value={totalSupporters.toLocaleString(intlLocale())}
            accentClassName="text-primary"
          />
          <SupporterMetricCard
            icon={HandCoins}
            label={txa('30 günde bağış')}
            value={recentDonorCount.toLocaleString(intlLocale())}
            accentClassName="text-emerald-500"
          />
          <SupporterMetricCard
            icon={Sparkles}
            label={txa('Toplam takviye')}
            value={(snapshot?.activeGrantCount ?? 0).toLocaleString(intlLocale())}
            accentClassName="text-violet-500"
          />
        </div>
      </div>

      {hasMessages ? (
        <div className="border-b border-border/50 px-6 py-4">
          <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
            <MessageCircle className="size-3.5" />
            {txa('Katkı mesajları')}
          </div>
          <FeaturedNotes entries={combinedEntries} maxNotes={2} />
        </div>
      ) : null}

      <div className="p-6">
        <div className='grid gap-3 sm:grid-cols-2'>
          {visibleEntries.map((entry, idx) => (
            <SupporterCard
              key={entry.userId}
              entry={entry}
              highlighted={idx < 2}
              showMessage={idx === 0}
              boostCapabilities={snapshot?.capabilities}
            />
          ))}
        </div>

        {canExpand ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => setIsExpanded(!isExpanded)}
            className="mt-4 h-10 w-full rounded-xl text-sm text-muted-foreground hover:text-foreground"
          >
            {isExpanded ? (
              <>
                <ChevronUp className="size-4" />
                {txa('Daha az göster')}
              </>
            ) : (
              <>
                <ChevronDown className="size-4" />
                {txa('Tumunu goster (')}{combinedEntries.length - collapsedCount}{' '}{txa('daha)')}
              </>
            )}
          </Button>
        ) : null}
      </div>
    </Card>
  )
}

export { FeaturedNotes, SupporterAvatarStack, SupporterCard }
