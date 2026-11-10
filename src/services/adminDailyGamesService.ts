import { z } from 'zod'
import { withAbortSignal, withServiceTimeout } from './apiResilience'
import { supabase } from './supabase'
import { toUserFacingErrorMessage } from './userFacingError'

/*
 * Game Corner management (admin only): rules (coin cap, rewards, tiers, on/off),
 * daily stats, today's puzzles, top earners and suspicious runs. Permission is checked
 * on the server (app_private.is_admin); the client only displays.
 */

const int = (fallback = 0) => z.number().finite().catch(fallback)

const runnerTierSchema = z.object({ score: z.number().int(), coin: z.number().int() })
const matchTierSchema = z.object({ seconds: z.number().int(), coin: z.number().int() })

const settingsSchema = z.object({
  dailyCoinCap: int(30),
  enabled: z.object({ cover: z.boolean(), panel: z.boolean(), runner: z.boolean(), match: z.boolean() }),
  guessRewards: z.array(z.number().int()),
  runAttempts: int(3),
  runnerTiers: z.array(runnerTierSchema),
  matchTiers: z.array(matchTierSchema),
  matchFinishCoin: int(2),
  panelMinSeries: int(8),
  updatedAt: z.string().nullable().catch(null),
})

const overviewSchema = z.object({
  today: z.string(),
  settings: settingsSchema,
  puzzles: z.array(z.object({
    date: z.string(),
    kind: z.enum(['cover', 'panel']),
    mangaId: z.string(),
    title: z.string().nullable().catch(null),
    plays: int(),
  })).catch([]),
  daily: z.array(z.object({
    date: z.string(),
    coverPlayers: int(),
    coverSolved: int(),
    panelPlayers: int(),
    runnerRuns: int(),
    matchRuns: int(),
    players: int(),
    coins: int(),
  })).catch([]),
  topEarners: z.array(z.object({ userId: z.string(), username: z.string().nullable().catch(null), coins: int() })).catch([]),
  suspiciousRuns: z.array(z.object({
    runId: z.string(),
    userId: z.string(),
    username: z.string().nullable().catch(null),
    date: z.string(),
    score: int(),
    seconds: int(),
    coin: int(),
  })).catch([]),
})

export type DailyGameSettings = z.infer<typeof settingsSchema>
export type DailyGamesOverview = z.infer<typeof overviewSchema>
export type DailyGameRunnerTier = z.infer<typeof runnerTierSchema>
export type DailyGameMatchTier = z.infer<typeof matchTierSchema>

export function parseDailyGamesOverview(value: unknown): DailyGamesOverview | null {
  const result = overviewSchema.safeParse(value)
  return result.success ? result.data : null
}

export function parseDailyGameSettings(value: unknown): DailyGameSettings | null {
  const result = settingsSchema.safeParse(value)
  return result.success ? result.data : null
}

/** Local validation of the settings form before saving; the server applies the same limits. */
export function validateDailyGameSettings(settings: DailyGameSettings): string | null {
  if (settings.dailyCoinCap < 0 || settings.dailyCoinCap > 500) return 'Günlük coin tavanı 0-500 arası olmalı.'
  if (settings.guessRewards.length !== 6 || settings.guessRewards.some((value) => value < 0 || value > 200)) {
    return 'Tahmin ödülleri 6 adet ve 0-200 arası olmalı.'
  }
  if (settings.runAttempts < 1 || settings.runAttempts > 20) return 'Deneme hakkı 1-20 arası olmalı.'
  if ([...settings.runnerTiers, ...settings.matchTiers].some((tier) => tier.coin < 0 || tier.coin > 200)) {
    return 'Kademe coinleri 0-200 arası olmalı.'
  }
  if (settings.matchTiers.some((tier) => tier.seconds <= 0) || settings.runnerTiers.some((tier) => tier.score <= 0)) {
    return 'Kademe eşikleri pozitif olmalı.'
  }
  if (settings.panelMinSeries < 1 || settings.panelMinSeries > 500) return 'Panel Avı eşiği 1-500 arası olmalı.'
  return null
}

async function adminRpc(name: string, args: Record<string, unknown>, label: string) {
  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(supabase.rpc(name, args), signal),
    { label },
  )
  if (error) throw new Error(toUserFacingErrorMessage(error, 'Oyun yönetimi işlemi tamamlanamadı.'))
  return data as unknown
}

export async function getAdminDailyGamesOverview(days = 14): Promise<DailyGamesOverview> {
  const data = await adminRpc('admin_daily_games_overview', { p_days: days }, 'adminDailyGames.overview')
  const overview = parseDailyGamesOverview(data)
  if (!overview) throw new Error('Oyun verisi okunamadı.')
  return overview
}

export async function updateAdminDailyGameSettings(settings: Partial<Omit<DailyGameSettings, 'updatedAt'>>): Promise<DailyGameSettings> {
  const data = await adminRpc('admin_update_daily_game_settings', { p: settings }, 'adminDailyGames.updateSettings')
  const parsed = parseDailyGameSettings(data)
  if (!parsed) throw new Error('Ayarlar kaydedildi ama okunamadı.')
  return parsed
}

export async function setAdminDailyPuzzle(kind: 'cover' | 'panel', date: string, mangaId: string) {
  await adminRpc('admin_set_daily_puzzle', { p_kind: kind, p_date: date, p_manga_id: mangaId }, 'adminDailyGames.setPuzzle')
}
