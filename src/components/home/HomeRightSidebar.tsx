import { useCommunityAvailability } from '@/contexts/CommunityAvailabilityContext'
import { MyMurek } from '@/components/murek/MyMurek'
import { resolveMurekFeedState } from '@/lib/murek'
import { useEffect, useState, type ReactNode } from 'react'
import { Link } from '@/i18n/router'
import { ArrowRight, Check, Coins, Flame, Gift, Target } from 'lucide-react'
import { AnnouncementsPanel } from '@/components/announcements/AnnouncementsPanel'
import type { FollowActivityItem } from '@/services/followFeedService'
import { listQuests } from '@/services/rewardService'
import type { Quest, ReadingStreakSummary, ReadingStreakWeekDay } from '@/services/rewardService'
import { AvatarFrame } from '@/components/common/AvatarFrame'
import { FansubProfileHoverLink, ProfileHoverLink } from '@/components/common/ProfileHoverLink'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { formatRelativeTime, getFollowActorRoute, stripFollowActorPrefix } from './homeUtils'
import { useTx } from '@/i18n/LocaleProvider'
import { intlLocale, txa } from '@/i18n/activeLocale'

interface HomeRightSidebarProps {
  followFeedItems: FollowActivityItem[]
  followFeedLoading: boolean
  isActivityFeedEnabled: boolean
  isAuthenticated: boolean
  currentUsername?: string
  readingStreakDays: number
  readingStreakSummary?: ReadingStreakSummary | null
}

export function HomeRightSidebar({
  followFeedItems,
  followFeedLoading,
  isActivityFeedEnabled,
  isAuthenticated,
  currentUsername,
  readingStreakDays,
  readingStreakSummary,
}: HomeRightSidebarProps) {
  return (
    <aside className="space-y-4">
      <AnnouncementsPanel />
      <div className="dh-right-personal">
      {isAuthenticated ? (
        <ReadingStreakCard
          currentStreak={readingStreakDays}
          currentUsername={currentUsername}
          summary={readingStreakSummary}
        />
      ) : null}
      {isAuthenticated && isActivityFeedEnabled ? (
        <RecentActivitiesCard items={followFeedItems} loading={followFeedLoading} />
      ) : null}
      </div>
    </aside>
  )
}

