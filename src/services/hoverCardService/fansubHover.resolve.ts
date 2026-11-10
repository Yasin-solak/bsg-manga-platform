import { createScopedLogger } from '../logger'
import { createRequestContext, toRequestContextLogContext } from '../requestContext'
import {
  isAbortError,
  nowMs,
  toDurationMs,
} from './shared'
import {
  addFansubHoverNetworkDuration,
  markFansubHoverNetworkError,
  markFansubHoverNetworkRequest,
} from './fansubHover.metrics'
import { fetchResolvedFansubHoverData } from './fansubHover.resolve.data'
import { writeFansubHoverCacheEntries } from './fansubHover.state'
import type {
  FansubHoverFetchInput,
  FansubHoverResolveResult,
} from './types'

const fansubHoverLogger = createScopedLogger('hoverCardService.fansubHoverResolve')

export async function runFansubHoverNetworkResolve(
  input: FansubHoverFetchInput,
  cacheKey: string,
  signal?: AbortSignal,
): Promise<FansubHoverResolveResult> {
  const requestContext = createRequestContext('hoverCardService.fansubHoverResolve', 'resolve-fansub-hover-network', {
    cacheKey,
    fansubId: input.fansubId || null,
    slug: input.slug || null,
  })
  const startedAt = nowMs()
  let durationMs = 0
  markFansubHoverNetworkRequest()
  try {
    const data = await fetchResolvedFansubHoverData(input, signal)
    durationMs = toDurationMs(startedAt)
    writeFansubHoverCacheEntries(cacheKey, data)
    return {
      data,
      meta: {
        source: 'network',
        durationMs,
      },
    }
  } catch (error) {
    durationMs = toDurationMs(startedAt)
    if (!isAbortError(error)) {
      markFansubHoverNetworkError()
      fansubHoverLogger.error({
        event: requestContext.event,
        message: 'fansub hover verisi ag uzerinden cozulemedi.',
        context: toRequestContextLogContext(requestContext, { durationMs }),
        error,
      })
    }
    throw error
  } finally {
    addFansubHoverNetworkDuration(durationMs || toDurationMs(startedAt))
  }
}
