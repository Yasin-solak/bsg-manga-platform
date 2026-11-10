import { z } from 'zod'
import { withAbortSignal, withServiceTimeout } from './apiResilience'
import { supabase } from './supabase'
import { txa } from '@/i18n/activeLocale'

/* Shop Control > Name effects: list and save of animated name effects (admin only). */

const adminNameEffectSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  description: z.string().nullable().optional().transform((value) => value ?? null),
  assetUrl: z.string(),
  overflowX: z.number(),
  overflowY: z.number(),
  offsetY: z.number(),
  blend: z.enum(['normal', 'screen', 'lighten', 'plus-lighter']).catch('normal'),
  layer: z.enum(['back', 'front', 'inside']).catch('back'),
  textGlow: z.string().nullable().optional().transform((value) => value ?? null),
  status: z.enum(['draft', 'published', 'archived']),
  sortWeight: z.number(),
  updatedAt: z.string(),
})
export type AdminNameEffect = z.infer<typeof adminNameEffectSchema>

export type AdminNameEffectInput = Omit<AdminNameEffect, 'id' | 'slug' | 'updatedAt'> & { id?: string }

async function rpc<T>(fn: string, args: Record<string, unknown>, schema: z.ZodType<T, z.ZodTypeDef, unknown>): Promise<T> {
  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(supabase.rpc(fn, args), signal),
    { label: `nameEffectAdmin.${fn}`, timeoutMs: 15_000 },
  )
  if (error) throw new Error(error.message)
  const parsed = schema.safeParse(data)
  if (!parsed.success) throw new Error(txa('Isim efekti yaniti okunamadi ({v1}).', { v1: fn }))
  return parsed.data
}

export function listAdminNameEffects() {
  return rpc('name_effects_admin_list', {}, z.array(adminNameEffectSchema))
}

export function saveAdminNameEffect(input: AdminNameEffectInput) {
  return rpc('name_effects_admin_save', { p: input }, z.string())
}
