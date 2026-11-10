import { BookOpen, CalendarDays, Clock3, Link2, Shield, Sparkles, type LucideIcon } from 'lucide-react'
import { formatRelativeTime } from './helpers'
import type { ActivityFeedItem, FavoriteGenre, MockUser, ProfileOwnedBadge } from './types'
import { intlLocale, txa } from '@/i18n/activeLocale'

export const PROFILE_HERO_CARD_WIDTH_PX = 450
export const PROFILE_HERO_CARD_HEIGHT_PX = 900
export const PROFILE_HERO_BACKGROUND_HEIGHT_PX = 202
export const PROFILE_HERO_AVATAR_SIZE_PX = 80
export const PROFILE_HERO_VISIBLE_BADGE_LIMIT = 3
export const PROFILE_HERO_SOCIAL_PREVIEW_LIMIT = 2
export const PROFILE_HERO_GENRE_PREVIEW_LIMIT = 2

export type ProfileHeroIdentityItem = {
  id: string
  icon: LucideIcon
  label: string
  value: string
}

export type ProfileHeroSocialItem = {
  id: string
  icon: LucideIcon
  label: string
  value: string
}

export type ProfileHeroPulseItem = {
  id: string
  icon: LucideIcon
  label: string
  value: string
}

export function getVisibleProfileHeroBadges(ownedBadges: ProfileOwnedBadge[]) {
  const displayedBadges = ownedBadges
    .filter((badge) => badge.is_displayed)
    .sort((a, b) => a.display_order - b.display_order)

  return {
    visibleBadges: displayedBadges.slice(0, PROFILE_HERO_VISIBLE_BADGE_LIMIT),
    hiddenBadgeCount: Math.max(0, displayedBadges.length - PROFILE_HERO_VISIBLE_BADGE_LIMIT),
  }
}

export function buildProfileHeroIdentityItems({
  canViewProfileStats,
  user,
}: {
  canViewProfileStats: boolean
  user: MockUser
}): ProfileHeroIdentityItem[] {
  return [
    {
      id: 'level',
      icon: Shield,
      label: txa('Seviye'),
      value: user.level,
    },
    {
      id: 'join-date',
      icon: CalendarDays,
      label: txa('Katılım'),
      value: user.joinDate,
    },
    {
      id: 'reading',
      icon: BookOpen,
      label: txa('Okuma'),
      value: canViewProfileStats ? user.stats.reading.toLocaleString(intlLocale()) : txa('Gizli'),
    },
  ]
}

export function buildProfileHeroSocialItems(user: MockUser): ProfileHeroSocialItem[] {
  return user.socialLinks.slice(0, PROFILE_HERO_SOCIAL_PREVIEW_LIMIT).map((link, index) => ({
    id: `${link.platform}-${link.username}-${index}`,
    icon: Link2,
    label: link.platform,
    value: link.username,
  }))
}

export function buildProfileHeroPulseItems({
  favoriteGenresSorted,
  latestActivities,
  profileListCount,
}: {
  favoriteGenresSorted: FavoriteGenre[]
  latestActivities: ActivityFeedItem[]
  profileListCount: number
}): ProfileHeroPulseItem[] {
  const topGenre = favoriteGenresSorted[0]
  const latestActivity = latestActivities[0]

  return [
    {
      id: 'genre',
      icon: Sparkles,
      label: txa('Tür'),
      value: topGenre ? topGenre.name : txa('Yok'),
    },
    {
      id: 'activity',
      icon: Clock3,
      label: txa('Son hareket'),
      value: latestActivity ? formatRelativeTime(latestActivity.timestamp) : txa('Yok'),
    },
    {
      id: 'lists',
      icon: BookOpen,
      label: txa('Listeler'),
      value: profileListCount.toLocaleString(intlLocale()),
    },
  ]
}
