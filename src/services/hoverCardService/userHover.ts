import {
  getUserHoverMetricsSnapshot,
  markUserHoverCacheHit,
  markUserHoverInflightJoin,
  markUserHoverMiss,
  markUserHoverStaleHit,
  recordUserHoverOpenDuration,
} from './userHover.metrics'
import { runUserHoverNetworkResolve } from './userHover.resolve'
import {
  buildUserCacheKey,
  normalizeUserHoverInput,
  userCache,
  userInFlight,
} from './userHover.state'
import {
  nowMs,
  readCacheEntry,
  toDurationMs,
} from './shared'
import type {
  ResolvedUserHoverData,
  UserHoverFetchInput,
  UserHoverResolveOptions,
  UserHoverResolveResult,
} from './types'
export {
  getUserHoverMetricsSnapshot,
  recordUserHoverOpenDuration,
}

export async function resolveUserHoverDataWithMeta(
  input: UserHoverFetchInput,
  options: UserHoverResolveOptions = {},
): Promise<UserHoverResolveResult> {
  const normalizedInput = normalizeUserHoverInput(input)
  const cacheKey = buildUserCacheKey(normalizedInput)
  if (!cacheKey) {
    return {
      data: null,
      meta: {
        source: 'network',
        durationMs: 0,
      },
    }
  }

  const startedAt = nowMs()
  const forceRefresh = options.forceRefresh === true
  const allowStale = options.allowStale !== false
  const revalidateStale = options.revalidateStale !== false
  const signal = options.signal

  if (!forceRefresh) {
    const cacheEntry = readCacheEntry(userCache, cacheKey)
    if (cacheEntry && cacheEntry.expiresAt > Date.now()) {
      markUserHoverCacheHit()
      return {
        data: cacheEntry.value,
        meta: {
          source: 'cache-hit',
          durationMs: toDurationMs(startedAt),
        },
      }
    }

    if (allowStale && cacheEntry) {
      markUserHoverStaleHit()
      if (revalidateStale && !userInFlight.has(cacheKey)) {
        markUserHoverMiss()
        const refreshRequest = runUserHoverNetworkResolve(normalizedInput, cacheKey)
        void refreshRequest.catch(() => undefined)
        userInFlight.set(
          cacheKey,
          refreshRequest.finally(() => {
            userInFlight.delete(cacheKey)
          }),
        )
      }
      return {
        data: cacheEntry.value,
        meta: {
          source: 'cache-stale',
          durationMs: toDurationMs(startedAt),
        },
      }
    }
  }

  const sharedRequest = userInFlight.get(cacheKey)
  if (sharedRequest) {
    markUserHoverInflightJoin()
    const result = await sharedRequest
    return {
      data: result.data,
      meta: {
        source: 'inflight',
        durationMs: toDurationMs(startedAt),
      },
    }
  }

  markUserHoverMiss()
  if (signal) {
    return runUserHoverNetworkResolve(normalizedInput, cacheKey, signal)
  }

  const request = runUserHoverNetworkResolve(normalizedInput, cacheKey)
  userInFlight.set(
    cacheKey,
    request.finally(() => {
      userInFlight.delete(cacheKey)
    }),
  )
  return request
}

export async function resolveUserHoverData(
  input: UserHoverFetchInput,
  options: UserHoverResolveOptions = {},
): Promise<ResolvedUserHoverData | null> {
  const result = await resolveUserHoverDataWithMeta(input, options)
  return result.data
}
