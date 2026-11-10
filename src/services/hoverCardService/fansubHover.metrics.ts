import type {
  FansubHoverMetricsAccumulator,
  FansubHoverMetricsSnapshot,
} from './types'

const fansubHoverMetrics: FansubHoverMetricsAccumulator = {
  cacheHitCount: 0,
  missCount: 0,
  inflightJoinCount: 0,
  networkRequestCount: 0,
  networkErrorCount: 0,
  networkTotalDurationMs: 0,
  openCount: 0,
  openTotalDurationMs: 0,
}

export function markFansubHoverCacheHit() {
  fansubHoverMetrics.cacheHitCount += 1
}

export function markFansubHoverMiss() {
  fansubHoverMetrics.missCount += 1
}

export function markFansubHoverInflightJoin() {
  fansubHoverMetrics.inflightJoinCount += 1
}

export function markFansubHoverNetworkRequest() {
  fansubHoverMetrics.networkRequestCount += 1
}

export function markFansubHoverNetworkError() {
  fansubHoverMetrics.networkErrorCount += 1
}

export function addFansubHoverNetworkDuration(durationMs: number) {
  fansubHoverMetrics.networkTotalDurationMs += durationMs
}

export function recordFansubHoverOpenDuration(durationMs: number) {
  const safeDuration = Number.isFinite(durationMs) ? Math.max(0, durationMs) : 0
  fansubHoverMetrics.openCount += 1
  fansubHoverMetrics.openTotalDurationMs += safeDuration
}

export function getFansubHoverMetricsSnapshot(): FansubHoverMetricsSnapshot {
  const averageNetworkDurationMs =
    fansubHoverMetrics.networkRequestCount > 0
      ? fansubHoverMetrics.networkTotalDurationMs / fansubHoverMetrics.networkRequestCount
      : 0
  const averageOpenDurationMs =
    fansubHoverMetrics.openCount > 0
      ? fansubHoverMetrics.openTotalDurationMs / fansubHoverMetrics.openCount
      : 0

  return {
    cacheHitCount: fansubHoverMetrics.cacheHitCount,
    missCount: fansubHoverMetrics.missCount,
    inflightJoinCount: fansubHoverMetrics.inflightJoinCount,
    networkRequestCount: fansubHoverMetrics.networkRequestCount,
    networkErrorCount: fansubHoverMetrics.networkErrorCount,
    networkTotalDurationMs: fansubHoverMetrics.networkTotalDurationMs,
    averageNetworkDurationMs,
    openCount: fansubHoverMetrics.openCount,
    openTotalDurationMs: fansubHoverMetrics.openTotalDurationMs,
    averageOpenDurationMs,
  }
}
