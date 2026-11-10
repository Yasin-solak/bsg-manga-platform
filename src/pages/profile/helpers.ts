import type { UserProfileViewAccess } from '@/services/userService'
import type { FavoriteGenre, SocialLink } from './types'
import { intlLocale, txa } from '@/i18n/activeLocale'

export const KNOWN_PROFILE_FRAME_TYPES = [
  'default',
  'christmas',
  'halloween',
  'avatarframe1',
  'avatarframe2',
  'avatarframe3',
  'avatarframe4',
  'fire',
  'ice',
  'neon',
  'gold',
  'rainbow',
] as const

const GENRE_COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--secondary))',
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
]

export function buildGenreGradient(genres: FavoriteGenre[]): string {
  let acc = 0
  const stops = genres.map((genre, index) => {
    const start = acc
    acc += genre.percent
    return `${GENRE_COLORS[index % GENRE_COLORS.length]} ${start}% ${acc}%`
  })
  return `conic-gradient(${stops.join(', ')})`
}

export function formatTimeSpent(mins: number): string {
  if (mins < 60) return `${mins} dk`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} saat`
  const days = Math.floor(hours / 24)
  const remainingHours = hours % 24
  return remainingHours ? txa('{v1} gün {v2} saat', { v1: days, v2: remainingHours }) : txa('{v1} gun', { v1: days })
}

export function formatRelativeTime(iso: string): string {
  const parsed = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - parsed.getTime()
  const diffMinutes = Math.floor(diffMs / 60_000)
  const diffHours = Math.floor(diffMs / 3_600_000)
  const diffDays = Math.floor(diffMs / 86_400_000)
  if (diffMinutes < 1) return txa('Az önce')
  if (diffMinutes < 60) return txa('{v1} dakika önce', { v1: diffMinutes })
  if (diffHours < 24) return txa('{v1} saat önce', { v1: diffHours })
  if (diffDays < 7) return txa('{v1} gün önce', { v1: diffDays })
  return parsed.toLocaleDateString(intlLocale(), { day: 'numeric', month: 'short' })
}

export function getSocialByPlatform(links: SocialLink[], platform: string): string {
  const target = links.find((link) => link.platform.toLowerCase() === platform.toLowerCase())
  return target?.username ?? ''
}

export function createHiddenProfileStats() {
  return {
    reading: 0,
    followers: 0,
    following: 0,
    totalChaptersRead: 0,
    timeSpentMinutes: 0,
    comments: 0,
  }
}

export function getProfilePrivacyGateMessage(access: UserProfileViewAccess | null) {
  if (!access) return txa('Bu profil şu anda sana açık değil.')
  if (access.profileVisibility === 'followers' || access.profileVisibility === 'private') {
    return txa('Bu hesap gizli. Takip isteğin onaylanınca profilini görebilirsin.')
  }
  return txa('Bu profil şu anda sana açık değil.')
}

/** Membership length: "for 3 years", "for 5 months", "joined this month" (UI text). */
export function membershipLabel(joinedAt?: string) {
  if (!joinedAt) return null
  const start = new Date(joinedAt)
  if (Number.isNaN(start.getTime())) return null
  const now = new Date()
  const months = (now.getFullYear() - start.getFullYear()) * 12 + now.getMonth() - start.getMonth()
  if (months >= 12) return txa('{v1} yıldır üye', { v1: Math.floor(months / 12) })
  if (months >= 1) return txa('{v1} aydır üye', { v1: months })
  return txa('Bu ay katıldı')
}
