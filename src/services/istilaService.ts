import { z } from 'zod'
import { withAbortSignal, withServiceTimeout } from './apiResilience'
import { supabase } from './supabase'
import { txa } from '@/i18n/activeLocale'

/*
 * Mürek Invasion event: catching a cousin that occasionally appears on the site. Spawn decisions and catch
 * validation are on the server (istila_request_spawn / istila_catch), along with the daily limit, cooldown and
 * coin ledger. The client only shows the ticket and forwards the click.
 */

const KINDS = ['vampir', 'cadi', 'hayalet', 'balkabagi', 'mumya'] as const
export type IstilaKind = typeof KINDS[number]

const spawnSchema = z.object({ spawnId: z.string().uuid(), kind: z.enum(KINDS), reward: z.number().int(), ttlMs: z.number().int().positive() })
const catchSchema = z.object({
  kind: z.enum(KINDS), reward: z.number().int(), balance: z.number().int(), today: z.number().int(), dailyLimit: z.number().int(),
  kinds: z.array(z.enum(KINDS)).catch([]), badgeAwarded: z.boolean().catch(false),
})
const statusSchema = z.object({
  active: z.boolean(), startsAt: z.string(), endsAt: z.string(), dailyLimit: z.number().int(),
  today: z.number().int().optional(), total: z.number().int().optional(), kinds: z.array(z.enum(KINDS)).optional(),
  rank: z.number().int().nullable().optional(),
})
const leaderSchema = z.array(z.object({
  rank: z.number().int(), total: z.number().int(), username: z.string().nullable(), displayName: z.string(), avatarUrl: z.string().nullable(),
}))

export type IstilaSpawn = z.infer<typeof spawnSchema>
export type IstilaCatchResult = z.infer<typeof catchSchema>
export type IstilaStatus = z.infer<typeof statusSchema>
export type IstilaLeader = z.infer<typeof leaderSchema>[number]
export const ISTILA_KINDS = KINDS

async function rpc(name: string, args: Record<string, unknown>, label: string) {
  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(supabase.rpc(name, args), signal),
    { label },
  )
  if (error) throw error
  return data as unknown
}

/** Kuzen cikisi ister; cikmazsa null, gunluk sinir dolduysa 'limit'. */
export async function requestIstilaSpawn(surface: string): Promise<IstilaSpawn | 'limit' | null> {
  const data = await rpc('istila_request_spawn', { p_surface: surface.slice(0, 40) }, 'istilaService.requestSpawn')
  if (data && typeof data === 'object' && (data as { limitReached?: unknown }).limitReached === true) return 'limit'
  const parsed = spawnSchema.safeParse(data)
  return parsed.success ? parsed.data : null
}

export async function catchIstilaSpawn(spawnId: string): Promise<IstilaCatchResult> {
  const parsed = catchSchema.safeParse(await rpc('istila_catch', { p_spawn_id: spawnId }, 'istilaService.catch'))
  if (!parsed.success) throw new Error('ISTILA_SPAWN_INVALID')
  return parsed.data
}

export async function getIstilaStatus(): Promise<IstilaStatus | null> {
  const parsed = statusSchema.safeParse(await rpc('istila_status', {}, 'istilaService.status'))
  return parsed.success ? parsed.data : null
}

export async function getIstilaLeaderboard(limit = 10): Promise<IstilaLeader[]> {
  const parsed = leaderSchema.safeParse(await rpc('istila_leaderboard', { p_limit: limit }, 'istilaService.leaderboard'))
  return parsed.success ? parsed.data : []
}

const ISTILA_ERRORS: Record<string, string> = {
  get ISTILA_ESCAPED() { return txa('Kaçtı! Bir dahakine daha hızlı ol.') },
  get ISTILA_DAILY_LIMIT() { return txa('Bugünlük avın tamam. Yarın kuzenler yine gelecek.') },
  get ISTILA_ALREADY_CAUGHT() { return txa('Bu kuzeni zaten yakaladın.') },
}

export function toIstilaErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : typeof error === 'object' && error && 'message' in error ? String((error as { message: unknown }).message) : ''
  const code = Object.keys(ISTILA_ERRORS).find((key) => message.includes(key))
  return code ? ISTILA_ERRORS[code] : txa('Kuzen elinden kaydı. Biraz sonra tekrar dene.')
}
