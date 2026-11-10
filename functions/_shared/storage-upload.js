import { createClient } from '@supabase/supabase-js'
import { normalizeUploadFile } from './media-file-normalization'

const STORE_ASSET_SCHEME = 'store-assets://'
const CHAPTER_PAGE_SCHEME = 'chapter-pages://'
const PROFILE_BACKGROUND_SLOT_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'mp4', 'webm']
const PROFILE_EFFECT_ASSET_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const PROFILE_EFFECT_ANIMATED_MEDIA_MIME_TYPES = ['video/webm', 'video/mp4', 'image/png', 'image/webp', 'image/gif']
const STOREFRONT_VISUAL_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/webm']
const FANSUB_SUPPORTER_ASSET_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const STORAGE_LIMITS_MB = {
  chapterPage: 15,
  storeAsset: 10,
  profileBackground: 8,
}

const CACHE_CONTROL_PROFILES = {
  immutable: 'public, max-age=31536000, immutable',
  overwriteable: 'public, max-age=0, s-maxage=86400, stale-while-revalidate=60, must-revalidate',
}

class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.name = 'HttpError'
    this.status = status
  }
}

function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      'content-type': 'application/json; charset=UTF-8',
      ...(init.headers || {}),
    },
  })
}

function fail(status, message) {
  return json({ error: message }, { status })
}

function requireValue(value, message, status = 400) {
  if (!value) {
    throw new HttpError(status, message)
  }
  return value
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
    throw new HttpError(400, 'Bolum numarasi gecersiz.')
  }

  if (Number(trimmed) <= 0) {
    throw new HttpError(400, 'Bolum numarasi sifirdan buyuk olmalidir.')
  }

  return trimmed
}

function parseInteger(value, label, options = {}) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed)) {
    throw new HttpError(400, `${label} gecersiz.`)
  }

  if (typeof options.min === 'number' && parsed < options.min) {
    throw new HttpError(400, `${label} gecersiz.`)
  }

  if (typeof options.max === 'number' && parsed > options.max) {
    throw new HttpError(400, `${label} gecersiz.`)
  }

  return parsed
}

function getFileExtension(file) {
  const fromName = file.name.includes('.') ? file.name.split('.').pop() : null
  if (fromName && fromName.trim()) return fromName.toLowerCase()

  const mimeMap = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
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
    throw new HttpError(400, `${label} bulunamadi.`)
  }

  if (!allowedMimeTypes.includes(file.type)) {
    throw new HttpError(400, `${label} icin desteklenmeyen dosya tipi: ${file.type}`)
  }

  const maxBytes = maxSizeMb * 1024 * 1024
  if (file.size > maxBytes) {
    throw new HttpError(400, `${label} ${maxSizeMb}MB limitini asamaz.`)
  }
}

function assertRawFilePreflight(file, { maxSizeMb, label }) {
  if (!(file instanceof File)) {
    throw new HttpError(400, `${label} bulunamadi.`)
  }

  const maxBytes = maxSizeMb * 1024 * 1024
  if (file.size > maxBytes) {
    throw new HttpError(400, `${label} ${maxSizeMb}MB limitini asamaz.`)
  }
}

async function normalizeUploadFileWithinLimit(file, options) {
  assertRawFilePreflight(file, options)
  return normalizeUploadFile(file)
}

function createSupabaseUserClient(env, accessToken) {
  const supabaseUrl = requireValue(env.VITE_SUPABASE_URL, 'Supabase URL eksik.', 500)
  const supabaseAnonKey = requireValue(env.VITE_SUPABASE_ANON_KEY, 'Supabase anon key eksik.', 500)

  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  })
}

async function getAuthContext(request, env) {
  const authorization = request.headers.get('authorization') || ''
  const match = authorization.match(/^Bearer\s+(.+)$/i)
  if (!match?.[1]) {
    throw new HttpError(401, 'Kullanici oturumu bulunamadi.')
  }

  const accessToken = match[1].trim()
  if (!accessToken) {
    throw new HttpError(401, 'Kullanici oturumu bulunamadi.')
  }

  const supabase = createSupabaseUserClient(env, accessToken)
  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken)
  if (userError || !userData.user) {
    throw new HttpError(401, 'Kullanici oturumu dogrulanamadi.')
  }

  const { data: profilePayload, error: profileError } = await supabase
    .rpc('get_upload_auth_context')
  const profile = Array.isArray(profilePayload) ? profilePayload[0] : profilePayload

  if (profileError) {
    throw new HttpError(500, 'Kullanici profili okunamadi.')
  }

  if (!profile || profile.is_active === false) {
    throw new HttpError(403, 'Yukleme icin aktif profil bulunamadi.')
  }

  return {
    accessToken,
    authUser: userData.user,
    profile,
    supabase,
  }
}

