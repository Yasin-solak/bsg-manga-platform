/*
 * The game day is the Europe/Istanbul calendar day (same as daily_game_today on the server). Turkey has been
 * fixed at UTC+3 since 2016; the time to the new puzzle is calculated accordingly.
 */
const ISTANBUL_OFFSET_MS = 3 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

export function msUntilNextGameDay(now: number = Date.now()): number {
  const local = now + ISTANBUL_OFFSET_MS
  const nextMidnightLocal = Math.floor(local / DAY_MS) * DAY_MS + DAY_MS
  return nextMidnightLocal - local
}

export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return [h, m, s].map((part) => String(part).padStart(2, '0')).join(':')
}

/** Run score: distance builds from speed (px/s) and elapsed time; the server cap is 12 points/s. */
export const RUNNER_POINTS_PER_PX = 1 / 80
export const RUNNER_MAX_SPEED = 780

export const RUNNER_TIERS = [
  { score: 1500, coin: 8 },
  { score: 800, coin: 6 },
  { score: 400, coin: 4 },
  { score: 150, coin: 2 },
] as const

export const MATCH_TIERS = [
  { seconds: 35, coin: 8 },
  { seconds: 50, coin: 6 },
  { seconds: 80, coin: 4 },
] as const

export type RunnerTier = { score: number, coin: number }
export type MatchTier = { seconds: number, coin: number }

/** Tiers can change from the admin panel; the server's list is used when present. */
export function runnerTierCoin(score: number, tiers: ReadonlyArray<RunnerTier> = RUNNER_TIERS): number {
  return [...tiers].sort((a, b) => b.score - a.score).find((tier) => score >= tier.score)?.coin ?? 0
}

export function matchTierCoin(seconds: number, tiers: ReadonlyArray<MatchTier> = MATCH_TIERS, finishCoin = 2): number {
  return [...tiers].sort((a, b) => a.seconds - b.seconds).find((tier) => seconds <= tier.seconds)?.coin ?? finishCoin
}

export function maxTierCoin(tiers: ReadonlyArray<{ coin: number }>, floor = 0): number {
  return tiers.reduce((max, tier) => Math.max(max, tier.coin), floor)
}
