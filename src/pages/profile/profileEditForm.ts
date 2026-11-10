import { normalizeBioText } from '@/components/common/userHoverCardShared'
import {
  USER_DISPLAY_NAME_MAX_LENGTH,
  normalizeUserDisplayName,
  truncateUserDisplayName,
  validateUserDisplayName,
} from '@/lib/userDisplayName'
import type { MockUser, ProfileEditDraft, ProfileOwnedBadge, SocialLink } from './types'
import { txa } from '@/i18n/activeLocale'

export const PROFILE_EDIT_BIO_MAX_LENGTH = 280
export const PROFILE_EDIT_DISPLAY_NAME_MAX_LENGTH = USER_DISPLAY_NAME_MAX_LENGTH
export const PROFILE_EDIT_AVATAR_MAX_SIZE_MB = 2
export const PROFILE_EDIT_BACKGROUND_MAX_SIZE_MB = 8
export const PROFILE_EDIT_BACKGROUND_ACCEPT = 'image/jpeg,image/png,image/webp,video/webm,video/mp4'
const PROFILE_EDIT_SOCIAL_HANDLE_MAX_LENGTH = 48

function trimLeadingHandleToken(value: string) {
  return value.replace(/^@+/, '').trim()
}

function extractHandleFromUrl(value: string) {
  const normalizedValue = value.trim()
  if (!normalizedValue) return ''

  // Extract the last segment only from input resembling a real URL; do not touch a plain
  // username (no slash/protocol), or it would be deleted on blur.
  const looksLikeUrl = /^https?:\/\//i.test(normalizedValue) || normalizedValue.includes('/')
  if (!looksLikeUrl) return normalizedValue

  try {
    const withProtocol = /^https?:\/\//i.test(normalizedValue)
      ? normalizedValue
      : `https://${normalizedValue}`
    const parsed = new URL(withProtocol)
    const segments = parsed.pathname.split('/').map((segment) => segment.trim()).filter(Boolean)
    return segments.length > 0 ? segments[segments.length - 1] : normalizedValue
  } catch {
    return normalizedValue
  }
}

export function normalizeProfileSocialHandle(value: string) {
  const extracted = extractHandleFromUrl(value)
  return trimLeadingHandleToken(extracted)
    .replace(/^@+/, '')
    .replace(/[?#].*$/, '')
    .replace(/\s+/g, '')
    .slice(0, PROFILE_EDIT_SOCIAL_HANDLE_MAX_LENGTH)
}

export function buildProfileSocialLinksFromDraft(draft: ProfileEditDraft): SocialLink[] {
  const links: SocialLink[] = []
  const discord = normalizeProfileSocialHandle(draft.discord)
  const instagram = normalizeProfileSocialHandle(draft.instagram)
  const x = normalizeProfileSocialHandle(draft.x)

  if (discord) links.push({ platform: txa('Discord'), username: discord })
  if (instagram) links.push({ platform: txa('Instagram'), username: instagram })
  if (x) links.push({ platform: 'X', username: x })

  return links
}

export function sanitizeProfileEditBio(value: string) {
  return normalizeBioText(value).slice(0, PROFILE_EDIT_BIO_MAX_LENGTH)
}

export function sanitizeProfileEditDisplayName(value: string) {
  return normalizeUserDisplayName(truncateUserDisplayName(value))
}

export function getProfileEditDisplayNameError(value: string) {
  return validateUserDisplayName(value)
}

export function buildProfileEditPreviewUser(
  user: MockUser,
  draft: ProfileEditDraft,
  activeFansubIdentityTag: MockUser['activeFansubIdentityTag'] = user.activeFansubIdentityTag ?? null,
): MockUser {
  return {
    ...user,
    displayName: sanitizeProfileEditDisplayName(draft.displayName) || user.displayName || user.username,
    avatar: draft.avatar || user.avatar,
    bio: sanitizeProfileEditBio(draft.bio),
    socialLinks: buildProfileSocialLinksFromDraft(draft),
    activeFansubIdentityTag,
  }
}

export function buildPreviewDisplayedBadges(
  ownedBadges: ProfileOwnedBadge[],
  selectedBadgeIds: string[],
): ProfileOwnedBadge[] {
  const selectionOrder = new Map(selectedBadgeIds.map((badgeId, index) => [badgeId, index]))

  return ownedBadges.map((badge) => {
    const nextDisplayOrder = selectionOrder.get(badge.badge_id)
    return {
      ...badge,
      is_displayed: nextDisplayOrder !== undefined,
      display_order: nextDisplayOrder ?? badge.display_order,
    }
  })
}

export function validateProfileAvatarFile(file: File) {
  if (!file.type.startsWith('image/')) {
    throw new Error(txa('Lutfen JPG, PNG, WEBP veya GIF formatinda bir gorsel secin.'))
  }

  const maxBytes = PROFILE_EDIT_AVATAR_MAX_SIZE_MB * 1024 * 1024
  if (file.size > maxBytes) {
    throw new Error(txa('Avatar dosyası {v1}MB limitini aşamaz.', { v1: PROFILE_EDIT_AVATAR_MAX_SIZE_MB }))
  }
}

export function buildProfileBackgroundLabel(fileName: string) {
  const normalized = fileName
    .replace(/\.[^.]+$/u, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return normalized || txa('Kişisel arka plan')
}

export function validateProfileBackgroundFile(file: File) {
  const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'video/webm', 'video/mp4'])
  if (!allowedMimeTypes.has(file.type)) {
    throw new Error(txa('Lütfen JPG, PNG, WEBP, WEBM veya MP4 formatında bir arka plan seçin.'))
  }

  const maxBytes = PROFILE_EDIT_BACKGROUND_MAX_SIZE_MB * 1024 * 1024
  if (file.size > maxBytes) {
    throw new Error(txa('Arka plan dosyası {v1}MB limitini aşamaz.', { v1: PROFILE_EDIT_BACKGROUND_MAX_SIZE_MB }))
  }
}
