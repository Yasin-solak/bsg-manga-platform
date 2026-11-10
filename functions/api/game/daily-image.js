// GET /api/game/daily-image?kind=cover|panel: image for Today's Cover / Panel Hunt.
//
// The cover URL contains the answer (slug), so it is never given to the client: the source is read
// only with service_role, blurred ON THE SERVER with Cloudflare Images according to the player's stage, and
// returned as bytes. When the game ends (stage = MAX) the image is sharp. If the transform was not applied
// (no cf-resized), we return 503 rather than leak the sharp image.
import { createClient } from '@supabase/supabase-js'

const KINDS = new Set(['cover', 'panel'])
const CHAPTER_PAGE_SCHEME = 'chapter-pages://'
// Stage = number of wrong guesses. Each wrong guess sharpens the image a bit; 6 = game over (sharp).
export const STAGE_BLUR = [48, 36, 26, 18, 11, 6]
const IMAGE_WIDTH = 480
const DB_TIMEOUT_MS = 10_000

function errorResponse(status, message) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
      ...(status === 405 ? { allow: 'GET' } : {}),
    },
  })
}

export function blurForStage(stage) {
  const value = Number(stage)
  if (!Number.isInteger(value) || value < 0) return STAGE_BLUR[0]
  return value >= STAGE_BLUR.length ? 0 : STAGE_BLUR[value]
}

/**
 * Source: site-internal absolute path, https URL or chapter page reference (chapter-pages://path).
 * A chapter page resolves by the same rule as resolveChapterPageUrl on the client.
 */
export function resolveImageSource(source, origin, env = {}) {
  if (typeof source !== 'string') return null
  const trimmed = source.trim()
  if (!trimmed) return null
  if (trimmed.startsWith(CHAPTER_PAGE_SCHEME)) {
    const path = trimmed.slice(CHAPTER_PAGE_SCHEME.length).replace(/^\/+/, '')
    if (!path || path.includes('..')) return null
    const base = (env.VITE_CHAPTER_PAGE_PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '')
      || (env.VITE_SUPABASE_URL ? `${String(env.VITE_SUPABASE_URL).replace(/\/+$/, '')}/storage/v1/object/public/${env.CHAPTER_PAGES_BUCKET || 'chapter-pages'}` : '')
    if (!/^https:\/\//i.test(base)) return null
    return new URL(`${base}/${path.split('/').map(encodeURIComponent).join('/')}`)
  }
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return new URL(trimmed, origin)
  try {
    const url = new URL(trimmed)
    return url.protocol === 'https:' ? url : null
  } catch {
    return null
  }
}

function clientFor(env, key, token = null) {
  return createClient(env.VITE_SUPABASE_URL, key, {
    ...(token ? { global: { headers: { Authorization: `Bearer ${token}` } } } : {}),
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

// Oyuncunun asamasi kendi oturumuyla okunur (get_daily_game kaynak/cevap icermez).
async function readStage(env, kind, token) {
  if (!token) return 0
  const db = clientFor(env, env.VITE_SUPABASE_ANON_KEY, token)
  const { data, error } = await db.rpc('get_daily_game', { p_kind: kind }).abortSignal(AbortSignal.timeout(DB_TIMEOUT_MS))
  if (error || !data || typeof data !== 'object') return 0
  return Number(data.stage) || 0
}

export async function onRequest({ request, env }) {
  if (request.method !== 'GET') return errorResponse(405, 'Yalnız GET desteklenir.')
  if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return errorResponse(503, 'Oyun servisi henüz hazır değil.')
  }

  const requestUrl = new URL(request.url)
  const kind = requestUrl.searchParams.get('kind') || ''
  if (!KINDS.has(kind)) return errorResponse(400, 'Geçersiz oyun.')

  const token = request.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1] ?? null

  try {
    const stage = await readStage(env, kind, token)
    const service = clientFor(env, env.SUPABASE_SERVICE_ROLE_KEY)
    const { data, error } = await service
      .rpc('daily_game_image_source', { p_kind: kind, p_user_id: null })
      .abortSignal(AbortSignal.timeout(DB_TIMEOUT_MS))
    if (error || !data?.source) return errorResponse(404, 'Bugünün bulmacası hazır değil.')

    const sourceUrl = resolveImageSource(data.source, requestUrl.origin, env)
    if (!sourceUrl) return errorResponse(404, 'Bugünün bulmacası hazır değil.')

    const blur = blurForStage(stage)
    // Same day + stage is the same image for everyone: keep the transform in the shared cache.
    const cache = typeof globalThis.caches !== 'undefined' ? globalThis.caches.default : null
    const cacheKey = new Request(`${requestUrl.origin}/__game-image-cache/${kind}/${data.date}/${blur}`)
    let upstream = cache ? await cache.match(cacheKey).catch(() => undefined) : undefined

    if (!upstream) {
      const fetched = await fetch(sourceUrl.toString(), {
        headers: { accept: 'image/avif,image/webp,image/*,*/*;q=0.8' },
        cf: {
          image: {
            width: IMAGE_WIDTH,
            fit: 'scale-down',
            format: 'webp',
            metadata: 'none',
            ...(blur > 0 ? { blur } : {}),
          },
        },
      })
      if (!fetched.ok || !fetched.body || !/^image\//i.test(fetched.headers.get('content-type') || '')) {
        return errorResponse(502, 'Görsel alınamadı.')
      }
      const resized = fetched.headers.get('cf-resized') || ''
      if (blur > 0 && (!resized || /err=/i.test(resized))) {
        return errorResponse(503, 'Görsel hazırlanamadı.')
      }
      upstream = new Response(fetched.body, {
        headers: {
          'content-type': fetched.headers.get('content-type') || 'image/webp',
          'cache-control': 'public, max-age=86400',
        },
      })
      // The cache only speeds things up; if it cannot be written (pages.dev), the response still returns.
      if (cache) await cache.put(cacheKey, upstream.clone()).catch(() => {})
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        'content-type': upstream.headers.get('content-type') || 'image/webp',
        'cache-control': 'private, no-store',
        'x-content-type-options': 'nosniff',
        'referrer-policy': 'no-referrer',
      },
    })
  } catch {
    return errorResponse(503, 'Görsel şu anda alınamadı.')
  }
}