function requireAdmin(authContext) {
  if (authContext.profile.role !== 'admin') {
    throw new HttpError(403, 'Bu yukleme islemi icin admin yetkisi gerekir.')
  }
}

function isPremiumProfileBackgroundAccessActive(value) {
  if (typeof value !== 'string' || !value.trim()) return false
  const expiresAt = new Date(value)
  if (Number.isNaN(expiresAt.getTime())) return false
  return expiresAt.getTime() > Date.now()
}

function requirePremiumProfileBackgroundAccess(authContext) {
  if (!isPremiumProfileBackgroundAccessActive(authContext.profile.premium_expires_at)) {
    throw new HttpError(403, 'Profil arka plani yuklemek icin premium gerekir.')
  }
}

async function requireFansubAdminAccess(authContext, fansubId, deniedMessage = 'Bu fansub icin yukleme yetkiniz yok.') {
  const normalizedFansubId = String(fansubId || '').trim()
  if (!normalizedFansubId) {
    throw new HttpError(400, 'Fansub bilgisi bulunamadi.')
  }

  if (authContext.profile.role === 'admin') {
    return normalizedFansubId
  }

  const { data: membership, error: membershipError } = await authContext.supabase
    .from('fansub_members')
    .select('role')
    .eq('fansub_id', normalizedFansubId)
    .eq('user_id', authContext.profile.id)
    .eq('role', 'admin')
    .limit(1)
    .maybeSingle()

  if (membershipError) {
    throw new HttpError(500, 'Fansub yetki kontrolu okunamadi.')
  }

  if (!membership) {
    throw new HttpError(403, deniedMessage)
  }

  return normalizedFansubId
}

async function requireFansubChapterWriteAccess(authContext, mangaId) {
  if (authContext.profile.role === 'admin') {
    return
  }

  const { data: manga, error: mangaError } = await authContext.supabase
    .from('mangas')
    .select('fansub_id')
    .eq('id', mangaId)
    .limit(1)
    .maybeSingle()

  if (mangaError) {
    throw new HttpError(500, 'Manga yetki kontrolu okunamadi.')
  }

  if (!manga?.fansub_id) {
    throw new HttpError(404, 'Bolum yukleme icin manga kaydi bulunamadi.')
  }

  const { data: membership, error: membershipError } = await authContext.supabase
    .from('fansub_members')
    .select('role')
    .eq('fansub_id', manga.fansub_id)
    .eq('user_id', authContext.profile.id)
    .eq('role', 'admin')
    .limit(1)
    .maybeSingle()

  if (membershipError) {
    throw new HttpError(500, 'Fansub yetki kontrolu okunamadi.')
  }

  if (!membership) {
    throw new HttpError(403, 'Bu manga icin bolum sayfasi yukleme yetkiniz yok.')
  }
}

async function putObject(bucket, objectPath, file, options = {}) {
  const cacheControl = options.cacheControl || CACHE_CONTROL_PROFILES.immutable

  await bucket.put(objectPath, await file.arrayBuffer(), {
    httpMetadata: {
      contentType: file.type || 'application/octet-stream',
      cacheControl,
    },
  })
}

function buildStoreAssetUploadPath(productType, productVariant, file) {
  const folderMap = {
    frame: 'frames',
    badge: 'badges',
    pattern: 'patterns',
    background: 'backgrounds',
    premium: 'premium',
    profile_effect: 'profile-effects',
  }

  const folder = folderMap[productType]
  if (!folder) {
    throw new HttpError(400, `Gecersiz urun tipi: ${productType}`)
  }

  if (productVariant === 'poster') {
    if (productType !== 'frame' && productType !== 'background') {
      throw new HttpError(400, 'Poster upload yalniz cerceve ve arkaplan urunlerinde desteklenir.')
    }

    return buildObjectPath(`${folder}/posters`, file)
  }

  const basePath = productType === 'frame' || productType === 'background' || productType === 'profile_effect'
    ? `${folder}/live`
    : folder
  return buildObjectPath(basePath, file)
}

