import { normalizeUploadFile } from './media-file-normalization'

const CHAPTER_PAGE_SCHEME = 'chapter-pages://'
const CHAPTER_PAGE_LIMIT_MB = 15

class UploadHttpError extends Error {
  constructor(status, message) {
    super(message)
    this.name = 'UploadHttpError'
    this.status = status
  }
}

function requireValue(value, message, status = 400) {
  if (!value) {
    throw new UploadHttpError(status, message)
  }
  return value
}

function normalizeSegment(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)
}

function normalizePositiveChapterNumber(value) {
  const trimmed = String(value || '').trim()
  if (!/^\d+(?:\.\d{1,2})?$/.test(trimmed)) {
    throw new UploadHttpError(400, 'Bolum numarasi gecersiz.')
  }

  if (Number(trimmed) <= 0) {
    throw new UploadHttpError(400, 'Bolum numarasi sifirdan buyuk olmalidir.')
  }

  return trimmed
}

function parseInteger(value, label, options = {}) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed)) {
    throw new UploadHttpError(400, `${label} gecersiz.`)
  }

  if (typeof options.min === 'number' && parsed < options.min) {
    throw new UploadHttpError(400, `${label} gecersiz.`)
  }

  return parsed
}

function normalizePublicBaseUrl(value) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().replace(/\/+$/g, '')
  if (!trimmed || !/^https?:\/\//i.test(trimmed)) return null
  return trimmed
}

function resolvePublicUrl(baseUrl, objectPath) {
  const normalizedBaseUrl = normalizePublicBaseUrl(baseUrl)
  if (!normalizedBaseUrl) return null
  const encodedPath = objectPath
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/')
  return `${normalizedBaseUrl}/${encodedPath}`
}

function getFileExtension(file) {
  const fromName = file.name.includes('.') ? file.name.split('.').pop() : null
  if (fromName && fromName.trim()) return fromName.toLowerCase()

  const mimeMap = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
  }
  return mimeMap[file.type] || 'bin'
}

function assertMimeAndSize(file) {
  if (!(file instanceof File)) {
    throw new UploadHttpError(400, 'Bolum sayfasi bulunamadi.')
  }

  const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp']
  if (!allowedMimeTypes.includes(file.type)) {
    throw new UploadHttpError(400, `Bolum sayfasi icin desteklenmeyen dosya tipi: ${file.type}`)
  }

  const maxBytes = CHAPTER_PAGE_LIMIT_MB * 1024 * 1024
  if (file.size > maxBytes) {
    throw new UploadHttpError(400, `Bolum sayfasi ${CHAPTER_PAGE_LIMIT_MB}MB limitini asamaz.`)
  }
}

function assertRawFilePreflight(file) {
  if (!(file instanceof File)) {
    throw new UploadHttpError(400, 'Bolum sayfasi bulunamadi.')
  }

  const maxBytes = CHAPTER_PAGE_LIMIT_MB * 1024 * 1024
  if (file.size > maxBytes) {
    throw new UploadHttpError(400, `Bolum sayfasi ${CHAPTER_PAGE_LIMIT_MB}MB limitini asamaz.`)
  }
}

async function normalizeUploadFileWithinLimit(file) {
  assertRawFilePreflight(file)
  return normalizeUploadFile(file)
}

async function requireFansubAdminMembership(authContext, fansubId, deniedMessage) {
  const { data: membership, error: membershipError } = await authContext.supabase
    .from('fansub_members')
    .select('role')
    .eq('fansub_id', fansubId)
    .eq('user_id', authContext.profile.id)
    .eq('role', 'admin')
    .limit(1)
    .maybeSingle()

  if (membershipError) {
    throw new UploadHttpError(500, 'Fansub yetki kontrolu okunamadi.')
  }

  if (!membership) {
    throw new UploadHttpError(403, deniedMessage)
  }
}

