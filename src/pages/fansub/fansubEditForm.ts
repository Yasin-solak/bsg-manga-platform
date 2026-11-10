import {
  FANSUB_DESCRIPTION_MAX_LENGTH,
  FANSUB_SLUG_MAX_LENGTH,
  FANSUB_SLUG_MIN_LENGTH,
  FANSUB_SLUG_PATTERN,
  RESERVED_FANSUB_SLUGS,
} from '@/services/fansubService'
import type { FansubBadge } from '@/services/badgeService'
import type { ExtendedFansub, FansubEditDraft } from './types'
import { txa } from '@/i18n/activeLocale'

export const FANSUB_EDIT_AVATAR_MAX_SIZE_MB = 4
export const FANSUB_EDIT_BACKGROUND_MAX_SIZE_MB = 8
export const FANSUB_EDIT_DESCRIPTION_MAX_LENGTH = FANSUB_DESCRIPTION_MAX_LENGTH
export const FANSUB_EDIT_BACKGROUND_ACCEPT = 'image/jpeg,image/png,image/webp,video/webm,video/mp4'
const DISCORD_INVITE_HOSTS = new Set([
  'discord.gg',
  'www.discord.gg',
  'discord.com',
  'www.discord.com',
  'ptb.discord.com',
  'canary.discord.com',
])

const ACCEPTED_AVATAR_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
])

export function sanitizeFansubDescription(value: string) {
  return value.trim().slice(0, FANSUB_EDIT_DESCRIPTION_MAX_LENGTH)
}

export function normalizeFansubDiscordInviteUrl(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return undefined

  const candidate = /^(https?:)?\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed.replace(/^\/+/u, '')}`

  let parsed: URL
  try {
    parsed = new URL(candidate)
  } catch {
    throw new Error(txa('Discord bağlantısı geçersiz.'))
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(txa('Discord bağlantısı geçersiz.'))
  }

  const hostname = parsed.hostname.toLowerCase()
  if (!DISCORD_INVITE_HOSTS.has(hostname)) {
    throw new Error(txa('Sadece Discord davet bağlantısı girebilirsin.'))
  }

  const normalizedPath = parsed.pathname.toLowerCase()
  const isInvitePath = hostname.endsWith('discord.gg')
    ? normalizedPath.length > 1
    : normalizedPath.startsWith('/invite/')

  if (!isInvitePath) {
    throw new Error(txa('Discord davet baglantisi /invite veya discord.gg formunda olmali.'))
  }

  parsed.hash = ''
  return parsed.toString()
}

export function normalizeFansubVanitySlug(value: string, fallbackSlug?: string) {
  const candidate = (value.trim() || fallbackSlug?.trim() || '').toLowerCase()
  if (!candidate) {
    throw new Error(txa('Özel URL boş bırakılamaz.'))
  }
  if (candidate.length < FANSUB_SLUG_MIN_LENGTH) {
    throw new Error(txa('Özel URL en az {v1} karakter olmalı.', { v1: FANSUB_SLUG_MIN_LENGTH }))
  }
  if (candidate.length > FANSUB_SLUG_MAX_LENGTH) {
    throw new Error(txa('Özel URL en fazla {v1} karakter olabilir.', { v1: FANSUB_SLUG_MAX_LENGTH }))
  }
  if (!FANSUB_SLUG_PATTERN.test(candidate)) {
    throw new Error(txa('Özel URL yalnızca küçük harf, rakam ve tire içerebilir.'))
  }
  if (RESERVED_FANSUB_SLUGS.includes(candidate as (typeof RESERVED_FANSUB_SLUGS)[number])) {
    throw new Error(txa('Bu özel URL ayrılmış bir rota tarafından kullanılıyor.'))
  }
  return candidate
}

export function buildFansubEditPreview(
  fansub: ExtendedFansub,
  editDraft: FansubEditDraft,
): ExtendedFansub {
  return {
    ...fansub,
    avatar: editDraft.avatar || fansub.avatar,
    description: sanitizeFansubDescription(editDraft.description) || undefined,
    discordInviteUrl: editDraft.discordInviteUrl.trim() || undefined,
    slug: fansub.slug,
  }
}

export function buildFansubPreviewDisplayedBadges(
  ownedBadges: FansubBadge[],
  selectedBadgeIds: string[],
) {
  return ownedBadges
    .map((badge) => {
      const displayOrder = selectedBadgeIds.indexOf(badge.badge_id)
      return {
        ...badge,
        display_order: displayOrder === -1 ? badge.display_order : displayOrder,
        is_displayed: displayOrder !== -1,
      }
    })
    .sort((a, b) => a.display_order - b.display_order)
}

export function validateFansubAvatarFile(file: File) {
  if (!ACCEPTED_AVATAR_TYPES.has(file.type)) {
    throw new Error(txa('Fansub avatarı JPG, PNG, WEBP veya GIF olmalıdır.'))
  }

  if (file.size > FANSUB_EDIT_AVATAR_MAX_SIZE_MB * 1024 * 1024) {
    throw new Error(txa('Fansub avatarı en fazla {v1}MB olabilir.', { v1: FANSUB_EDIT_AVATAR_MAX_SIZE_MB }))
  }
}

export function buildFansubBackgroundLabel(fileName: string) {
  const normalized = fileName
    .replace(/\.[^.]+$/u, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return normalized || txa('Fansub arka planı')
}

export function validateFansubBackgroundFile(file: File) {
  const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'video/webm', 'video/mp4'])
  if (!allowedMimeTypes.has(file.type)) {
    throw new Error(txa('Fansub arka planı JPG, PNG, WEBP, WEBM veya MP4 olmalıdır.'))
  }

  if (file.size > FANSUB_EDIT_BACKGROUND_MAX_SIZE_MB * 1024 * 1024) {
    throw new Error(txa('Fansub arka planı en fazla {v1}MB olabilir.', { v1: FANSUB_EDIT_BACKGROUND_MAX_SIZE_MB }))
  }
}