function buildProfileEffectUploadPath(variant, file) {
  const allowedVariants = new Set([
    'modal-backdrop',
    'card-asset',
    'card-intro',
    'card-loop',
    'profile-asset',
    'profile-intro',
    'profile-loop',
    'hover-asset',
    'hover-intro',
    'hover-loop',
  ])
  if (!allowedVariants.has(variant)) {
    throw new HttpError(400, `Gecersiz profil effect varyanti: ${variant}`)
  }

  return buildObjectPath(`profile-effects/${variant}`, file)
}
function buildStorefrontUploadPath(targetKey, file) {
  const normalizedPath = String(targetKey || '')
    .split('/')
    .map((segment) => normalizeSegment(segment))
    .filter(Boolean)
    .join('/')

  const basePath = normalizedPath ? `storefront/${normalizedPath}` : 'storefront/misc'
  return buildObjectPath(basePath, file)
}

function buildChapterPageUploadPath(mangaId, chapterNumber, pageIndex, file) {
  const normalizedMangaId = normalizeSegment(mangaId) || 'unknown-manga'
  const chapterKey = `manga-${normalizedMangaId}/ch-${chapterNumber}`
  const pagePath = `${chapterKey}/page-${String(pageIndex + 1).padStart(3, '0')}`
  return buildObjectPath(pagePath, file)
}

function buildProfileBackgroundSlotStem(authUserId, slotIndex) {
  return `user-backgrounds/${normalizeSegment(authUserId) || 'unknown-user'}/slots/slot-${String(slotIndex + 1).padStart(2, '0')}`
}

function normalizeSupporterAssetShortcode(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 16)
}

function buildFansubSupporterAssetUploadPath(fansubId, assetKind, shortcode, file) {
  const normalizedAssetKind = assetKind === 'sticker' ? 'sticker' : 'emoji'
  const normalizedShortcode = normalizeSupporterAssetShortcode(shortcode) || 'asset'
  return buildObjectPath(
    `fansubs/${normalizeSegment(fansubId) || 'unknown-fansub'}/supporter-assets/${normalizedAssetKind}/${normalizedShortcode}`,
    file,
  )
}

function toStoreAssetRef(objectPath) {
  return `${STORE_ASSET_SCHEME}${objectPath}`
}

function toChapterPageRef(objectPath) {
  return `${CHAPTER_PAGE_SCHEME}${objectPath}`
}

async function handleUserProfileBackgroundUpload(authContext, env, formData) {
  const rawFile = requireValue(formData.get('file'), 'Profil arka plani dosyasi bulunamadi.')
  const file = (await normalizeUploadFileWithinLimit(rawFile, {
    maxSizeMb: STORAGE_LIMITS_MB.profileBackground,
    label: 'Profil arka plani',
  })).file
  const slotIndex = parseInteger(formData.get('slotIndex') || '0', 'Profil arka plani slot bilgisi', {
    min: 0,
    max: 9,
  })

  requirePremiumProfileBackgroundAccess(authContext)
  assertMimeAndSize(file, {
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'video/webm', 'video/mp4'],
    maxSizeMb: STORAGE_LIMITS_MB.profileBackground,
    label: 'Profil arka plani',
  })

  const slotStem = buildProfileBackgroundSlotStem(authContext.authUser.id, slotIndex)
  const staleObjectPaths = PROFILE_BACKGROUND_SLOT_EXTENSIONS.map((extension) => `${slotStem}.${extension}`)
  await env.STORE_ASSETS_BUCKET.delete(staleObjectPaths)

  const objectPath = `${slotStem}.${getFileExtension(file)}`
  await putObject(env.STORE_ASSETS_BUCKET, objectPath, file, { cacheControl: CACHE_CONTROL_PROFILES.overwriteable })

  return json({
    objectPath,
    assetRef: toStoreAssetRef(objectPath),
    publicUrl: resolvePublicUrl(env.VITE_STORE_ASSET_PUBLIC_BASE_URL, objectPath),
  })
}

