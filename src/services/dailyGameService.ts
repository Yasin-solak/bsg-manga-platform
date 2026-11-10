import { withAbortSignal, withServiceTimeout } from './apiResilience'
import { getCurrentAccessToken } from './authService/shared'
import { supabase } from './supabase'
import { z } from 'zod'
import { txa } from '@/i18n/activeLocale'

/*
 * Game Corner. Guessing games (cover, panel): the answer and image source never reach the client; guess
 * checks and coins are on the server (submit_daily_game_guess), the image comes blurred by stage from the
 * /api/game/daily-image proxy; snapshot.answer fills when the game ends.
 * Attempt games (run, match): 3 attempts a day; the server clips scores by time / measures time itself,
 * and gives rewards incrementally under a shared daily cap.
 */

export type DailyGameKind = 'cover' | 'panel'
export type DailyRunKind = 'runner' | 'match'

export interface DailyGameGuess {
  mangaId: string
  title: string | null
  correct: boolean
}

export interface DailyGameSnapshot {
  kind: DailyGameKind
  date: string
  available: boolean
  maxGuesses: number
  guesses: DailyGameGuess[]
  stage: number
  solved: boolean
  finished: boolean
  coinAwarded: number
  dailyCoinEarned: number
  dailyCoinCap: number
  answer: { id: string, title: string, slug: string | null, coverImage: string | null } | null
  lastGuessCorrect?: boolean
  /** True if an admin closed the game (shown to the user as "Closed right now"). */
  disabled?: boolean
  /** Kacinci tahminde kac coin (admin ayarindan). */
  rewards?: number[]
}

const GAME_ERROR_MESSAGES: Record<string, string> = {
  get AUTH_REQUIRED() { return txa('Oynamak için giriş yapmalısın.') },
  get GAME_FINISHED() { return txa('Bugünün bulmacası bitti; yarın yenisi gelir.') },
  get GAME_GUESS_DUPLICATE() { return txa('Bu seriyi zaten denedin.') },
  get GAME_GUESS_INVALID() { return txa('Bu seri tahmin olarak seçilemez.') },
  get GAME_UNAVAILABLE() { return txa('Bugünün bulmacası hazır değil.') },
  get GAME_ATTEMPTS_EXHAUSTED() { return txa('Bugünkü deneme hakların bitti; yarın yine gel.') },
  get GAME_RUN_IMPLAUSIBLE() { return txa('Bu deneme geçersiz sayıldı.') },
  get GAME_RUN_INVALID() { return txa('Deneme bulunamadı.') },
  get GAME_DISABLED() { return txa('Bu oyun şu an kapalı.') },
}

export function toDailyGameErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : typeof error === 'object' && error && 'message' in error ? String((error as { message: unknown }).message) : ''
  const code = Object.keys(GAME_ERROR_MESSAGES).find((key) => message.includes(key))
  return code ? GAME_ERROR_MESSAGES[code] : txa('Şu anda oyuna ulaşılamıyor. Biraz sonra tekrar dene.')
}

const finiteNumber = (fallback: number) => z.number().finite().catch(fallback)

const dailyGameSnapshotSchema = z.object({
  kind: z.enum(['cover', 'panel']),
  date: z.string().min(1),
  available: z.boolean().catch(false),
  maxGuesses: finiteNumber(6).default(6),
  guesses: z.array(z.object({
    mangaId: z.string(),
    title: z.string().nullable().catch(null),
    correct: z.boolean().catch(false),
  })).catch([]).default([]),
  stage: finiteNumber(0).default(0),
  solved: z.boolean().catch(false).default(false),
  finished: z.boolean().catch(false).default(false),
  coinAwarded: finiteNumber(0).default(0),
  dailyCoinEarned: finiteNumber(0).default(0),
  dailyCoinCap: finiteNumber(30).default(30),
  answer: z.object({
    id: z.string(),
    title: z.string(),
    slug: z.string().nullable().catch(null),
    coverImage: z.string().nullable().catch(null),
  }).nullable().catch(null).default(null),
  lastGuessCorrect: z.boolean().optional(),
  disabled: z.boolean().optional(),
  rewards: z.array(z.number().int()).optional().catch(undefined),
})

export function parseDailyGameSnapshot(value: unknown): DailyGameSnapshot | null {
  const result = dailyGameSnapshotSchema.safeParse(value)
  return result.success ? result.data : null
}

async function callGameRpc(name: string, args: Record<string, unknown>, label: string) {
  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(supabase.rpc(name, args), signal),
    { label },
  )
  if (error) throw error
  const snapshot = parseDailyGameSnapshot(data)
  if (!snapshot) throw new Error('GAME_UNAVAILABLE')
  return snapshot
}

