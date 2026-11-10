import type { FollowActivityFeedResult } from './types'
import { cloneFollowFeedResult } from './shared'

const FOLLOW_FEED_CACHE_TTL_MS = 45_000

type FollowFeedCacheEntry = {
  value: FollowActivityFeedResult
  expiresAt: number
}

const followFeedCache = new Map<string, FollowFeedCacheEntry>()
const followFeedInFlight = new Map<string, Promise<FollowActivityFeedResult>>()

export function getFollowFeedInFlight(cacheKey: string) {
  return followFeedInFlight.get(cacheKey)
}

export function setFollowFeedInFlight(cacheKey: string, request: Promise<FollowActivityFeedResult>) {
  followFeedInFlight.set(cacheKey, request)
}

export function clearFollowFeedInFlight(cacheKey: string) {
  followFeedInFlight.delete(cacheKey)
}

export function readCachedFollowFeed(cacheKey: string): FollowActivityFeedResult | null {
  const cached = followFeedCache.get(cacheKey)
  if (!cached) return null

  if (cached.expiresAt <= Date.now()) {
    followFeedCache.delete(cacheKey)
    return null
  }

  return cloneFollowFeedResult(cached.value)
}

export function writeCachedFollowFeed(cacheKey: string, result: FollowActivityFeedResult) {
  followFeedCache.set(cacheKey, {
    value: cloneFollowFeedResult(result),
    expiresAt: Date.now() + FOLLOW_FEED_CACHE_TTL_MS,
  })
}

export function invalidateFollowFeedCache(viewerId?: string) {
  if (!viewerId) {
    followFeedCache.clear()
    followFeedInFlight.clear()
    return
  }

  const normalizedViewerId = viewerId.trim()
  if (!normalizedViewerId) return

  for (const key of followFeedCache.keys()) {
    if (key.startsWith(normalizedViewerId + ':')) {
      followFeedCache.delete(key)
    }
  }

  for (const key of followFeedInFlight.keys()) {
    if (key.startsWith(normalizedViewerId + ':')) {
      followFeedInFlight.delete(key)
    }
  }
}
