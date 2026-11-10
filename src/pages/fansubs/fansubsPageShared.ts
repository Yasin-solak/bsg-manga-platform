import { resolveVisibleFansubBackground } from '@/lib/fansubBoostCapabilityGovernance'
import { buildPublicImageProxyUrl } from '@/lib/publicImageProxyUrl'
import type {
  FansubInvite,
  FansubJoinRequest,
  FansubMembership,
} from '@/services/fansubMembershipService'
import { resolveStoreAssetUrl } from '@/services/assetUrlService'
import type { FansubRecentActivitySummary } from '@/services/fansubService'
import type { Fansub } from '@/types'
import type { CSSProperties } from 'react'
import { intlLocale, txa } from '@/i18n/activeLocale'

export type FansubSort = 'discover' | 'followers' | 'chapters' | 'new'

export interface FansubShowcaseEntry extends Fansub {
  showcaseScore: number
  showcaseRank: number
  isFeatured: boolean
  isWeeklyLeader: boolean
  weeklyChapterCount: number
  monthlyChapterCount: number
  totalChapterCount: number
  translatedMangaCount: number
  activityScore: number
  trendScore: number
  recommendationScore: number
  latestActivityAt?: string
  latestChapter?: FansubRecentActivitySummary['latestChapter']
}

export const DIRECTORY_BATCH_SIZE = 8
export const FANSUB_LIST_MEDIA_PROXY_WIDTH = 96
export const FANSUB_LIST_AVATAR_PROXY_QUALITY = 68

export const SORT_OPTIONS: Array<{ id: FansubSort; label: string }> = [
  { id: 'discover', get label() { return txa('Keşfet') } },
  { id: 'followers', get label() { return txa('En çok takipçi') } },
  { id: 'chapters', get label() { return txa('En bölüm çeviren') } },
  { id: 'new', get label() { return txa('Yeni fansublar') } },
]

export const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-amber-500/15 text-amber-500 border-amber-500/30',
  moderator: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
  member: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
}

export const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  approved: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  rejected: 'bg-red-500/15 text-red-400 border-red-500/30',
  cancelled: 'bg-muted text-muted-foreground border-border',
}

export function toErrorMessage(error: unknown, fallback = txa('İşlem sırasında hata oluştu.')) {
  if (error instanceof Error && error.message.trim()) return error.message
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const value = (error as { message?: unknown }).message
    if (typeof value === 'string' && value.trim()) return value
  }
  return fallback
}

export function formatDateTime(value: string | undefined) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString(intlLocale())
}

