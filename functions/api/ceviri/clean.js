import { assertUploadRateLimit } from '../../_shared/upload-rate-limit.js'
import { inspectStudioImage, STUDIO_RAW_MAX_BYTES, StudioImageError } from '../../_shared/studio-image-validation.js'
import {
  authenticate, errorResponse, HttpError, json, loadPageForUser, methodNotAllowed, requireStudioPermission, requireUuid,
  serviceClient, sha256Hex, timed,
} from '../../_shared/translation-http.js'

/*
 * Clean base (text-free page) upload. At publish time the client renders the cleaned
 * version of each page and sends it here; when a reader picks another language, that
 * language's text is laid out on this base. Stored in private R2; only the service writes the key.
 */

const EXTENSIONS = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }

export function cleanKey(pageId, sha256, mimeType) {
  return `clean/${pageId}/${sha256}.${EXTENSIONS[mimeType]}`
}

async function post(request, env, deps) {
  const { db, authUser } = await authenticate(request, env, deps.createClient)
  const bucket = env?.TYPESET_RAW_BUCKET
  if (!bucket || typeof bucket.put !== 'function') throw new HttpError(503, 'Görsel deposu kullanılamıyor.')
  if (!(request.headers.get('content-type') || '').toLowerCase().startsWith('multipart/form-data')) {
    throw new HttpError(415, 'Görsel çok parçalı form olarak gönderilmeli.')
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
  const file = form.get('file')
  if (!file || typeof file.arrayBuffer !== 'function' || file.size < 1) throw new HttpError(400, 'Temiz sayfa görseli gerekli.')
  if (file.size > STUDIO_RAW_MAX_BYTES) throw new HttpError(413, 'Temiz sayfa 25 MB sınırını aşıyor.')

  const { page, project } = await loadPageForUser(db, pageId)
  // The clean base is uploaded at the publish step.
  await requireStudioPermission(db, project.fansub_id, 'ceviri.yayinla')
  if (page.raw_status !== 'ready') throw new HttpError(409, 'Sayfanın ham görseli hazır değil.')
  const bytes = new Uint8Array(await file.arrayBuffer())
  const { mimeType, width, height } = inspectStudioImage(bytes)
  // Text is placed at natural pixel positions, so dimensions must match the raw image.
  if (width !== page.width || height !== page.height) throw new HttpError(422, 'Temiz sayfa ölçüleri ham sayfayla aynı olmalı.')
  const sha256 = await sha256Hex(bytes)
  const key = cleanKey(pageId, sha256, mimeType)
  await bucket.put(key, bytes, {
    httpMetadata: { contentType: mimeType, cacheControl: 'private, no-store' },
    customMetadata: { sha256 },
  })
  const service = serviceClient(env, deps.createClient)
  const { error } = await timed(service.from('translation_pages')
    .update({ clean_object_key: key, clean_sha256: sha256, scan_stage: 'cleaned' }).eq('id', pageId))
  if (error) throw new HttpError(503, 'Temiz sayfa kaydedilemedi.')
  return json({ pageId, sha256 }, 201)
}

export async function handleTranslationClean(request, env, deps = {}) {
  try {
    return await post(request, env, deps)
  } catch (error) {
    if (error instanceof StudioImageError) return json({ error: error.message }, error.status)
    return errorResponse(error)
  }
}

export const onRequestPost = ({ request, env }) => handleTranslationClean(request, env)
export const onRequest = () => methodNotAllowed('POST')
