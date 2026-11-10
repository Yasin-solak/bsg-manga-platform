import { assertUploadRateLimit } from '../../_shared/upload-rate-limit.js'
import { STUDIO_RAW_MAX_BYTES, StudioImageError } from '../../_shared/studio-image-validation.js'
import {
  authenticate, errorResponse, HttpError, json, loadPageForUser, methodNotAllowed, readJson, requireStudioPermission,
  requireUuid, timed,
} from '../../_shared/translation-http.js'
import { requireBucket, storeRawPage } from './raw.js'

/*
 * Revision import: a page of the published classic chapter is copied as a RAW image into the
 * empty page of the revision project (the browser does not download and re-upload it,
 * avoiding CORS and size issues). The source reference comes from the DB (tl_revision_import_ref:
 * project management permission + chapter page order); the client cannot supply a URL. Only the
 * chapter store (chapter-pages) and the Supabase public chapter-pages path are read.
 */

const CHAPTER_PAGE_SCHEME = 'chapter-pages://'
const SUPABASE_CHAPTER_PREFIX = '/storage/v1/object/public/chapter-pages/'

function trimBase(value) {
  return typeof value === 'string' ? value.trim().replace(/\/+$/g, '') : ''
}

/** Resolves a chapter page reference to a readable source; unknown sources are rejected. */
export function resolveImportSource(ref, env) {
  if (typeof ref !== 'string' || !ref.trim()) return null
  const value = ref.trim()
  if (value.startsWith(CHAPTER_PAGE_SCHEME)) {
    const path = value.slice(CHAPTER_PAGE_SCHEME.length).replace(/^\/+/, '')
    return path && !path.includes('..') ? { kind: 'bucket', path } : null
  }
  const publicBase = trimBase(env?.VITE_CHAPTER_PAGE_PUBLIC_BASE_URL)
  if (publicBase && value.startsWith(`${publicBase}/`)) {
    const path = decodeURIComponent(value.slice(publicBase.length + 1).split(/[?#]/)[0])
    return path && !path.includes('..') ? { kind: 'bucket', path } : null
  }
  let url
  try {
    url = new URL(value)
  } catch {
    return null
  }
  const supabaseBase = trimBase(env?.VITE_SUPABASE_URL)
  if (supabaseBase && url.protocol === 'https:' && url.origin === new URL(supabaseBase).origin
    && url.pathname.startsWith(SUPABASE_CHAPTER_PREFIX)) {
    return { kind: 'fetch', url: `${url.origin}${url.pathname}` }
  }
  return null
}

async function readSource(source, env, fetchImpl) {
  if (source.kind === 'bucket') {
    const bucket = env?.CHAPTER_PAGES_BUCKET
    if (!bucket || typeof bucket.get !== 'function') throw new HttpError(503, 'Bölüm deposu kullanılamıyor.')
    const object = await bucket.get(source.path)
    if (!object?.body) throw new HttpError(404, 'Bölüm sayfası depoda bulunamadı.')
    if (Number(object.size) > STUDIO_RAW_MAX_BYTES) throw new HttpError(413, 'Bölüm sayfası 25 MB sınırını aşıyor.')
    return object.arrayBuffer()
  }
  const response = await fetchImpl(source.url, { redirect: 'error' })
  if (!response.ok) throw new HttpError(404, 'Bölüm sayfası okunamadı.')
  if (Number(response.headers.get('content-length')) > STUDIO_RAW_MAX_BYTES) throw new HttpError(413, 'Bölüm sayfası 25 MB sınırını aşıyor.')
  const buffer = await response.arrayBuffer()
  if (buffer.byteLength > STUDIO_RAW_MAX_BYTES) throw new HttpError(413, 'Bölüm sayfası 25 MB sınırını aşıyor.')
  return buffer
}

async function post(request, env, deps) {
  const { db, authUser } = await authenticate(request, env, deps.createClient)
  const bucket = requireBucket(env)
  const body = await readJson(request, ['page_id'], 512)
  const pageId = requireUuid(body.page_id, 'Sayfa kimliği')
  await (deps.assertUploadRateLimit ?? assertUploadRateLimit)({
    request, env, authContext: { authUser }, intent: 'translation-raw',
  })
  const { page, project } = await loadPageForUser(db, pageId)
  await requireStudioPermission(db, project.fansub_id, 'ceviri.proje')
  if (page.raw_status === 'ready') {
    return json({ pageId, width: page.width, height: page.height, reused: true })
  }
  const { data: ref, error } = await timed(db.rpc('tl_revision_import_ref', { p_page_id: pageId }))
  if (error) throw new HttpError(503, 'Kaynak sayfa okunamadı.')
  const source = resolveImportSource(ref, env)
  if (!source) throw new HttpError(422, 'Bu sayfa otomatik alınamadı; görseli elle yükle.')
  const buffer = await readSource(source, env, deps.fetch ?? fetch)
  const stored = await storeRawPage({ env, deps, bucket, page, buffer, fileName: page.file_name ?? null })
  return json(stored, 201)
}

export async function handleTranslationImport(request, env, deps = {}) {
  try {
    return await post(request, env, deps)
  } catch (error) {
    if (error instanceof StudioImageError) return json({ error: error.message }, error.status)
    return errorResponse(error)
  }
}

export const onRequestPost = ({ request, env }) => handleTranslationImport(request, env)
export const onRequest = () => methodNotAllowed('POST')