async function requireFansubChapterWriteAccess(authContext, mangaId, fansubId) {
  // A site admin can upload chapters to any manga: same bypass as
  // requireFansubAdminAccess in storage-upload-r2.js.
  if (authContext.profile.role === 'admin') {
    return
  }

  // Multi-fansub version model: chapters belong to the uploading fansub
  // (chapters unique manga_id+chapter_number+fansub_id, DB insert policy
  // is_fansub_admin(chapters.fansub_id)). So permission depends on being admin of the
  // UPLOADING fansub, NOT the manga's owner: each fansub can upload its own
  // translation of any manga, and the reader picks a version on the manga page.
  if (fansubId) {
    // A member granted the "Publish" permission in the Translation Studio (Roles and Permissions) can also
    // publish chapters; the DB insert policy accepts the same permission and the chapter opens without approval.
    const { data: canPublish, error: permissionError } = await authContext.supabase
      .rpc('fansub_can', { p_fansub_id: fansubId, p_permission: 'ceviri.yayinla' })
    if (!permissionError && canPublish === true) {
      return
    }
    await requireFansubAdminMembership(
      authContext,
      fansubId,
      'Bu fansub adina bolum sayfasi yukleme yetkiniz yok.',
    )
    return
  }

  // Backward compatibility: old client bundles do not send fansubId; they keep the
  // old behavior (admin of the fansub that owns the manga).
  const { data: manga, error: mangaError } = await authContext.supabase
    .from('mangas')
    .select('fansub_id')
    .eq('id', mangaId)
    .limit(1)
    .maybeSingle()

  if (mangaError) {
    throw new UploadHttpError(500, 'Manga yetki kontrolu okunamadi.')
  }

  if (!manga?.fansub_id) {
    throw new UploadHttpError(404, 'Bolum yukleme icin manga kaydi bulunamadi.')
  }

  await requireFansubAdminMembership(
    authContext,
    manga.fansub_id,
    'Bu manga icin bolum sayfasi yukleme yetkiniz yok.',
  )
}

function buildChapterPageUploadPath(mangaId, chapterNumber, pageIndex, file) {
  const normalizedMangaId = normalizeSegment(mangaId) || 'unknown-manga'
  const chapterKey = `manga-${normalizedMangaId}/ch-${chapterNumber}`
  const pagePath = `${chapterKey}/page-${String(pageIndex + 1).padStart(3, '0')}`
  return `${pagePath}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${getFileExtension(file)}`
}

function toChapterPageRef(objectPath) {
  return `${CHAPTER_PAGE_SCHEME}${objectPath}`
}

async function putObject(bucket, objectPath, file) {
  await bucket.put(objectPath, await file.arrayBuffer(), {
    httpMetadata: {
      contentType: file.type || 'application/octet-stream',
      cacheControl: 'public, max-age=31536000, immutable',
    },
  })
}

export async function handleChapterPageUpload(authContext, env, formData) {
  const rawFile = requireValue(formData.get('file'), 'Bolum sayfasi dosyasi bulunamadi.')
  const file = (await normalizeUploadFileWithinLimit(rawFile)).file
  const mangaId = requireValue(formData.get('mangaId'), 'Manga bilgisi eksik.')
  const chapterNumber = normalizePositiveChapterNumber(formData.get('chapterNumber'))
  const pageIndex = parseInteger(formData.get('pageIndex'), 'Sayfa sirasi', { min: 0 })
  const fansubId = String(formData.get('fansubId') || '').trim() || null

  assertMimeAndSize(file)
  await requireFansubChapterWriteAccess(authContext, mangaId, fansubId)

  const objectPath = buildChapterPageUploadPath(mangaId, chapterNumber, pageIndex, file)
  await putObject(env.CHAPTER_PAGES_BUCKET, objectPath, file)

  return new Response(JSON.stringify({
    objectPath,
    assetRef: toChapterPageRef(objectPath),
    publicUrl: resolvePublicUrl(env.VITE_CHAPTER_PAGE_PUBLIC_BASE_URL, objectPath),
  }), {
    headers: {
      'content-type': 'application/json; charset=UTF-8',
    },
  })
}