function ReadingStreakCard({
  currentStreak,
  currentUsername,
  summary,
}: {
  currentStreak: number
  currentUsername?: string
  summary?: ReadingStreakSummary | null
}) {
  const tx = useTx()
  const safeStreak = Math.max(0, Math.floor(summary?.currentStreak ?? currentStreak ?? 0))
  const hasReadToday = summary?.hasReadToday === true
  const activeDaysThisWeek = Math.max(0, Math.floor(summary?.activeDaysThisWeek || 0))
  const normalizedWeekDays = normalizeStreakWeekDays(summary?.weekDays, safeStreak, hasReadToday)
  const message = resolveReadingStreakMessage(safeStreak, hasReadToday, activeDaysThisWeek)

  const [dailies, setDailies] = useState<Quest[] | null>(null)
  useEffect(() => {
    let cancelled = false
    const refresh = () => { void listQuests('user')
      .then((all) => {
        if (!cancelled) setDailies(all.filter((quest) => quest.kind === 'daily').sort((a, b) => a.sortOrder - b.sortOrder))
      })
      .catch(() => { if (!cancelled) setDailies([]) }) }
    refresh()
    window.addEventListener('mz:desktop-home-quests-refresh', refresh)
    return () => { cancelled = true; window.removeEventListener('mz:desktop-home-quests-refresh', refresh) }
  }, [currentUsername])

  const hasDailies = !!dailies && dailies.length > 0
  const dailyDone = (dailies ?? []).filter((quest) => quest.isClaimed).length
  const claimableCoin = (dailies ?? [])
    .filter((quest) => quest.isClaimable && !quest.isClaimed)
    .reduce((sum, quest) => sum + quest.coinReward, 0)
  const openQuests = () => window.dispatchEvent(new Event('mz:open-desktop-home-quests'))
  // Feed Mürek: the face of daily quests; each claimed quest feeds Mürek.
  const murekFeed = resolveMurekFeedState(dailyDone, (dailies ?? []).length)

  return (
    <Card className="rounded-xl border-border/60 bg-card p-4 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <Flame className="h-4 w-4 fill-primary text-primary" />
        <h3 className="text-sm font-black tracking-tight">{tx('OKUMA SERİSİ')}</h3>
      </div>

      <div className="mb-5 flex items-center gap-4">
        <div className="flex shrink-0 items-end gap-1">
          <span className="text-5xl font-black leading-none text-foreground">{safeStreak}</span>
          <span className="pb-2 text-xs font-black uppercase text-muted-foreground">{tx('GÜN')}</span>
        </div>
        <div className="h-11 w-px bg-border" />
        <div className="min-w-0">
          <p className="text-sm font-bold text-foreground">
            {message.title}
          </p>
          <p className="mt-1 text-xs leading-4 text-muted-foreground">
            {message.description}
          </p>
        </div>
      </div>

      <div className="relative grid grid-cols-7 gap-1">
        <span className="absolute left-[7%] right-[7%] top-[13px] h-0.5 rounded-full bg-border" />
        {normalizedWeekDays.map((day, index) => {
          const completed = day.isRead
          const isToday = day.isToday
          const isHotTrail = completed && (isToday || index === normalizedWeekDays.length - 2)

          return (
            <div key={`${day.date}:${day.label}`} className="relative z-10 flex min-w-0 flex-col items-center gap-1">
              <div
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-full border text-[10px] font-bold transition-all duration-300',
                  completed
                    ? 'border-amber-300 bg-amber-400 text-black shadow-sm shadow-amber-500/25'
                    : 'border-border bg-muted text-muted-foreground',
                  isToday && completed && 'border-primary bg-primary text-primary-foreground shadow-primary/30',
                  isToday && !completed && 'border-primary/50 bg-primary/10 text-primary',
                )}
              >
                {isHotTrail ? <span className="absolute h-7 w-7 rounded-full bg-primary/25 motion-safe:animate-ping" /> : null}
                {completed ? (
                  isHotTrail
                    ? <Flame className="relative h-4 w-4 fill-current motion-safe:animate-pulse" />
                    : <Check className="relative h-3.5 w-3.5" />
                ) : (
                  isToday
                    ? <Flame className="h-3.5 w-3.5" />
                    : <span className="h-1.5 w-1.5 rounded-full bg-current/40" />
                )}
              </div>
              <span className={cn('truncate text-[10px] font-medium', isToday && completed ? 'text-primary' : 'text-muted-foreground')}>
                {day.label}
              </span>
            </div>
          )
        })}
      </div>

      {hasDailies ? (
        <div className="mt-4 border-t border-border/60 pt-3">
          <div className="mb-2.5 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Target className="h-3.5 w-3.5 text-amber-500" />
              <span className="text-[11px] font-black uppercase tracking-wider text-foreground/80">{tx('Günlük Görevler')}</span>
            </div>
            <span className="text-[10px] font-bold text-muted-foreground">{dailyDone}/{(dailies ?? []).length}</span>
          </div>

          {murekFeed && (
            <div className="mb-3 flex items-center gap-2.5 rounded-xl border border-border/60 bg-muted/30 px-2.5 py-2" data-testid="murek-feed" data-murek-feed={murekFeed.mood}>
              <MyMurek mood={murekFeed.mood} size={40} motion={murekFeed.mood === 'full' ? 'jump' : 'bob'} />
              <div className="min-w-0 flex-1">
                <p className="m-0 text-[11.5px] font-black text-foreground">{murekFeed.title}</p>
                <p className="m-0 text-[10.5px] leading-snug text-muted-foreground">{murekFeed.description}</p>
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-all" style={{ width: `${Math.round(murekFeed.ratio * 100)}%` }} />
                </div>
              </div>
            </div>
          )}

          <div className="space-y-2.5">
            {(dailies ?? []).map((quest) => {
              const pct = Math.min(100, Math.round((quest.progressValue / Math.max(1, quest.targetValue)) * 100))
              return (
                <button
                  key={quest.questId}
                  type="button"
                  onClick={openQuests}
                  className="group flex w-full items-center gap-2.5 text-left"
                >
                  <span
                    className={cn(
                      'flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[10px] font-bold',
                      quest.isClaimed
                        ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                        : quest.isClaimable
                          ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                          : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {quest.isClaimed ? <Check className="h-3.5 w-3.5" /> : quest.isClaimable ? <Gift className="h-3.5 w-3.5" /> : quest.progressValue}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-[11px] font-bold text-foreground group-hover:text-primary">{quest.title}</p>
                      <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">{quest.progressValue}/{quest.targetValue}</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn('h-full rounded-full', quest.isClaimed ? 'bg-emerald-500' : 'bg-gradient-to-r from-amber-400 to-orange-500')}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                </button>
              )
            })}
          </div>

          {claimableCoin > 0 ? (
            <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/8 px-3 py-2">
              <p className="flex items-center gap-1 text-[11px] font-bold text-foreground">
                <Coins className="h-3 w-3 text-amber-500" /> {tx('Ödül hazır: +{coin} coin', { coin: claimableCoin.toLocaleString(intlLocale()) })}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-3 flex items-center gap-2">
        {hasDailies ? (
          <button
            type="button"
            onClick={openQuests}
            className="flex flex-1 items-center justify-center gap-1 rounded-full bg-primary py-2.5 text-xs font-bold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {tx('Görevleri Aç')} <ArrowRight className="h-3.5 w-3.5" />
          </button>
        ) : null}
        <Link
          to={currentUsername ? `/profil/${encodeURIComponent(currentUsername)}` : '/'}
          className={cn(
            'flex items-center justify-center gap-1 rounded-full border border-border/70 bg-background/40 py-2.5 text-xs font-bold text-foreground transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-primary',
            hasDailies ? 'px-4' : 'flex-1',
          )}
        >
          {hasDailies ? tx('İstatistikler') : tx('İstatistiklerini Gör')} <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </Card>
  )
}

function normalizeStreakWeekDays(
  weekDays: ReadingStreakWeekDay[] | undefined,
  currentStreak: number,
  hasReadToday: boolean,
) {
  if (Array.isArray(weekDays) && weekDays.length === 7) return weekDays

  const labels = [txa('Pzt'), txa('Sal'), txa('Çar'), txa('Per'), txa('Cum'), txa('Cmt'), txa('Bugün')]
  const activeDays = Math.min(currentStreak, labels.length)
  return labels.map((label, index) => {
    const isToday = index === labels.length - 1
    return {
      date: String(index),
      label,
      isRead: isToday ? hasReadToday : currentStreak > 0 && index >= labels.length - activeDays,
      isToday,
    }
  })
}

function resolveReadingStreakMessage(currentStreak: number, hasReadToday: boolean, activeDaysThisWeek: number) {
  if (!hasReadToday && currentStreak >= 14) {
    return {
      title: txa('Seri riskte'),
      description: txa('{days} günlük seriyi korumak için bugün bir bölüm oku.', { days: currentStreak }),
    }
  }

  if (!hasReadToday && currentStreak > 0) {
    return {
      title: txa('Bugünkü halka eksik'),
      description: txa('Bir bölüm oku, seri akışı bugün de devam etsin.'),
    }
  }

  if (!hasReadToday) {
    return {
      title: txa('Bugün başlat'),
      description: txa('Bir bölüm oku, günlük ödülünü ve ilk halkanı aç.'),
    }
  }

  if (currentStreak >= 30) {
    return {
      title: txa('Efsane seri'),
      description: txa('{days} gün üst üste. Bu tempo artık vitrinlik.', { days: currentStreak }),
    }
  }

  if (currentStreak >= 14) {
    return {
      title: txa('Seri ustası'),
      description: txa('Bugünkü okuma tamam. Sıra yeni kilometre taşında.'),
    }
  }

  if (currentStreak >= 7) {
    return {
      title: txa('Haftalık seri tamam'),
      description: txa('Bugün de okudun. Haftalık ödülleri zorlamaya devam.'),
    }
  }

  if (currentStreak >= 3) {
    return {
      title: txa('Tempo tuttu'),
      description: txa('{days} aktif günle haftalık ritmin güçleniyor.', { days: activeDaysThisWeek }),
    }
  }

  return {
    title: txa('Seri başladı'),
    description: txa('Bugünkü okuma tamam. Yarın devam edersen seri büyür.'),
  }
}

function RecentActivitiesCard({ items, loading }: { items: FollowActivityItem[]; loading: boolean }) {
  const { enabled } = useCommunityAvailability()
  const tx = useTx()
  const previewItems = items.slice(0, 4)

  return (
    <Card className="rounded-xl border-border/60 bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-bold">{tx('SON ETKİNLİKLER')}</h3>
        {enabled && <Link to="/topluluk" className="text-[10px] font-semibold text-muted-foreground hover:text-primary">
          {tx('Tüm aktiviteleri gör')}
        </Link>}
      </div>

      {loading ? (
        <p className="py-3 text-xs text-muted-foreground">{tx('Yükleniyor...')}</p>
      ) : previewItems.length === 0 ? (
        <p className="py-3 text-xs text-muted-foreground">{tx('Henüz aktivite yok.')}</p>
      ) : (
        <div className="space-y-3">
          {previewItems.map((item) => {
            const actorName = item.actorName || tx('Bilinmeyen')
            const actorAvatar = item.actorAvatarUrl
              || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(actorName)}`
            const activityRoute = item.routeHint || getFollowActorRoute(item) || '/topluluk'
            const summary = stripFollowActorPrefix(item.summary || '', actorName) || item.summary || ''

            return (
              <div key={item.id} className="group flex items-start gap-2.5 rounded-lg p-1.5 transition-colors hover:bg-accent/40">
                <ActivityActorHoverLink item={item} actorName={actorName} actorAvatar={actorAvatar}>
                  <AvatarFrame
                    src={actorAvatar}
                    alt={actorName}
                    frameType={item.actorFrameType || 'default'}
                    size={24}
                    animated
                    hoverPlayback="auto"
                  />
                </ActivityActorHoverLink>
                <div className="min-w-0 flex-1">
                  <div className="text-xs leading-4">
                    <ActivityActorHoverLink
                      item={item}
                      actorName={actorName}
                      actorAvatar={actorAvatar}
                      className="font-semibold text-foreground transition-colors hover:text-primary"
                    >
                      {actorName}
                    </ActivityActorHoverLink>
                    <Link to={activityRoute} className="text-muted-foreground transition-colors hover:text-foreground">
                      {' '}
                      {summary}
                    </Link>
                  </div>
                  <p className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <span>{formatRelativeTime(item.createdAt)}</span>
                  </p>
                </div>
                {item.mangaCoverImageUrl ? <Link to={activityRoute} className="shrink-0" aria-label={item.mangaTitle || tx('Etkinliği aç')}><img src={item.mangaCoverImageUrl} alt="" className="h-11 w-8 rounded-md object-cover" loading="lazy" /></Link> : null}
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}

function ActivityActorHoverLink({
  item,
  actorName,
  actorAvatar,
  className,
  children,
}: {
  item: FollowActivityItem
  actorName: string
  actorAvatar: string
  className?: string
  children: ReactNode
}) {
  if (item.actorType === 'fansub') {
    return (
      <FansubProfileHoverLink
        fansubId={item.actorFansubId}
        fansubSlug={item.actorUsername}
        name={actorName}
        avatar={actorAvatar}
        frameType={item.actorFrameType}
        className={cn('inline-flex', className)}
        hoverClassName="inline-flex"
      >
        {children}
      </FansubProfileHoverLink>
    )
  }

  return (
    <ProfileHoverLink
      userId={item.actorUserId}
      username={item.actorUsername || actorName}
      displayName={actorName}
      avatar={actorAvatar}
      frameType={item.actorFrameType}
      className={cn('inline-flex', className)}
      hoverClassName="inline-flex"
    >
      {children}
    </ProfileHoverLink>
  )
}
