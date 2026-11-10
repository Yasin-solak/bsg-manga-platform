import { z } from 'zod'
import { withAbortSignal, withServiceTimeout } from './apiResilience'
import { supabase } from './supabase'

export interface UserProgression {
  rulesetVersion: number
  levelNumber: number
  title: string
  totalXp: number | null
  currentLevelXp: number | null
  nextLevelXp: number | null
  xpToNextLevel: number | null
  progressPercent: number | null
  isMaxLevel: boolean
}

export interface AdminUserXpEvent {
  id: string
  xpDelta: number
  reasonCode: string
  sourceType: 'quest_claim' | 'admin_adjustment' | 'system_correction'
  sourceRef: string | null
  occurredAt: string
  metadata: Record<string, unknown>
}

export interface AdminUserProgression extends UserProgression {
  events: AdminUserXpEvent[]
}

const nullableXpSchema = z.number().int().nonnegative().nullable()
export const userProgressionPayloadSchema = z.object({
  rulesetVersion: z.number().int().positive(),
  levelNumber: z.number().int().positive(),
  title: z.string().trim().min(1).max(80),
  totalXp: nullableXpSchema,
  currentLevelXp: nullableXpSchema,
  nextLevelXp: nullableXpSchema,
  xpToNextLevel: nullableXpSchema,
  progressPercent: z.number().int().min(0).max(100).nullable(),
  isMaxLevel: z.boolean(),
}).strict()

const adminUserXpEventSchema = z.object({
  id: z.string().uuid(),
  xpDelta: z.number().int(),
  reasonCode: z.string().trim().min(1).max(100),
  sourceType: z.enum(['quest_claim', 'admin_adjustment', 'system_correction']),
  sourceRef: z.string().nullable(),
  occurredAt: z.string().datetime({ offset: true }),
  metadata: z.record(z.unknown()),
}).strict()

const adminUserProgressionPayloadSchema = userProgressionPayloadSchema.extend({
  events: z.array(adminUserXpEventSchema).max(20),
}).strict()

function unwrapRpcPayload(data: unknown) {
  return Array.isArray(data) && data.length === 1 ? data[0] : data
}

function isMissingProgressionRpc(error: unknown) {
  if (!error || typeof error !== 'object') return false
  const typed = error as { code?: unknown; message?: unknown }
  const code = typeof typed.code === 'string' ? typed.code : ''
  const message = typeof typed.message === 'string' ? typed.message.toLowerCase() : ''
  return code === '42883'
    || code === 'PGRST202'
    || (message.includes('function') && (message.includes('does not exist') || message.includes('could not find')))
}

export function parseUserProgression(value: unknown): UserProgression | undefined {
  const parsed = userProgressionPayloadSchema.safeParse(value)
  return parsed.success ? parsed.data : undefined
}

export async function getPublicUserProgression(userId: string): Promise<UserProgression | null> {
  const normalizedUserId = z.string().uuid().parse(userId)
  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase.rpc('get_public_user_progression', { p_user_id: normalizedUserId }),
      signal,
    ),
    { label: 'Profil seviye ilerlemesini yukleme' },
  )

  if (error) {
    if (isMissingProgressionRpc(error)) return null
    throw error
  }
  return userProgressionPayloadSchema.parse(unwrapRpcPayload(data))
}

export async function getAdminUserProgression(userId: string): Promise<AdminUserProgression | null> {
  const normalizedUserId = z.string().uuid().parse(userId)
  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase.rpc('get_admin_user_progression', { p_user_id: normalizedUserId }),
      signal,
    ),
    { label: 'Admin kullanici seviye olaylarini yukleme' },
  )

  if (error) {
    if (isMissingProgressionRpc(error)) return null
    throw error
  }
  return adminUserProgressionPayloadSchema.parse(unwrapRpcPayload(data))
}
