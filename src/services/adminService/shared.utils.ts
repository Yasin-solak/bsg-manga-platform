import { DEFAULT_SETTINGS, DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT } from './shared.constants'

export function normalizeDiscordInviteUrl(input: string | undefined) {
  const value = (input || '').trim()
  if (!value) return DEFAULT_SETTINGS.discordInviteUrl

  try {
    const url = new URL(value)
    if (url.protocol === 'http:' || url.protocol === 'https:') return value
  } catch {
    // invalid URL
  }

  return DEFAULT_SETTINGS.discordInviteUrl
}

export function sanitizeSearchTerm(input: string | undefined) {
  return (input || '')
    .trim()
    .replace(/[\\%_,()]/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, 80)
}

export function normalizePageAndLimit(page?: number, limit?: number) {
  const safePage = Number.isFinite(page) && (page || 0) > 0 ? Number(page) : 1
  const safeLimit = Number.isFinite(limit)
    ? Math.min(Math.max(Number(limit), 1), MAX_LIST_LIMIT)
    : DEFAULT_LIST_LIMIT
  return { page: safePage, limit: safeLimit }
}

export function getSingleRelation<T>(value: T | T[] | null | undefined): T | undefined {
  if (!value) return undefined
  return Array.isArray(value) ? value[0] : value
}

export function ensureMigrationError(error: any): never {
  if (error?.code === '42883' || String(error?.message || '').includes('does not exist')) {
    throw new Error('Bu ozellik icin 20260208235905_admin_fansub_management_scaling.sql migration dosyasini calistirin.')
  }
  throw error
}