export function getDailyGame(kind: DailyGameKind) {
  return callGameRpc('get_daily_game', { p_kind: kind }, 'dailyGameService.getDailyGame')
}

export function submitDailyGameGuess(kind: DailyGameKind, mangaId: string) {
  return callGameRpc('submit_daily_game_guess', { p_kind: kind, p_manga_id: mangaId }, 'dailyGameService.submitDailyGameGuess')
}

/** Image blurred by stage; requested with the session key, returns a blob URL (the caller revokes it). */
export async function fetchDailyGameImage(kind: DailyGameKind, signal?: AbortSignal): Promise<string> {
  let token: string | null = null
  try {
    token = await getCurrentAccessToken()
  } catch {
    token = null
  }
  const response = await fetch(`/api/game/daily-image?kind=${kind}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    cache: 'no-store',
    signal,
  })
  if (!response.ok) throw new Error(`GAME_IMAGE_${response.status}`)
  return URL.createObjectURL(await response.blob())
}

export interface DailyRunCard { id: string, title: string, coverImage: string | null }

export interface DailyRunStatus {
  kind: DailyRunKind
  date: string
  maxAttempts: number
  attemptsUsed: number
  attemptsLeft: number
  bestScore: number | null
  coinFromKind: number
  dailyCoinEarned: number
  dailyCoinCap: number
  runId?: string
  board?: DailyRunCard[]
  score?: number
  coinAwarded?: number
  enabled?: boolean
  tiers?: Array<{ score?: number, seconds?: number, coin: number }>
  finishCoin?: number
}

const dailyRunStatusSchema = z.object({
  kind: z.enum(['runner', 'match']),
  date: z.string().min(1),
  maxAttempts: finiteNumber(3).default(3),
  attemptsUsed: finiteNumber(0).default(0),
  attemptsLeft: finiteNumber(0).default(0),
  bestScore: z.number().finite().nullable().catch(null).default(null),
  coinFromKind: finiteNumber(0).default(0),
  dailyCoinEarned: finiteNumber(0).default(0),
  dailyCoinCap: finiteNumber(30).default(30),
  runId: z.string().optional(),
  board: z.array(z.object({
    id: z.string(),
    title: z.string(),
    coverImage: z.string().nullable().catch(null),
  })).optional(),
  score: z.number().finite().optional(),
  coinAwarded: z.number().finite().optional(),
  enabled: z.boolean().optional(),
  tiers: z.array(z.object({
    score: z.number().int().optional(),
    seconds: z.number().int().optional(),
    coin: z.number().int(),
  })).optional().catch(undefined),
  finishCoin: z.number().int().optional(),
})

/** The server's run tiers (default if absent). */
export function runnerTiersOf(status: DailyRunStatus | null): Array<{ score: number, coin: number }> | undefined {
  const tiers = status?.tiers?.filter((tier): tier is { score: number, coin: number } => typeof tier.score === 'number')
  return tiers && tiers.length > 0 ? tiers : undefined
}

/** The server's match tiers (default if absent). */
export function matchTiersOf(status: DailyRunStatus | null): Array<{ seconds: number, coin: number }> | undefined {
  const tiers = status?.tiers?.filter((tier): tier is { seconds: number, coin: number } => typeof tier.seconds === 'number')
  return tiers && tiers.length > 0 ? tiers : undefined
}

export function parseDailyRunStatus(value: unknown): DailyRunStatus | null {
  const result = dailyRunStatusSchema.safeParse(value)
  return result.success ? result.data : null
}

async function callRunRpc(name: string, args: Record<string, unknown>, label: string) {
  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(supabase.rpc(name, args), signal),
    { label },
  )
  if (error) throw error
  const status = parseDailyRunStatus(data)
  if (!status) throw new Error('GAME_UNAVAILABLE')
  return status
}

export function getDailyRunStatus(kind: DailyRunKind) {
  return callRunRpc('get_daily_game_run_status', { p_kind: kind }, 'dailyGameService.getDailyRunStatus')
}

export function startDailyRun(kind: DailyRunKind) {
  return callRunRpc('start_daily_game_run', { p_kind: kind }, 'dailyGameService.startDailyRun')
}

export function finishDailyRun(runId: string, score: number, moves: number) {
  return callRunRpc('finish_daily_game_run', { p_run_id: runId, p_score: Math.max(0, Math.round(score)), p_moves: Math.max(0, Math.round(moves)) }, 'dailyGameService.finishDailyRun')
}
