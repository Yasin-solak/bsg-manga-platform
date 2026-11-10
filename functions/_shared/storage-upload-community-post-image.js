import { normalizeUploadFile } from './media-file-normalization'

const STORE_ASSET_SCHEME = 'store-assets://'
const COMMUNITY_POST_IMAGE_LIMIT_MB = 8

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

function parseInteger(value, label, options = {}) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed)) {
    throw new UploadHttpError(400, `${label} gecersiz.`)
  }

  if (typeof options.min === 'number' && parsed < options.min) {
    throw new UploadHttpError(400, `${label} gecersiz.`)
  }

  if (typeof options.max === 'number' && parsed > options.max) {
    throw new UploadHttpError(400, `${label} gecersiz.`)
  }

  return parsed
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

function normalizePublicBaseUrl(value) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().replace(/\/+$/g, '')
  if (!trimmed || !/^https?:\/\//i.test(trimmed)) return null
  return trimmed
}

function encodePathForUrl(path) {
  return path
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/')
}

function resolvePublicUrl(baseUrl, objectPath) {
  const normalizedBaseUrl = normalizePublicBaseUrl(baseUrl)
  if (!normalizedBaseUrl) return null
  return `${normalizedBaseUrl}/${encodePathForUrl(objectPath)}`
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

function buildObjectPath(basePath, file) {
  const ext = getFileExtension(file)
  const token = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  return `${basePath}/${token}.${ext}`
}

function assertMimeAndSize(file, { allowedMimeTypes, maxSizeMb, label }) {
  if (!(file instanceof File)) {
    throw new UploadHttpError(400, `${label} bulunamadi.`)
  }

  if (!allowedMimeTypes.includes(file.type)) {
    throw new UploadHttpError(400, `${label} icin desteklenmeyen dosya tipi: ${file.type}`)
  }

  const maxBytes = maxSizeMb * 1024 * 1024
  if (file.size > maxBytes) {
    throw new UploadHttpError(400, `${label} ${maxSizeMb}MB limitini asamaz.`)
  }
}

function assertRawFilePreflight(file, { maxSizeMb, label }) {
  if (!(file instanceof File)) {
    throw new UploadHttpError(400, `${label} bulunamadi.`)
  }

  const maxBytes = maxSizeMb * 1024 * 1024
  if (file.size > maxBytes) {
    throw new UploadHttpError(400, `${label} ${maxSizeMb}MB limitini asamaz.`)
  }
}

async function normalizeUploadFileWithinLimit(file, options) {
  assertRawFilePreflight(file, options)
  return normalizeUploadFile(file)
}

function toStoreAssetRef(objectPath) {
  return `${STORE_ASSET_SCHEME}${objectPath}`
}

async function putObject(bucket, objectPath, file) {
  await bucket.put(objectPath, await file.arrayBuffer(), {
    httpMetadata: {
      contentType: file.type || 'application/octet-stream',
      cacheControl: 'public, max-age=31536000, immutable',
    },
  })
}

async function requireCommunityPostMediaWriteAccess(authContext, postId) {
  const normalizedPostId = String(postId || '').trim()
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(normalizedPostId)) {
    throw new UploadHttpError(400, 'Topluluk gonderisi bilgisi gecersiz.')
  }

  const { data: post, error } = await authContext.supabase
    .from('community_posts')
    .select('id, author_id, status, is_active')
    .eq('id', normalizedPostId)
    .limit(1)
    .maybeSingle()

  if (error) {
    throw new UploadHttpError(500, 'Topluluk gonderisi yetki kontrolu okunamadi.')
  }

  if (!post || post.is_active === false) {
    throw new UploadHttpError(404, 'Topluluk gonderisi bulunamadi.')
  }

  if (authContext.profile.role === 'admin') {
    return normalizedPostId
  }

  if (post.author_id !== authContext.profile.id) {
    throw new UploadHttpError(403, 'Bu gonderi icin gorsel yukleme yetkiniz yok.')
  }

  if (post.status !== 'pending') {
    throw new UploadHttpError(403, 'Gorsel yukleme yalniz inceleme asamasindaki gonderilerde yapilabilir.')
  }

  return normalizedPostId
}

function buildCommunityPostImageUploadPath(userId, postId, position, file) {
  const normalizedUserId = normalizeSegment(userId) || 'unknown-user'
  const normalizedPostId = normalizeSegment(postId) || 'unknown-post'
  const slotKey = `slot-${String(position).padStart(2, '0')}`
  return buildObjectPath(`community/posts/${normalizedUserId}/${normalizedPostId}/${slotKey}`, file)
}

export async function handleCommunityPostImageUpload(authContext, env, formData) {
  const rawFile = requireValue(formData.get('file'), 'Topluluk gorseli bulunamadi.')
  const file = (await normalizeUploadFileWithinLimit(rawFile, {
    maxSizeMb: COMMUNITY_POST_IMAGE_LIMIT_MB,
    label: 'Topluluk gorseli',
  })).file
  const postId = await requireCommunityPostMediaWriteAccess(authContext, formData.get('postId'))
  const position = parseInteger(formData.get('position') || '1', 'Gorsel sirasi', {
    min: 1,
    max: 4,
  })

  assertMimeAndSize(file, {
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxSizeMb: COMMUNITY_POST_IMAGE_LIMIT_MB,
    label: 'Topluluk gorseli',
  })

  const objectPath = buildCommunityPostImageUploadPath(authContext.profile.id, postId, position, file)
  await putObject(env.STORE_ASSETS_BUCKET, objectPath, file)

  return new Response(JSON.stringify({
    objectPath,
    assetRef: toStoreAssetRef(objectPath),
    publicUrl: resolvePublicUrl(env.VITE_STORE_ASSET_PUBLIC_BASE_URL, objectPath),
  }), {
    headers: {
      'content-type': 'application/json; charset=UTF-8',
    },
  })
}
