import {
  isUuid,
  normalizeKey,
  writeCache,
} from './shared'
import type {
  CacheEntry,
  ResolvedUserHoverData,
  UserHoverFetchInput,
  UserHoverResolveResult,
} from './types'

export const userCache = new Map<string, CacheEntry<ResolvedUserHoverData>>()
export const userInFlight = new Map<string, Promise<UserHoverResolveResult>>()

export function normalizeUserHoverInput(input: UserHoverFetchInput) {
  const rawUserId = (input.userId || '').trim()
  const normalizedUserId = isUuid(rawUserId) ? rawUserId : ''
  const normalizedUsername = normalizeKey(input.username)
  const fallbackUsername = !normalizedUserId ? normalizeKey(rawUserId) : ''
  return {
    userId: normalizedUserId,
    username: normalizedUsername || fallbackUsername,
  }
}

export function buildUserCacheKey(input: UserHoverFetchInput) {
  const normalizedInput = normalizeUserHoverInput(input)
  const byId = normalizeKey(normalizedInput.userId)
  if (byId) return `id:${byId}`

  const byUsername = normalizeKey(normalizedInput.username)
  if (byUsername) return `username:${byUsername}`

  return ''
}

export function writeUserHoverCacheEntries(cacheKey: string, data: ResolvedUserHoverData | null) {
  writeCache(userCache, cacheKey, data)
  if (!data) return
  writeCache(userCache, `id:${normalizeKey(data.id)}`, data)
  writeCache(userCache, `username:${normalizeKey(data.username)}`, data)
}
