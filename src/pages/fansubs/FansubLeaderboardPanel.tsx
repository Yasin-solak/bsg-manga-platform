import { Link } from '@/i18n/router'
import { ArrowUpRight, BookOpen, Clock3, Flame, Sparkles, Users, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { resolveFansubNameStylePresentation } from '@/components/common/fansubNameStyle'
import { FansubHoverCard } from '@/components/common/UserHoverCard'
import { resolveVisibleFansubNameStyle } from '@/lib/fansubBoostCapabilityGovernance'
import { buildPublicFansubPath } from '@/lib/routes'
import { cn } from '@/lib/utils'
import { FansubPlainAvatar } from './FansubPlainAvatar'
import {
  formatCompactCount,
  formatRelativeTimeLabel,
  resolveFansubListAvatarUrl,
  type FansubShowcaseEntry,
} from './fansubsPageShared'
import { txa } from '@/i18n/activeLocale'

interface FansubLeaderboardPanelProps {
  trendItems: FansubShowcaseEntry[]
  recentItems: FansubShowcaseEntry[]
  recommendedItems: FansubShowcaseEntry[]
}

function SidebarPanel({
  title,
  icon: Icon,
  children,
  testId,
}: {
  title: string
  icon: LucideIcon
  children: ReactNode
  testId: string
}) {
  return (
    <section
      data-testid={testId}
      className="rounded-lg border border-border/80 bg-card/70 p-3 shadow-none dark:border-white/10 dark:bg-black/28"
    >
      <h3 className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
        <Icon className="h-3.5 w-3.5 text-primary" />
        {title}
      </h3>
      <div className="mt-2 space-y-1">
        {children}
      </div>
    </section>
  )
}

function FansubSidebarIdentity({
  fansub,
  avatarSize = 34,
}: {
  fansub: FansubShowcaseEntry
  avatarSize?: number
}) {
  const optimizedAvatarUrl = resolveFansubListAvatarUrl(fansub)
  const visibleNameStyle = resolveVisibleFansubNameStyle(
    fansub.activeNameStyle,
    { hasFullNameStyle: fansub.hasFullNameStyle },
    'resolved',
  )
  const fansubNamePresentation = resolveFansubNameStylePresentation(visibleNameStyle)
  const hasStyledName = Boolean(visibleNameStyle)

  return (
    <FansubHoverCard {...fansub} className="flex w-full min-w-0 max-w-full" sideOffset={12}>
      <div className="flex w-full min-w-0 items-center gap-2" data-name-style-mode={hasStyledName ? 'styled' : 'plain'}>
        <FansubPlainAvatar src={optimizedAvatarUrl} alt={fansub.name} size={avatarSize} />
        <div className="min-w-0 flex-1">
          <p
            className={cn('w-full truncate text-[13px] font-semibold text-foreground group-hover:text-primary', fansubNamePresentation.className)}
            style={fansubNamePresentation.inlineStyle}
          >
            {fansub.name}
          </p>
          <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
            {txa('{count} takipçi', { count: formatCompactCount(fansub.followerCount) })}
          </p>
        </div>
      </div>
    </FansubHoverCard>
  )
}

function TrendRow({ fansub, rank }: { fansub: FansubShowcaseEntry; rank: number }) {
  const fansubHref = buildPublicFansubPath({ id: fansub.id, slug: fansub.slug })

  return (
    <Link
      to={fansubHref}
      data-testid={`fansub-trend-row-${fansub.slug || fansub.id}`}
      className="group flex items-center gap-2 rounded-md border border-transparent px-1.5 py-1.5 text-foreground no-underline transition hover:border-primary/25 hover:bg-primary/5"
    >
      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-semibold text-primary">
        {rank}
      </span>
      <div className="min-w-0 flex-1">
        <FansubSidebarIdentity fansub={fansub} />
      </div>
    </Link>
  )
}

function RecentRow({ fansub }: { fansub: FansubShowcaseEntry }) {
  const fansubHref = buildPublicFansubPath({ id: fansub.id, slug: fansub.slug })
  const latestChapter = fansub.latestChapter
  const chapterLabel = latestChapter?.mangaTitle
    ? (latestChapter.chapterNumber ? txa('{title} - {number}. bölüm', { title: latestChapter.mangaTitle, number: latestChapter.chapterNumber }) : latestChapter.mangaTitle)
    : txa('{count} bölüm', { count: formatCompactCount(fansub.totalChapterCount) })

  return (
    <Link
      to={fansubHref}
      data-testid={`fansub-recent-row-${fansub.slug || fansub.id}`}
      className="group flex items-center gap-2 rounded-md border border-transparent px-1.5 py-1.5 text-foreground no-underline transition hover:border-primary/25 hover:bg-primary/5"
    >
      <div className="min-w-0 flex-1">
        <FansubSidebarIdentity fansub={fansub} avatarSize={32} />
      </div>
      <div className="max-w-[104px] shrink-0 text-right">
        <p className="truncate text-[10px] text-muted-foreground">{formatRelativeTimeLabel(fansub.latestActivityAt)}</p>
        <p className="mt-0.5 line-clamp-1 text-[10px] leading-3 text-muted-foreground/80">{chapterLabel}</p>
      </div>
    </Link>
  )
}

function RecommendedRow({ fansub }: { fansub: FansubShowcaseEntry }) {
  const fansubHref = buildPublicFansubPath({ id: fansub.id, slug: fansub.slug })

  return (
    <Link
      to={fansubHref}
      data-testid={`fansub-recommended-row-${fansub.slug || fansub.id}`}
      className="group flex items-center gap-2 rounded-md border border-transparent px-1.5 py-1.5 text-foreground no-underline transition hover:border-primary/25 hover:bg-primary/5"
    >
      <div className="min-w-0 flex-1">
        <FansubSidebarIdentity fansub={fansub} avatarSize={32} />
      </div>
      <span className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-primary/25 px-2 text-[11px] font-semibold text-primary">
        {txa('İncele')}
        <ArrowUpRight className="h-3 w-3" />
      </span>
    </Link>
  )
}

export function FansubLeaderboardPanel({
  trendItems,
  recentItems,
  recommendedItems,
}: FansubLeaderboardPanelProps) {
  return (
    <aside className="space-y-3 xl:sticky xl:top-20" data-testid="fansubs-right-sidebar">
      <SidebarPanel title={txa('Trend Fansublar')} icon={Flame} testId="fansub-trend-panel">
        {trendItems.map((fansub, index) => (
          <TrendRow key={fansub.id} fansub={fansub} rank={index + 1} />
        ))}
      </SidebarPanel>

      <SidebarPanel title={txa('Son Hareketler')} icon={Clock3} testId="fansub-recent-panel">
        {recentItems.length > 0
          ? recentItems.map((fansub) => (
              <RecentRow key={fansub.id} fansub={fansub} />
            ))
          : (
              <p className="px-1.5 py-2 text-xs text-muted-foreground">
                {txa('Henüz bölüm hareketi yok.')}
              </p>
            )}
      </SidebarPanel>

      <SidebarPanel title={txa('Önerilen Fansublar')} icon={Users} testId="fansub-recommended-panel">
        {recommendedItems.map((fansub) => (
          <RecommendedRow key={fansub.id} fansub={fansub} />
        ))}
      </SidebarPanel>

      <section
        data-testid="fansub-support-guide-panel"
        className="overflow-hidden rounded-lg border border-border/80 bg-card/70 p-3 shadow-none dark:border-white/10 dark:bg-black/28"
      >
        <h3 className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          {txa('Takviye Rehberi')}
        </h3>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          {txa('Takviye burada sadece rehberdir; keşif akışında filtre olarak açılmaz.')}
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
          <div className="rounded-md border border-border/70 bg-background/45 p-2 dark:border-white/10 dark:bg-black/25">
            <BookOpen className="mb-1.5 h-3.5 w-3.5 text-primary" />
            {txa('Düzenli bölüm akışı görünürlüğü artırır.')}
          </div>
          <div className="rounded-md border border-border/70 bg-background/45 p-2 dark:border-white/10 dark:bg-black/25">
            <Users className="mb-1.5 h-3.5 w-3.5 text-primary" />
            {txa('Takip edilen ekipler önerilerde güçlenir.')}
          </div>
        </div>
      </section>
    </aside>
  )
}
