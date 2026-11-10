import { z } from 'zod'
import { withAbortSignal, withServiceTimeout } from './apiResilience'
import { supabase } from './supabase'

/*
 * Admin info card (on name hover): fansub, user or series summary in one
 * call (admin_entity_card). The key can be an id or a name/address. A one-minute memory cache
 * avoids repeat network requests when the same card reopens shortly.
 */

export type AdminEntityKind = 'fansub' | 'user' | 'manga'

const count = z.coerce.number().int().min(0)

const fansubCardSchema = z.object({
  kind: z.literal('fansub'),
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  avatar_url: z.string().nullable(),
  description: z.string().nullable(),
  is_active: z.boolean().nullable(),
  is_verified: z.boolean(),
  created_at: z.string(),
  member_count: count,
  follower_count: count,
  manga_count: count,
  chapter_count: count,
  last_chapter_at: z.string().nullable(),
  admins: z.array(z.string()),
})

const userCardSchema = z.object({
  kind: z.literal('user'),
  id: z.string(),
  username: z.string(),
  display_name: z.string().nullable(),
  avatar_url: z.string().nullable(),
  role: z.string().nullable(),
  created_at: z.string(),
  last_login_at: z.string().nullable(),
  is_banned: z.boolean(),
  ban_until: z.string().nullable(),
  is_premium: z.boolean(),
  fansubs: z.array(z.object({ name: z.string(), slug: z.string(), role: z.string().nullable() })),
  comment_count: count,
  reports_received: count,
  reports_pending: count,
  reports_filed: count,
})

const mangaCardSchema = z.object({
  kind: z.literal('manga'),
  id: z.string(),
  title: z.string(),
  slug: z.string(),
  cover_image_url: z.string().nullable(),
  status: z.string().nullable(),
  series_type: z.string().nullable(),
  is_mature: z.boolean().nullable(),
  is_approved: z.boolean().nullable(),
  is_active: z.boolean().nullable(),
  created_at: z.string(),
  genres: z.array(z.string()).nullable(),
  total_views: count.nullable(),
  fansub_name: z.string().nullable(),
  chapter_count: count,
  last_chapter_at: z.string().nullable(),
  follower_count: count,
})

const cardSchema = z.discriminatedUnion('kind', [fansubCardSchema, userCardSchema, mangaCardSchema])

export type AdminFansubCard = z.infer<typeof fansubCardSchema>
export type AdminUserCard = z.infer<typeof userCardSchema>
export type AdminMangaCard = z.infer<typeof mangaCardSchema>
export type AdminEntityCard = z.infer<typeof cardSchema>

const CACHE_TTL_MS = 60_000
const cache = new Map<string, { at: number, value: Promise<AdminEntityCard | null> }>()

/** Null if no record. Errors are thrown as "Bilgi karti yuklenemedi" and not cached. */
export function getAdminEntityCard(kind: AdminEntityKind, key: string): Promise<AdminEntityCard | null> {
  const trimmed = key.trim()
  const cacheKey = `${kind}:${trimmed.toLocaleLowerCase('tr-TR')}`
  const hit = cache.get(cacheKey)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value

  const value = withServiceTimeout(
    (signal) => withAbortSignal(supabase.rpc('admin_entity_card', { p_kind: kind, p_key: trimmed }), signal),
    { label: 'Bilgi kartı', timeoutMs: 10_000 },
  ).then(({ data, error }) => {
    if (error) throw new Error('Bilgi kartı yüklenemedi.')
    return data == null ? null : cardSchema.parse(data)
  })
  cache.set(cacheKey, { at: Date.now(), value })
  value.catch(() => { cache.delete(cacheKey) })
  return value
}
