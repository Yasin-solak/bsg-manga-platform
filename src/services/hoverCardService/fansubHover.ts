import {
  getFansubHoverMetricsSnapshot,
  markFansubHoverCacheHit,
  markFansubHoverInflightJoin,
  markFansubHoverMiss,
  recordFansubHoverOpenDuration,
} from './fansubHover.metrics'
import { runFansubHoverNetworkResolve } from './fansubHover.resolve'
import {
  buildFansubCacheKey,
  fansubCache,
  fansubInFlight,
} from './fansubHover.state'
import {
  nowMs,
  readCacheEntry,
  toDurationMs,
} from './shared'
import type {
  FansubHoverFetchInput,
  FansubHoverResolveOptions,
  FansubHoverResolveResult,
  ResolvedFansubHoverData,
} from './types'

export {
  getFansubHoverMetricsSnapshot,
  recordFansubHoverOpenDuration,
}

export async function resolveFansubHoverDataWithMeta(
  input: FansubHoverFetchInput,
  options: FansubHoverResolveOptions = {},
): Promise<FansubHoverResolveResult> {
  const cacheKey = buildFansubCacheKey(input)
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
  const signal = options.signal

  if (!forceRefresh) {
    const cacheEntry = readCacheEntry(fansubCache, cacheKey)
    if (cacheEntry && cacheEntry.expiresAt > Date.now()) {
      markFansubHoverCacheHit()
      return {
        data: cacheEntry.value,
        meta: {
          source: 'cache-hit',
          durationMs: toDurationMs(startedAt),
        },
      }
    }
  }

  const sharedRequest = fansubInFlight.get(cacheKey)
  if (sharedRequest) {
    markFansubHoverInflightJoin()
    const result = await sharedRequest
    return {
      data: result.data,
      meta: {
        source: 'inflight',
        durationMs: toDurationMs(startedAt),
      },
    }
  }

  markFansubHoverMiss()
  if (signal) {
    return runFansubHoverNetworkResolve(input, cacheKey, signal)
  }

  const request = runFansubHoverNetworkResolve(input, cacheKey)
  fansubInFlight.set(
    cacheKey,
    request.finally(() => {
      fansubInFlight.delete(cacheKey)
    }),
  )
  return request
}

export async function resolveFansubHoverData(
  input: FansubHoverFetchInput,
  options: FansubHoverResolveOptions = {},
): Promise<ResolvedFansubHoverData | null> {
  const result = await resolveFansubHoverDataWithMeta(input, options)
  return result.data
}