async function handleFansubSupporterAssetUpload(authContext, env, formData) {
  const rawFile = requireValue(formData.get('file'), 'Supporter ifadesi dosyasi bulunamadi.')
  const assetKind = String(formData.get('assetKind') || '').trim().toLowerCase()
  const shortcode = String(formData.get('shortcode') || '').trim()

  if (assetKind !== 'emoji' && assetKind !== 'sticker') {
    throw new HttpError(400, 'Supporter ifade turu gecersiz.')
  }

  const supporterAssetLabel = assetKind === 'emoji' ? 'Supporter emojisi' : 'Supporter cikartmasi'
  const file = (await normalizeUploadFileWithinLimit(rawFile, {
    maxSizeMb: assetKind === 'emoji' ? 1 : 4,
    label: supporterAssetLabel,
  })).file
  const fansubId = await requireFansubAdminAccess(
    authContext,
    formData.get('fansubId'),
    'Bu fansub icin supporter ifadesi yukleme yetkiniz yok.',
  )

  const normalizedShortcode = normalizeSupporterAssetShortcode(shortcode)
  if (!/^[a-z0-9][a-z0-9_-]{1,15}$/.test(normalizedShortcode)) {
    throw new HttpError(400, 'Supporter ifade kisa kodu gecersiz.')
  }

  assertMimeAndSize(file, {
    allowedMimeTypes: FANSUB_SUPPORTER_ASSET_MIME_TYPES,
    maxSizeMb: assetKind === 'emoji' ? 1 : 4,
    label: assetKind === 'emoji' ? 'Supporter emojisi' : 'Supporter cikartmasi',
  })

  const objectPath = buildFansubSupporterAssetUploadPath(fansubId, assetKind, normalizedShortcode, file)
  await putObject(env.STORE_ASSETS_BUCKET, objectPath, file)

  return json({
    objectPath,
    assetRef: toStoreAssetRef(objectPath),
    publicUrl: resolvePublicUrl(env.VITE_STORE_ASSET_PUBLIC_BASE_URL, objectPath),
  })
}

async function handleStoreAssetUpload(authContext, env, formData) {
  requireAdmin(authContext)

  const rawFile = requireValue(formData.get('file'), 'Store asset dosyasi bulunamadi.')
  const file = (await normalizeUploadFileWithinLimit(rawFile, {
    maxSizeMb: STORAGE_LIMITS_MB.storeAsset,
    label: 'Store asset',
  })).file
  const productType = String(formData.get('productType') || '').trim()
  const productVariant = String(formData.get('productVariant') || 'live').trim()

  const allowedMimeTypesByProductType = {
    frame: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
    badge: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
    pattern: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
    background: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm'],
    premium: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
    profile_effect: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm'],
  }

  const posterAllowedMimeTypesByProductType = {
    frame: ['image/jpeg', 'image/png', 'image/webp'],
    background: ['image/jpeg', 'image/png', 'image/webp'],
  }

  if (productVariant === 'poster') {
    const posterMimeTypes = posterAllowedMimeTypesByProductType[productType]
    if (!posterMimeTypes) {
      throw new HttpError(400, 'Poster upload yalniz cerceve ve arkaplan urunlerinde desteklenir.')
    }

    assertMimeAndSize(file, {
      allowedMimeTypes: posterMimeTypes,
      maxSizeMb: STORAGE_LIMITS_MB.storeAsset,
      label: 'Poster asset',
    })
  } else {
    const allowedMimeTypes = allowedMimeTypesByProductType[productType]
    if (!allowedMimeTypes) {
      throw new HttpError(400, `Gecersiz urun tipi: ${productType}`)
    }

    assertMimeAndSize(file, {
      allowedMimeTypes,
      maxSizeMb: STORAGE_LIMITS_MB.storeAsset,
      label: 'Store asset',
    })
  }

  const objectPath = buildStoreAssetUploadPath(productType, productVariant, file)
  await putObject(env.STORE_ASSETS_BUCKET, objectPath, file)

  return json({
    objectPath,
    assetRef: toStoreAssetRef(objectPath),
    publicUrl: resolvePublicUrl(env.VITE_STORE_ASSET_PUBLIC_BASE_URL, objectPath),
  })
}