export function formatCompactCount(value: number | undefined) {
  const normalized = Number(value || 0)
  if (!Number.isFinite(normalized)) return '0'
  if (normalized >= 1000) {
    return new Intl.NumberFormat(intlLocale(), {
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(normalized)
  }
  return normalized.toLocaleString(intlLocale())
}

export function formatRelativeTimeLabel(value: string | undefined) {
  if (!value) return txa('Aktivite bekleniyor')
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return txa('Aktivite bekleniyor')

  const diffMs = date.getTime() - Date.now()
  const diffMinutes = Math.round(diffMs / 60_000)
  const formatter = new Intl.RelativeTimeFormat(intlLocale(), { numeric: 'auto' })

  if (Math.abs(diffMinutes) < 60) return formatter.format(diffMinutes, 'minute')
  const diffHours = Math.round(diffMinutes / 60)
  if (Math.abs(diffHours) < 24) return formatter.format(diffHours, 'hour')
  const diffDays = Math.round(diffHours / 24)
  return formatter.format(diffDays, 'day')
}

export function getMembershipName(
  membership: FansubMembership,
  fansubLookup: Map<string, Fansub>,
) {
  return membership.fansub?.name || fansubLookup.get(membership.fansubId)?.name || txa('Fansub')
}

export function buildFansubLookup(fansubs: Fansub[]) {
  const lookup = new Map<string, Fansub>()
  fansubs.forEach((fansub) => lookup.set(fansub.id, fansub))
  return lookup
}

function getTimeValue(value?: string) {
  if (!value) return 0
  const time = new Date(value).getTime()
  return Number.isFinite(time) ? time : 0
}

function normalizeRatio(value: number, maxValue: number) {
  if (!Number.isFinite(value) || value <= 0) return 0
  if (!Number.isFinite(maxValue) || maxValue <= 0) return 0
  return Math.min(1, value / maxValue)
}

export function buildFansubShowcaseEntries(
  fansubs: Fansub[],
  activityByFansubId: ReadonlyMap<string, FansubRecentActivitySummary> = new Map(),
): FansubShowcaseEntry[] {
  if (fansubs.length === 0) return []

  const enriched = fansubs.map((fansub) => {
    const activity = activityByFansubId.get(fansub.id)
    const weeklyChapterCount = activity?.weeklyChapterCount ?? 0
    const monthlyChapterCount = Math.max(activity?.monthlyChapterCount ?? 0, weeklyChapterCount)
    const totalChapterCount = activity?.totalChapterCount ?? 0
    const translatedMangaCount = activity?.translatedMangaCount ?? 0
    const displayFansub = {
      ...fansub,
      mangaCount: translatedMangaCount,
    }

    return {
      fansub: displayFansub,
      weeklyChapterCount,
      monthlyChapterCount,
      totalChapterCount,
      translatedMangaCount,
      latestActivityAt: activity?.latestActivityAt,
      latestChapter: activity?.latestChapter,
    }
  })

  const maxFollowerCount = Math.max(...enriched.map(({ fansub }) => fansub.followerCount || 0), 1)
  const maxMangaCount = Math.max(...enriched.map(({ fansub }) => fansub.mangaCount || 0), 1)
  const maxWeeklyChapterCount = Math.max(...enriched.map((entry) => entry.weeklyChapterCount), 1)
  const maxMonthlyChapterCount = Math.max(...enriched.map((entry) => entry.monthlyChapterCount), 1)
  const maxTotalChapterCount = Math.max(...enriched.map((entry) => entry.totalChapterCount), 1)
  const newestTime = Math.max(...enriched.map(({ fansub }) => getTimeValue(fansub.createdAt)), 1)

  const ranked = enriched.map((entry) => {
    const followerRatio = normalizeRatio(entry.fansub.followerCount || 0, maxFollowerCount)
    const mangaRatio = normalizeRatio(entry.fansub.mangaCount || 0, maxMangaCount)
    const weeklyRatio = normalizeRatio(entry.weeklyChapterCount, maxWeeklyChapterCount)
    const monthlyRatio = normalizeRatio(entry.monthlyChapterCount, maxMonthlyChapterCount)
    const totalChapterRatio = normalizeRatio(entry.totalChapterCount, maxTotalChapterCount)
    const latestTime = getTimeValue(entry.latestActivityAt)
    const createdTime = getTimeValue(entry.fansub.createdAt)
    const activityRecencyRatio = latestTime > 0
      ? Math.max(0, Math.min(1, 1 - ((Date.now() - latestTime) / (1000 * 60 * 60 * 24 * 30))))
      : 0
    const newnessRatio = createdTime > 0 ? normalizeRatio(createdTime, newestTime) : 0.15
    const activityScore = weeklyRatio * 0.55 + monthlyRatio * 0.25 + activityRecencyRatio * 0.2
    const trendScore = weeklyRatio * 0.62 + followerRatio * 0.25 + activityRecencyRatio * 0.13
    const recommendationScore = weeklyRatio * 0.32 + newnessRatio * 0.26 + mangaRatio * 0.22 + totalChapterRatio * 0.08 + (1 - followerRatio) * 0.12
    const showcaseScore = weeklyRatio * 0.48 + followerRatio * 0.24 + mangaRatio * 0.16 + totalChapterRatio * 0.12

    return {
      ...entry.fansub,
      showcaseScore,
      showcaseRank: 0,
      isFeatured: false,
      isWeeklyLeader: false,
      weeklyChapterCount: entry.weeklyChapterCount,
      monthlyChapterCount: entry.monthlyChapterCount,
      totalChapterCount: entry.totalChapterCount,
      translatedMangaCount: entry.translatedMangaCount,
      activityScore,
      trendScore,
      recommendationScore,
      latestActivityAt: entry.latestActivityAt,
      latestChapter: entry.latestChapter,
    }
  })

  ranked.sort((left, right) => {
    if (right.weeklyChapterCount !== left.weeklyChapterCount) {
      return right.weeklyChapterCount - left.weeklyChapterCount
    }
    if (right.activityScore !== left.activityScore) {
      return right.activityScore - left.activityScore
    }
    if ((right.followerCount || 0) !== (left.followerCount || 0)) {
      return (right.followerCount || 0) - (left.followerCount || 0)
    }
    return left.name.localeCompare(right.name, 'tr')
  })

  return ranked.map((fansub, index) => ({
    ...fansub,
    showcaseRank: index + 1,
    isFeatured: index === 0,
    isWeeklyLeader: index === 0,
  }))
}

export function filterAndSortFansubs(
  fansubs: FansubShowcaseEntry[],
  query: string,
  sort: FansubSort,
) {
  const normalizedQuery = query.trim().toLocaleLowerCase('tr-TR')

  const filtered = fansubs.filter((fansub) => {
    if (!normalizedQuery) return true
    return `${fansub.name} ${fansub.description || ''}`.toLocaleLowerCase('tr-TR').includes(normalizedQuery)
  })

  const sorted = [...filtered]
  sorted.sort((left, right) => {
    if (sort === 'followers') {
      return (right.followerCount || 0) - (left.followerCount || 0)
    }
    if (sort === 'chapters') {
      return right.totalChapterCount - left.totalChapterCount
    }
    if (sort === 'new') {
      return getTimeValue(right.createdAt) - getTimeValue(left.createdAt)
    }
    if (right.isWeeklyLeader !== left.isWeeklyLeader) return right.isWeeklyLeader ? 1 : -1
    if (right.showcaseScore !== left.showcaseScore) return right.showcaseScore - left.showcaseScore
    return left.name.localeCompare(right.name, 'tr')
  })

  return sorted
}

export function buildRightSidebarFansubModel(items: FansubShowcaseEntry[]) {
  const trendFansubs = [...items]
    .sort((left, right) => right.trendScore - left.trendScore)
    .slice(0, 5)
  const recentFansubs = [...items]
    .filter((fansub) => Boolean(fansub.latestChapter))
    .sort((left, right) => {
      const latestDiff = getTimeValue(right.latestActivityAt) - getTimeValue(left.latestActivityAt)
      if (latestDiff !== 0) return latestDiff
      return right.activityScore - left.activityScore
    })
    .slice(0, 4)
  const trendIdSet = new Set(trendFansubs.slice(0, 2).map((fansub) => fansub.id))
  const recommendedFansubs = [...items]
    .filter((fansub) => !trendIdSet.has(fansub.id))
    .sort((left, right) => right.recommendationScore - left.recommendationScore)
    .slice(0, 3)

  return {
    trendFansubs,
    recentFansubs,
    recommendedFansubs,
  }
}

function shouldProxyFansubAvatar(avatarUrl?: string | null) {
  if (!avatarUrl) return false
  const trimmed = avatarUrl.trim()
  if (!trimmed) return false
  if (/api\.dicebear\.com/i.test(trimmed)) return false
  if (/\.svg(?:$|[?#])/i.test(trimmed)) return false
  return true
}

export function resolveFansubListAvatarUrl(fansub: Pick<Fansub, 'avatar'>) {
  if (!shouldProxyFansubAvatar(fansub.avatar)) return fansub.avatar

  return buildPublicImageProxyUrl(
    fansub.avatar,
    FANSUB_LIST_MEDIA_PROXY_WIDTH,
    FANSUB_LIST_AVATAR_PROXY_QUALITY,
  ) ?? fansub.avatar
}

function resolveVisibleCardBackground(
  fansub: Pick<
    Fansub,
    | 'profileBackgroundStyle'
    | 'profileBackgroundVideoUrl'
    | 'canUploadStaticBackground'
    | 'canUploadVideoBackground'
  >,
) {
  const backgroundStyle = fansub.profileBackgroundStyle?.trim()
  const backgroundVideoUrl = fansub.profileBackgroundVideoUrl?.trim()

  if (!backgroundStyle && !backgroundVideoUrl) return null

  return resolveVisibleFansubBackground(
    {
      background: backgroundStyle || '',
      mediaType: backgroundVideoUrl ? 'video' : 'image',
      videoUrl: backgroundVideoUrl || undefined,
    },
    {
      canUploadStaticBackground: fansub.canUploadStaticBackground,
      canUploadVideoBackground: fansub.canUploadVideoBackground,
    },
    'resolved',
  )
}

export function resolveFansubCardBackgroundVideoUrl(fansub: Fansub) {
  return resolveVisibleCardBackground(fansub)?.videoUrl || undefined
}

export function hasFansubCardBackgroundMedia(fansub: Fansub) {
  const visibleBackground = resolveVisibleCardBackground(fansub)
  if (visibleBackground?.background || visibleBackground?.videoUrl) return true
  return fansub.canUploadStaticBackground === true && Boolean(fansub.customBackgroundAssetUrl?.trim())
}

function toBackgroundImageLayer(backgroundStyle: string) {
  const trimmed = backgroundStyle.trim()
  const urlLayer = trimmed.match(/url\((?:"[^"]*"|'[^']*'|[^)]*)\)/i)
  return urlLayer?.[0] || trimmed
}

export function buildFansubCardBackgroundStyle(
  fansub: Fansub,
  options: { overlay?: 'default' | 'none' } = {},
): CSSProperties {
  const primary = fansub.primaryColor || '#991b1b'
  const secondary = fansub.secondaryColor || '#111827'
  const visibleBackground = resolveVisibleCardBackground(fansub)
  const resolvedCardBackground = visibleBackground?.background?.trim()
  const directCustomBackground = fansub.canUploadStaticBackground === true
    ? (resolveStoreAssetUrl(fansub.customBackgroundAssetUrl) || fansub.customBackgroundAssetUrl?.trim())
    : undefined
  const baseLayer = resolvedCardBackground
    ? toBackgroundImageLayer(resolvedCardBackground)
    : directCustomBackground
      ? `url("${directCustomBackground}")`
      : null

  if (!baseLayer) {
    return {
      backgroundColor: 'var(--background)',
    }
  }

  const backgroundLayers = options.overlay === 'none'
    ? [baseLayer]
    : [
        `linear-gradient(90deg, rgba(5,5,7,0.94), rgba(5,5,7,0.76) 38%, rgba(5,5,7,0.2))`,
        `linear-gradient(120deg, ${primary}55, transparent 42%, ${secondary}33)`,
        baseLayer,
      ]

  return {
    backgroundImage: backgroundLayers.join(', '),
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
  }
}

export function countPendingInvites(invites: FansubInvite[]) {
  return invites.filter((invite) => invite.status === 'pending').length
}

export function countPendingJoinRequests(joinRequests: FansubJoinRequest[]) {
  return joinRequests.filter((request) => request.status === 'pending').length
}
