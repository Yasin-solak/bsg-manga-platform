import { assertUploadRateLimit } from '../../_shared/upload-rate-limit.js'
import { inspectStudioImage, STUDIO_RAW_MAX_BYTES, StudioImageError } from '../../_shared/studio-image-validation.js'
import {
  authenticate, errorResponse, HttpError, json, loadPageForUser, methodNotAllowed, requireStudioPermission,
  requireUuid, serviceClient, sha256Hex, timed,
} from '../../_shared/translation-http.js'

const EXTENSIONS = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }
const MULTIPART_ALLOWANCE = 1024 * 1024

export function requireBucket(env) {
  const bucket = env?.TYPESET_RAW_BUCKET
  if (!bucket || typeof bucket.put !== 'function' || typeof bucket.get !== 'function') {
    throw new HttpError(503, 'Ham görsel deposu kullanılamıyor.')
  }
  return bucket
}

// The key format is what the studio-image Worker expects (pages/<page>/<sha>.<ext>).
export function rawKey(pageId, sha256, mimeType) {
  return `pages/${pageId}/${sha256}.${EXTENSIONS[mimeType]}`
}

async function post(request, env, deps) {
  const { db, authUser } = await authenticate(request, env, deps.createClient)
  const bucket = requireBucket(env)
  const contentType = request.headers.get('content-type') || ''
  if (!contentType.toLowerCase().startsWith('multipart/form-data')) {
    throw new HttpError(415, 'Görsel çok parçalı form olarak gönderilmeli.')
  }
  if (Number(request.headers.get('content-length')) > STUDIO_RAW_MAX_BYTES + MULTIPART_ALLOWANCE) {
    throw new HttpError(413, 'Ham görsel 25 MB sınırını aşıyor.')
  }
  await (deps.assertUploadRateLimit ?? assertUploadRateLimit)({
    request, env, authContext: { authUser }, intent: 'translation-raw',
  })
  let form
  try {
    form = await request.formData()
  } catch {
    throw new HttpError(400, 'Görsel formu okunamadı.')
  }
  const pageId = requireUuid(form.get('page_id'), 'Sayfa kimliği')
  const files = form.getAll('file')
  const file = files.length === 1 ? files[0] : null
  if (!file || typeof file.arrayBuffer !== 'function' || file.size < 1) {
    throw new HttpError(400, 'Tek bir ham görsel dosyası gerekli.')
  }
  if (file.size > STUDIO_RAW_MAX_BYTES) throw new HttpError(413, 'Ham görsel 25 MB sınırını aşıyor.')

  const { page, project } = await loadPageForUser(db, pageId)
  await requireStudioPermission(db, project.fansub_id, 'ceviri.proje')
  const buffer = await file.arrayBuffer()
  const fileName = typeof file.name === 'string' ? file.name.slice(0, 255) : null
  const stored = await storeRawPage({ env, deps, bucket, page, buffer, fileName })
  return json(stored, stored.reused ? 200 : 201)
}

/**
 * Validates the raw image, writes it to private R2 and marks the page "ready". Upload
 * (raw.js POST) and revision import (import.js) share this path.
 */
export async function storeRawPage({ env, deps = {}, bucket, page, buffer, fileName }) {
  const pageId = page.id
  const bytes = new Uint8Array(buffer)
  const { mimeType, width, height } = inspectStudioImage(bytes)
  const sha256 = await sha256Hex(bytes)
  const objectKey = rawKey(pageId, sha256, mimeType)

  if (page.raw_status === 'ready' && page.raw_sha256 === sha256) {
    return { pageId, sha256, mimeType, width, height, reused: true }
  }
  const service = serviceClient(env, deps.createClient)
  if (page.raw_status === 'ready') {
    // If a scanned page's raw image changes, its bboxes become meaningless; items must be deleted first.
    const { count, error } = await timed(service.from('translation_items')
      .select('id', { count: 'exact', head: true }).eq('page_id', pageId))
    if (error) throw new HttpError(503, 'Sayfa ögeleri okunamadı.')
    if (count > 0) throw new HttpError(409, 'Bu sayfa taranmış. Raw değiştirmek için önce sayfadaki alanları silin.')
  }

  await bucket.put(objectKey, buffer, {
    sha256: buffer.byteLength ? await crypto.subtle.digest('SHA-256', buffer) : undefined,
    httpMetadata: { contentType: mimeType, cacheControl: 'private, no-store' },
    customMetadata: { sha256 },
  })
  const { data: updated, error: updateError } = await timed(service.from('translation_pages')
    .update({
      raw_status: 'ready', raw_object_key: objectKey, raw_sha256: sha256, raw_mime_type: mimeType,
      raw_byte_size: bytes.length, width, height, clean_object_key: null, clean_sha256: null,
      scan_stage: 'uploaded', scan_error: null, ...(fileName ? { file_name: fileName } : {}),
    })
    .eq('id', pageId).eq('version', page.version).select('version'))
  if (updateError) throw new HttpError(503, 'Ham görsel kaydedilemedi.')
  if (!updated?.length) throw new HttpError(409, 'Sayfa başka bir oturumda değişti. Yenileyip tekrar deneyin.')
  return { pageId, sha256, mimeType, width, height, version: updated[0].version }
}

async function get(request, env, deps) {
  const url = new URL(request.url)
  const pageId = requireUuid(url.searchParams.get('page_id'), 'Sayfa kimliği')
  const { db } = await authenticate(request, env, deps.createClient)
  const bucket = requireBucket(env)
  // Reads are not counted in KV (each preview was using up the daily KV write quota);
  // access is tied to team membership through loadPageForUser.
  const { page } = await loadPageForUser(db, pageId)
  const wantClean = url.searchParams.get('kind') === 'clean'
  const key = wantClean ? page.clean_object_key : page.raw_object_key
  if (page.raw_status !== 'ready' || !key) throw new HttpError(404, 'Sayfa görseli henüz yok.')
  const object = await bucket.get(key)
  if (!object?.body) throw new HttpError(503, 'Sayfa görseli depoda bulunamadı.')
  return new Response(object.body, {
    headers: {
      'content-type': object.httpMetadata?.contentType || page.raw_mime_type,
      'cache-control': 'private, max-age=300',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'",
    },
  })
}

export async function handleTranslationRawPost(request, env, deps = {}) {
  try {
    return await post(request, env, deps)
  } catch (error) {
    if (error instanceof StudioImageError) return json({ error: error.message }, error.status)
    return errorResponse(error)
  }
}

export async function handleTranslationRawGet(request, env, deps = {}) {
  try {
    return await get(request, env, deps)
  } catch (error) {
    return errorResponse(error)
  }
}

export const onRequestPost = ({ request, env }) => handleTranslationRawPost(request, env)
export const onRequestGet = ({ request, env }) => handleTranslationRawGet(request, env)
export const onRequest = () => methodNotAllowed('GET, POST')