async function handleProfileEffectAssetUpload(authContext, env, formData) {
  requireAdmin(authContext)

  const rawFile = requireValue(formData.get('file'), 'Profil effect dosyasi bulunamadi.')
  const normalizedUpload = await normalizeUploadFileWithinLimit(rawFile, {
    maxSizeMb: STORAGE_LIMITS_MB.storeAsset,
    label: 'Profil effect medyasi',
  })
  const file = normalizedUpload.file
  const variant = String(formData.get('variant') || '').trim()
  const assetVariants = new Set(['modal-backdrop', 'card-asset', 'profile-asset', 'hover-asset'])
  const isAssetVariant = assetVariants.has(variant)
  const allowedMimeTypes = isAssetVariant
    ? PROFILE_EFFECT_ASSET_IMAGE_MIME_TYPES
    : PROFILE_EFFECT_ANIMATED_MEDIA_MIME_TYPES

  assertMimeAndSize(file, {
    allowedMimeTypes,
    maxSizeMb: STORAGE_LIMITS_MB.storeAsset,
    label: 'Profil effect medyasi',
  })

  if (isAssetVariant) {
    if (normalizedUpload.mediaKind !== 'static-image' && normalizedUpload.mediaKind !== 'animated-image') {
      throw new HttpError(400, "Profil effect asset'i icin desteklenmeyen dosya tipi: " + file.type)
    }
  } else if (!['video', 'animated-image', 'static-image'].includes(normalizedUpload.mediaKind)) {
    // A static transparent layer is also a valid effect; unknown types are still rejected.
    throw new HttpError(
      400,
      'Profil effect animasyonu icin desteklenmeyen dosya tipi: ' + file.type + '. Giris ve loop slotlari icin video ya da (animasyonlu) gorsel kullanin.',
    )
  }

  const objectPath = buildProfileEffectUploadPath(variant, file)
  await putObject(env.STORE_ASSETS_BUCKET, objectPath, file)

  return json({
    objectPath,
    assetRef: toStoreAssetRef(objectPath),
    publicUrl: resolvePublicUrl(env.VITE_STORE_ASSET_PUBLIC_BASE_URL, objectPath),
  })
}
async function handleStorefrontVisualUpload(authContext, env, formData) {
  requireAdmin(authContext)

  const rawFile = requireValue(formData.get('file'), 'Storefront gorseli bulunamadi.')
  const file = (await normalizeUploadFileWithinLimit(rawFile, {
    maxSizeMb: STORAGE_LIMITS_MB.storeAsset,
    label: 'Storefront gorseli',
  })).file
  const targetKey = String(formData.get('targetKey') || '').trim()

  assertMimeAndSize(file, {
    allowedMimeTypes: STOREFRONT_VISUAL_MIME_TYPES,
    maxSizeMb: STORAGE_LIMITS_MB.storeAsset,
    label: 'Storefront gorseli',
  })

  const objectPath = buildStorefrontUploadPath(targetKey, file)
  await putObject(env.STORE_ASSETS_BUCKET, objectPath, file)

  return json({
    objectPath,
    assetRef: toStoreAssetRef(objectPath),
    publicUrl: resolvePublicUrl(env.VITE_STORE_ASSET_PUBLIC_BASE_URL, objectPath),
  })
}

async function handleChapterPageUpload(authContext, env, formData) {
  const rawFile = requireValue(formData.get('file'), 'Bolum sayfasi dosyasi bulunamadi.')
  const file = (await normalizeUploadFileWithinLimit(rawFile, {
    maxSizeMb: STORAGE_LIMITS_MB.chapterPage,
    label: 'Bolum sayfasi',
  })).file
  const mangaId = String(formData.get('mangaId') || '').trim()
  const chapterNumber = normalizePositiveChapterNumber(formData.get('chapterNumber'))
  const pageIndex = parseInteger(formData.get('pageIndex'), 'Sayfa sirasi', { min: 0 })

  assertMimeAndSize(file, {
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxSizeMb: STORAGE_LIMITS_MB.chapterPage,
    label: 'Bolum sayfasi',
  })

  await requireFansubChapterWriteAccess(authContext, mangaId)

  const objectPath = buildChapterPageUploadPath(mangaId, chapterNumber, pageIndex, file)
  await putObject(env.CHAPTER_PAGES_BUCKET, objectPath, file)

  return json({
    objectPath,
    assetRef: toChapterPageRef(objectPath),
    publicUrl: resolvePublicUrl(env.VITE_CHAPTER_PAGE_PUBLIC_BASE_URL, objectPath),
  })
}

export async function handleStorageUpload(request, env) {
  try {
    const authContext = await getAuthContext(request, env)
    const formData = await request.formData()
    const intent = String(formData.get('intent') || '').trim()

    switch (intent) {
      case 'user-profile-background':
        return await handleUserProfileBackgroundUpload(authContext, env, formData)
      case 'fansub-supporter-asset':
        return await handleFansubSupporterAssetUpload(authContext, env, formData)
      case 'store-asset':
        return await handleStoreAssetUpload(authContext, env, formData)
      case 'profile-effect-asset':
        return await handleProfileEffectAssetUpload(authContext, env, formData)
      case 'storefront-visual':
        return await handleStorefrontVisualUpload(authContext, env, formData)
      case 'chapter-page':
        return await handleChapterPageUpload(authContext, env, formData)
      default:
        throw new HttpError(400, 'Gecersiz upload niyeti.')
    }
  } catch (error) {
    if (error instanceof HttpError) {
      return fail(error.status, error.message)
    }

    return fail(500, 'Cloudflare yukleme islemi tamamlanamadi.')
  }
}














