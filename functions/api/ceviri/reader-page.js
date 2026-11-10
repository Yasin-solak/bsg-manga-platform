import { createClient } from '@supabase/supabase-js'
import { errorResponse, HttpError, methodNotAllowed, requireUuid, timed } from '../../_shared/translation-http.js'

/*
 * Clean base page for the reader. Access is decided in the DB (tl_reader_clean_key ->
 * tl_reader_project): chapter/series visibility, adult gate and publish time.
 * The request uses the reader's own JWT (or anon); if no key comes back, the answer is 404.
 */

export function readerClient(request, env, factory = createClient) {
  if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY) throw new HttpError(503, 'Okuyucu servisi hazır değil.')
  const token = request.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1]
  return factory(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    ...(token ? { global: { headers: { Authorization: `Bearer ${token}` } } } : {}),
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

async function get(request, env, deps) {
  const url = new URL(request.url)
  const chapterId = requireUuid(url.searchParams.get('chapter_id'), 'Bölüm kimliği')
  const index = Number(url.searchParams.get('index'))
  if (!Number.isInteger(index) || index < 0 || index > 999) throw new HttpError(400, 'Sayfa sırası geçersiz.')
  const bucket = env?.TYPESET_RAW_BUCKET
  if (!bucket || typeof bucket.get !== 'function') throw new HttpError(503, 'Görsel deposu kullanılamıyor.')
  // Public reader images are not counted in KV: every page view was using up the daily KV write
  // quota and halting uploads across the site. Access is tied to publication through tl_reader_clean_key.
  const db = readerClient(request, env, deps.createClient)
  const { data: key, error } = await timed(db.rpc('tl_reader_clean_key', { p_chapter_id: chapterId, p_index: index }))
  if (error) throw new HttpError(503, 'Sayfa okunamadı.')
  if (typeof key !== 'string' || !/^clean\/[0-9a-f-]{36}\/[0-9a-f]{64}\.(png|jpg|webp)$/.test(key)) {
    throw new HttpError(404, 'Sayfa bulunamadı.')
  }
  const object = await bucket.get(key)
  if (!object?.body) throw new HttpError(404, 'Sayfa bulunamadı.')
  return new Response(object.body, {
    headers: {
      'content-type': object.httpMetadata?.contentType || 'image/webp',
      // Erisim her istekte yeniden denetlenir; paylasilan onbellege girmez.
      'cache-control': 'private, max-age=600',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'",
    },
  })
}

export async function handleTranslationReaderPage(request, env, deps = {}) {
  try {
    return await get(request, env, deps)
  } catch (error) {
    return errorResponse(error)
  }
}

export const onRequestGet = ({ request, env }) => handleTranslationReaderPage(request, env)
export const onRequest = () => methodNotAllowed('GET')
