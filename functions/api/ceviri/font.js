import { assertUploadRateLimit } from '../../_shared/upload-rate-limit.js'
import {
  authenticate, errorResponse, HttpError, json, methodNotAllowed, requireUuid, serviceClient, sha256Hex, timed,
} from '../../_shared/translation-http.js'

/*
 * Fansub-specific typeface. POST (studio team): the file signature is verified, the file is
 * written to private R2 and the service opens the row. GET ?id (anyone): fonts are served because
 * published pages and reader languages use them; the key contains the sha, so it is immutable and cached long.
 */

const MAX_FONT_BYTES = 5 * 1024 * 1024

/** File signature: the extension and the client-reported MIME type are not trusted. */
export function detectFont(bytes) {
  if (bytes.length < 12) return null
  const tag = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3])
  if (tag === 'wOF2') return { mimeType: 'font/woff2', extension: 'woff2' }
  if (tag === 'OTTO') return { mimeType: 'font/otf', extension: 'otf' }
  if (tag === 'true' || (bytes[0] === 0 && bytes[1] === 1 && bytes[2] === 0 && bytes[3] === 0)) {
    return { mimeType: 'font/ttf', extension: 'ttf' }
  }
  return null
}

export function fontName(value, fallback) {
  const cleaned = String(value ?? '').replace(/\.(ttf|otf|woff2)$/i, '').replace(/[^\p{L}\p{N} _-]/gu, ' ').replace(/\s+/g, ' ').trim()
  return (cleaned || fallback).slice(0, 64)
}

async function post(request, env, deps) {
  const { db, authUser } = await authenticate(request, env, deps.createClient)
  const bucket = env?.TYPESET_RAW_BUCKET
  if (!bucket || typeof bucket.put !== 'function') throw new HttpError(503, 'Font deposu kullanılamıyor.')
  if (!(request.headers.get('content-type') || '').toLowerCase().startsWith('multipart/form-data')) {
    throw new HttpError(415, 'Font çok parçalı form olarak gönderilmeli.')
  }
  await (deps.assertUploadRateLimit ?? assertUploadRateLimit)({ request, env, authContext: { authUser }, intent: 'translation-raw' })
  let form
  try {
    form = await request.formData()
  } catch {
    throw new HttpError(400, 'Font formu okunamadı.')
  }
  const fansubId = requireUuid(form.get('fansub_id'), 'Fansub kimliği')
  const file = form.get('file')
  if (!file || typeof file.arrayBuffer !== 'function' || file.size < 1) throw new HttpError(400, 'Font dosyası gerekli.')
  if (file.size > MAX_FONT_BYTES) throw new HttpError(413, 'Font 5 MB sınırını aşıyor.')

  const { data: allowed, error: accessError } = await timed(db.rpc('tl_can_manage_fansub', { p_fansub_id: fansubId }))
  if (accessError) throw new HttpError(503, 'Yetki doğrulanamadı.')
  if (allowed !== true) throw new HttpError(403, 'Bu ekibe font ekleyemezsin.')

  const bytes = new Uint8Array(await file.arrayBuffer())
  const kind = detectFont(bytes)
  if (!kind) throw new HttpError(415, 'Yalnız TTF, OTF veya WOFF2 font yüklenebilir.')
  const sha256 = await sha256Hex(bytes)
  const objectKey = `fonts/${fansubId}/${sha256}.${kind.extension}`
  await bucket.put(objectKey, bytes, { httpMetadata: { contentType: kind.mimeType, cacheControl: 'public, max-age=31536000, immutable' } })

  const service = serviceClient(env, deps.createClient)
  const name = fontName(form.get('name') || file.name, 'Özel font')
  const { data, error } = await timed(service.from('translation_fonts')
    .upsert({ fansub_id: fansubId, name, object_key: objectKey, sha256, mime_type: kind.mimeType, byte_size: bytes.length },
      { onConflict: 'fansub_id,sha256' })
    .select('id,name,mime_type').single())
  if (error || !data) throw new HttpError(503, 'Font kaydedilemedi.')
  return json({ id: data.id, name: data.name, mimeType: data.mime_type }, 201)
}

async function get(request, env, deps) {
  const id = requireUuid(new URL(request.url).searchParams.get('id'), 'Font kimliği')
  const bucket = env?.TYPESET_RAW_BUCKET
  if (!bucket || typeof bucket.get !== 'function') throw new HttpError(503, 'Font deposu kullanılamıyor.')
  const service = serviceClient(env, deps.createClient)
  const { data, error } = await timed(service.from('translation_fonts').select('object_key,mime_type').eq('id', id).maybeSingle())
  if (error) throw new HttpError(503, 'Font okunamadı.')
  if (!data) throw new HttpError(404, 'Font bulunamadı.')
  const object = await bucket.get(data.object_key)
  if (!object?.body) throw new HttpError(404, 'Font bulunamadı.')
  return new Response(object.body, {
    headers: {
      'content-type': data.mime_type,
      'cache-control': 'public, max-age=31536000, immutable',
      'access-control-allow-origin': '*',
      'x-content-type-options': 'nosniff',
    },
  })
}

export async function handleTranslationFontPost(request, env, deps = {}) {
  try { return await post(request, env, deps) } catch (error) { return errorResponse(error) }
}

export async function handleTranslationFontGet(request, env, deps = {}) {
  try { return await get(request, env, deps) } catch (error) { return errorResponse(error) }
}

export const onRequestPost = ({ request, env }) => handleTranslationFontPost(request, env)
export const onRequestGet = ({ request, env }) => handleTranslationFontGet(request, env)
export const onRequest = () => methodNotAllowed('GET, POST')
