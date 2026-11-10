import type {
  UserHoverMetricsAccumulator,
  UserHoverMetricsSnapshot,
} from './types'

const userHoverMetrics: UserHoverMetricsAccumulator = {
  cacheHitCount: 0,
  staleHitCount: 0,
  missCount: 0,
  inflightJoinCount: 0,
  networkRequestCount: 0,
  networkErrorCount: 0,
  networkTotalDurationMs: 0,
  openCount: 0,
  openTotalDurationMs: 0,
}

export function markUserHoverCacheHit() {
  userHoverMetrics.cacheHitCount += 1
}

export function markUserHoverStaleHit() {
  userHoverMetrics.staleHitCount += 1
}

export function markUserHoverMiss() {
  userHoverMetrics.missCount += 1
}

export function markUserHoverInflightJoin() {
  userHoverMetrics.inflightJoinCount += 1
}

export function markUserHoverNetworkRequest() {
  userHoverMetrics.networkRequestCount += 1
}

export function markUserHoverNetworkError() {
  userHoverMetrics.networkErrorCount += 1
}

export function addUserHoverNetworkDuration(durationMs: number) {
  userHoverMetrics.networkTotalDurationMs += durationMs
}

export function recordUserHoverOpenDuration(durationMs: number) {
  const safeDuration = Number.isFinite(durationMs) ? Math.max(0, durationMs) : 0
  userHoverMetrics.openCount += 1
  userHoverMetrics.openTotalDurationMs += safeDuration
}

export function getUserHoverMetricsSnapshot(): UserHoverMetricsSnapshot {
  const averageNetworkDurationMs =
    userHoverMetrics.networkRequestCount > 0
      ? userHoverMetrics.networkTotalDurationMs / userHoverMetrics.networkRequestCount
      : 0
  const averageOpenDurationMs =
    userHoverMetrics.openCount > 0
      ? userHoverMetrics.openTotalDurationMs / userHoverMetrics.openCount
      : 0

  return {
    cacheHitCount: userHoverMetrics.cacheHitCount,
    staleHitCount: userHoverMetrics.staleHitCount,
    missCount: userHoverMetrics.missCount,
    inflightJoinCount: userHoverMetrics.inflightJoinCount,
    networkRequestCount: userHoverMetrics.networkRequestCount,
    networkErrorCount: userHoverMetrics.networkErrorCount,
    networkTotalDurationMs: userHoverMetrics.networkTotalDurationMs,
    averageNetworkDurationMs,
    openCount: userHoverMetrics.openCount,
    openTotalDurationMs: userHoverMetrics.openTotalDurationMs,
    averageOpenDurationMs,
  }
}
