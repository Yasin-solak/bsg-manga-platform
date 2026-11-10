import { TOP_READ_LIMIT } from './shared.db'
import type { OwnedItemsPayload } from './shared.db'

export function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export function toAvatarUrl(username: string, avatarUrl?: string | null) {
  const normalizedUsername = username.trim() || 'user'
  return avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(normalizedUsername)}`
}

export function getRelationOne<T>(value: T | T[] | null | undefined): T | undefined {
  if (!value) return undefined
  return Array.isArray(value) ? value[0] : value
}

function parseStringArray(value: unknown) {
  if (!Array.isArray(value)) return []
  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter(Boolean)
}

function toSocialHandle(value: string) {
  return value.trim().replace(/^@+/, '')
}

function toSocialUrlFromPlatform(platform: string, username: string) {
  const normalizedPlatform = platform.trim().toLowerCase()
  const handle = toSocialHandle(username)
  if (!handle) return ''

  if (normalizedPlatform === 'x' || normalizedPlatform === 'twitter') return `https://x.com/${handle}`
  if (normalizedPlatform === 'instagram') return `https://instagram.com/${handle}`
  if (normalizedPlatform === 'github') return `https://github.com/${handle}`
  if (normalizedPlatform === 'youtube') return `https://youtube.com/@${handle}`
  if (normalizedPlatform === 'tiktok') return `https://www.tiktok.com/@${handle}`
  if (normalizedPlatform === 'twitch') return `https://www.twitch.tv/${handle}`
  if (normalizedPlatform === 'facebook') return `https://www.facebook.com/${handle}`
  if (normalizedPlatform === 'reddit') return `https://www.reddit.com/user/${handle}`

  return ''
}

export function parseSocialLinks(value: unknown) {
  if (!Array.isArray(value)) return []
  const links: string[] = []
  value.forEach((entry) => {
    if (typeof entry === 'string') {
      const normalized = entry.trim()
      if (normalized) links.push(normalized)
      return
    }
    if (typeof entry === 'object' && entry !== null && 'url' in entry) {
      const maybeUrl = (entry as { url?: unknown }).url
      if (typeof maybeUrl === 'string' && maybeUrl.trim()) {
        links.push(maybeUrl.trim())
      }
      return
    }
    if (typeof entry === 'object' && entry !== null && 'platform' in entry && 'username' in entry) {
      const maybePlatform = (entry as { platform?: unknown }).platform
      const maybeUsername = (entry as { username?: unknown }).username
      if (typeof maybePlatform === 'string' && typeof maybeUsername === 'string') {
        const socialUrl = toSocialUrlFromPlatform(maybePlatform, maybeUsername)
        if (socialUrl) {
          links.push(socialUrl)
          return
        }

        const normalizedPlatform = maybePlatform.trim()
        const normalizedUsername = maybeUsername.trim()
        if (normalizedPlatform && normalizedUsername) {
          links.push(`${normalizedPlatform}: ${normalizedUsername}`)
        }
      }
    }
  })
  return Array.from(new Set(links))
}

export function parseOwnedItems(value: unknown): OwnedItemsPayload {
  const payload = typeof value === 'object' && value !== null
    ? (value as {
      frames?: unknown
      backgrounds?: unknown
      patterns?: unknown
      badges?: unknown
      premium?: unknown
    })
    : {}

  return {
    frames: parseStringArray(payload.frames),
    backgrounds: parseStringArray(payload.backgrounds),
    patterns: parseStringArray(payload.patterns),
    badges: parseStringArray(payload.badges),
    premium: parseStringArray(payload.premium),
  }
}

export function toSafeNumber(value: number | null | undefined, fallback = 0) {
  return Number.isFinite(value) ? Number(value) : fallback
}

export function isMissingSchemaError(error: unknown) {
  if (!error || typeof error !== 'object') return false
  const maybeError = error as { code?: string; message?: string }
  const message = String(maybeError.message || '')
  return maybeError.code === '42P01' || maybeError.code === '42703' || message.includes('does not exist')
}

export function isRpcMissingFunctionError(error: unknown) {
  if (!error || typeof error !== 'object') return false
  const maybe = error as { code?: string; message?: string; details?: string }
  const message = `${maybe.message || ''} ${maybe.details || ''}`.toLowerCase()
  return (
    maybe.code === '42883'
    || maybe.code === 'PGRST202'
    || message.includes('could not find the function')
    || message.includes('does not exist')
  )
}

export { TOP_READ_LIMIT }
