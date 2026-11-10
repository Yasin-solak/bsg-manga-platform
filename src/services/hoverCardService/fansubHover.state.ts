import {
  isUuid,
  normalizeKey,
  writeCache,
} from './shared'
import type {
  CacheEntry,
  FansubHoverFetchInput,
  FansubHoverResolveResult,
  ResolvedFansubHoverData,
} from './types'

export const fansubCache = new Map<string, CacheEntry<ResolvedFansubHoverData>>()
export const fansubInFlight = new Map<string, Promise<FansubHoverResolveResult>>()

export function normalizeFansubHoverInput(input: FansubHoverFetchInput) {
  const rawFansubId = (input.fansubId || '').trim()
  const normalizedFansubId = isUuid(rawFansubId) ? rawFansubId : ''
  const normalizedSlug = normalizeKey(input.slug)
  const fallbackSlug = !normalizedFansubId ? normalizeKey(rawFansubId) : ''
  return {
    fansubId: normalizedFansubId,
    slug: normalizedSlug || fallbackSlug,
  }
}

export function buildFansubCacheKey(input: FansubHoverFetchInput) {
  const normalizedInput = normalizeFansubHoverInput(input)
  const byId = normalizeKey(normalizedInput.fansubId)
  if (byId) return `id:${byId}`

  const bySlug = normalizeKey(normalizedInput.slug)
  if (bySlug) return `slug:${bySlug}`

  return ''
}

export function writeFansubHoverCacheEntries(cacheKey: string, data: ResolvedFansubHoverData | null) {
  writeCache(fansubCache, cacheKey, data)
  if (!data) return
  writeCache(fansubCache, `id:${normalizeKey(data.id)}`, data)
  if (data.slug) writeCache(fansubCache, `slug:${normalizeKey(data.slug)}`, data)
}
