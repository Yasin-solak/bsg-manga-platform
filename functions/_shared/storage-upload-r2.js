import { createClient } from '@supabase/supabase-js'
import { assertUploadRateLimit, assertUploadReplayGuard, markUploadReplayGuard } from './upload-rate-limit'
import { handleChapterPageUpload } from './storage-upload-chapter-page'
import { handleCommunityPostImageUpload } from './storage-upload-community-post-image'
import { handleAnnouncementImageUpload } from './storage-upload-announcement-image'
import { normalizeUploadFile } from './media-file-normalization'

const STORE_ASSET_SCHEME = 'store-assets://'
const PROFILE_BACKGROUND_SLOT_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'mp4', 'webm']
const AVATAR_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif']
const MANGA_COVER_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp']
const FANSUB_SUPPORTER_ASSET_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const PROFILE_EFFECT_ASSET_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const PROFILE_EFFECT_ANIMATED_MEDIA_MIME_TYPES = ['video/webm', 'video/mp4', 'image/png', 'image/webp', 'image/gif']
const STOREFRONT_VISUAL_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/webm']
const STORAGE_LIMITS_MB = {
  avatar: 2,
  mangaCover: 10,
  profileBackground: 8,
  storeAsset: 10,
}

const CACHE_CONTROL_PROFILES = {
  immutable: 'public, max-age=31536000, immutable',
  // Neden: overwrite edilen tekil medya URL'leri (avatar/cover/background slot)
  // tarayicida aninda revalidate olurken edge cache sicak kalmalidir.
  overwriteable: 'public, max-age=0, s-maxage=86400, stale-while-revalidate=60, must-revalidate',
}

class HttpError extends Error {
  constructor(status, message, options = {}) {
    super(message)
    this.name = 'HttpError'
    this.status = status
    this.headers = options.headers || {}
  }
}

function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      'cache-control': 'no-store',
      'content-type': 'application/json; charset=UTF-8',
      'referrer-policy': 'strict-origin-when-cross-origin',
      'x-content-type-options': 'nosniff',
      ...(init.headers || {}),
    },
  })
}

function fail(status, message, headers = {}) {
  return json({ error: message }, { status, headers })
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

function resolveRequestClientIp(request) {
  const forwardedIp = request.headers.get('cf-connecting-ip')
    || request.headers.get('x-forwarded-for')
    || request.headers.get('x-real-ip')
  if (!forwardedIp) return 'unknown-ip'
  return forwardedIp.split(',')[0].trim() || 'unknown-ip'
}
function buildUploadReplayFingerprint(formData, intent, authContext, request) {
  const file = formData.get('file')
  const fileName = file instanceof File ? String(file.name || '').trim().toLowerCase() : 'missing-file'
  const fileType = file instanceof File ? String(file.type || '').trim().toLowerCase() : 'unknown-type'
  const fileSize = file instanceof File ? String(file.size || 0) : '0'
  return [
    authContext?.authUser?.id || 'unknown-user',
    resolveRequestClientIp(request),
    intent,
    String(formData.get('fansubId') || '').trim(),
    String(formData.get('mangaId') || '').trim(),
    String(formData.get('draftKey') || '').trim(),
    String(formData.get('postId') || '').trim(),
    String(formData.get('announcementId') || '').trim(),
    String(formData.get('position') || '').trim(),
    String(formData.get('slotIndex') || '').trim(),
    String(formData.get('chapterNumber') || '').trim(),
    String(formData.get('pageIndex') || '').trim(),
    String(formData.get('productType') || '').trim(),
    String(formData.get('productVariant') || '').trim(),
    String(formData.get('variant') || '').trim(),
    String(formData.get('targetKey') || '').trim(),
    fileName,
    fileType,
    fileSize,
  ].join('|')
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

function buildDeterministicObjectPath(basePath, file) {
  return `${basePath}.${getFileExtension(file)}`
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

async function requireFansubBoostBackgroundUploadAccess(authContext, fansubId, file) {
  const mediaType = String(file?.type || '').toLowerCase().startsWith('video/') ? 'video' : 'image'
  const { data, error } = await authContext.supabase.rpc('get_public_fansub_boost_snapshot', {
    p_fansub_id: fansubId,
  })

  if (error) {
    throw new HttpError(500, 'Fansub boost yetkisi okunamadi.')
  }

  const snapshot = Array.isArray(data) ? data[0] : data
  const capabilities = snapshot && typeof snapshot.capabilities === 'object' ? snapshot.capabilities : {}
  const canUploadStaticBackground = capabilities.canUploadStaticBackground === true
  const canUploadVideoBackground = capabilities.canUploadVideoBackground === true

  if (mediaType === 'video' && !canUploadVideoBackground) {
    throw new HttpError(403, 'Video fansub arka plani icin en az Seviye 2 boost gerekir.')
  }

  if (mediaType === 'image' && !canUploadStaticBackground) {
    throw new HttpError(403, 'Fansub arka plani yuklemek icin en az Seviye 1 boost gerekir.')
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

async function clearObjectVariants(bucket, objectStem, extensions) {
  await bucket.delete(
    extensions.map((extension) => `${objectStem}.${extension}`),
  )
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

function buildProfileBackgroundSlotStem(authUserId, slotIndex) {
  return `user-backgrounds/${normalizeSegment(authUserId) || 'unknown-user'}/slots/slot-${String(slotIndex + 1).padStart(2, '0')}`
}

function buildFansubProfileBackgroundSlotStem(fansubId, slotIndex) {
  return `fansubs/${normalizeSegment(fansubId) || 'unknown-fansub'}/backgrounds/slots/slot-${String(slotIndex + 1).padStart(2, '0')}`
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

function buildUserAvatarObjectStem(authUserId) {
  return `users/${normalizeSegment(authUserId) || 'unknown-user'}/avatar`
}

function buildDraftFansubAvatarObjectStem(authUserId) {
  return `fansub-drafts/${normalizeSegment(authUserId) || 'unknown-user'}/avatar`
}

function buildFansubAvatarObjectStem(fansubId) {
  return `fansubs/${normalizeSegment(fansubId) || 'unknown-fansub'}/avatar`
}

function buildMangaCoverObjectStem({ fansubId, mangaId, draftKey }) {
  const normalizedFansubId = normalizeSegment(fansubId) || 'unknown-fansub'
  if (mangaId) {
    return `fansubs/${normalizedFansubId}/mangas/${normalizeSegment(mangaId) || 'unknown-manga'}/cover`
  }

  const normalizedDraftKey = normalizeSegment(draftKey) || 'untitled'
  return `fansubs/${normalizedFansubId}/manga-drafts/${normalizedDraftKey}/cover`
}

function toStoreAssetRef(objectPath) {
  return `${STORE_ASSET_SCHEME}${objectPath}`
}

async function handleUserAvatarUpload(authContext, env, formData) {
  const rawFile = requireValue(formData.get('file'), 'Kullanici avatar dosyasi bulunamadi.')
  const file = (await normalizeUploadFileWithinLimit(rawFile, {
    maxSizeMb: STORAGE_LIMITS_MB.avatar,
    label: 'Kullanici avatari',
  })).file

  assertMimeAndSize(file, {
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
    maxSizeMb: STORAGE_LIMITS_MB.avatar,
    label: 'Kullanici avatari',
  })

  const objectStem = buildUserAvatarObjectStem(authContext.authUser.id)
  await clearObjectVariants(env.AVATARS_BUCKET, objectStem, AVATAR_EXTENSIONS)

  const objectPath = buildDeterministicObjectPath(objectStem, file)
  await putObject(env.AVATARS_BUCKET, objectPath, file, { cacheControl: CACHE_CONTROL_PROFILES.overwriteable })

  return json({
    objectPath,
    publicUrl: resolvePublicUrl(env.VITE_AVATAR_PUBLIC_BASE_URL, objectPath),
  })
}

async function handleDraftFansubAvatarUpload(authContext, env, formData) {
  const rawFile = requireValue(formData.get('file'), 'Fansub avatar dosyasi bulunamadi.')
  const file = (await normalizeUploadFileWithinLimit(rawFile, {
    maxSizeMb: STORAGE_LIMITS_MB.avatar,
    label: 'Fansub avatari',
  })).file

  assertMimeAndSize(file, {
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
    maxSizeMb: STORAGE_LIMITS_MB.avatar,
    label: 'Fansub avatari',
  })

  const objectStem = buildDraftFansubAvatarObjectStem(authContext.authUser.id)
  await clearObjectVariants(env.AVATARS_BUCKET, objectStem, AVATAR_EXTENSIONS)

  const objectPath = buildDeterministicObjectPath(objectStem, file)
  await putObject(env.AVATARS_BUCKET, objectPath, file, { cacheControl: CACHE_CONTROL_PROFILES.overwriteable })

  return json({
    objectPath,
    publicUrl: resolvePublicUrl(env.VITE_AVATAR_PUBLIC_BASE_URL, objectPath),
  })
}

async function handleFansubAvatarUpload(authContext, env, formData) {
  const rawFile = requireValue(formData.get('file'), 'Fansub avatar dosyasi bulunamadi.')
  const file = (await normalizeUploadFileWithinLimit(rawFile, {
    maxSizeMb: STORAGE_LIMITS_MB.avatar,
    label: 'Fansub avatari',
  })).file
  const fansubId = await requireFansubAdminAccess(
    authContext,
    formData.get('fansubId'),
    'Bu fansub icin avatar yukleme yetkiniz yok.',
  )

  assertMimeAndSize(file, {
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
    maxSizeMb: STORAGE_LIMITS_MB.avatar,
    label: 'Fansub avatari',
  })

  const objectStem = buildFansubAvatarObjectStem(fansubId)
  await clearObjectVariants(env.AVATARS_BUCKET, objectStem, AVATAR_EXTENSIONS)

  const objectPath = buildDeterministicObjectPath(objectStem, file)
  await putObject(env.AVATARS_BUCKET, objectPath, file, { cacheControl: CACHE_CONTROL_PROFILES.overwriteable })

  return json({
    objectPath,
    publicUrl: resolvePublicUrl(env.VITE_AVATAR_PUBLIC_BASE_URL, objectPath),
  })
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
  await clearObjectVariants(env.STORE_ASSETS_BUCKET, slotStem, PROFILE_BACKGROUND_SLOT_EXTENSIONS)

  const objectPath = buildDeterministicObjectPath(slotStem, file)
  await putObject(env.STORE_ASSETS_BUCKET, objectPath, file, { cacheControl: CACHE_CONTROL_PROFILES.overwriteable })

  return json({
    objectPath,
    assetRef: toStoreAssetRef(objectPath),
    publicUrl: resolvePublicUrl(env.VITE_STORE_ASSET_PUBLIC_BASE_URL, objectPath),
  })
}

async function handleFansubProfileBackgroundUpload(authContext, env, formData) {
  const rawFile = requireValue(formData.get('file'), 'Fansub arka plani dosyasi bulunamadi.')
  const file = (await normalizeUploadFileWithinLimit(rawFile, {
    maxSizeMb: STORAGE_LIMITS_MB.profileBackground,
    label: 'Fansub arka plani',
  })).file
  const fansubId = await requireFansubAdminAccess(
    authContext,
    formData.get('fansubId'),
    'Bu fansub icin arka plan yukleme yetkiniz yok.',
  )
  const slotIndex = parseInteger(formData.get('slotIndex') || '0', 'Fansub arka plani slot bilgisi', {
    min: 0,
    max: 9,
  })

  assertMimeAndSize(file, {
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'video/webm', 'video/mp4'],
    maxSizeMb: STORAGE_LIMITS_MB.profileBackground,
    label: 'Fansub arka plani',
  })

  await requireFansubBoostBackgroundUploadAccess(authContext, fansubId, file)

  const slotStem = buildFansubProfileBackgroundSlotStem(fansubId, slotIndex)
  await clearObjectVariants(env.STORE_ASSETS_BUCKET, slotStem, PROFILE_BACKGROUND_SLOT_EXTENSIONS)

  const objectPath = buildDeterministicObjectPath(slotStem, file)
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

async function handleMangaCoverUpload(authContext, env, formData) {
  const rawFile = requireValue(formData.get('file'), 'Manga kapak dosyasi bulunamadi.')
  const file = (await normalizeUploadFileWithinLimit(rawFile, {
    maxSizeMb: STORAGE_LIMITS_MB.mangaCover,
    label: 'Manga kapagi',
  })).file
  const fansubId = await requireFansubAdminAccess(
    authContext,
    formData.get('fansubId'),
    'Bu fansub icin manga kapagi yukleme yetkiniz yok.',
  )
  const mangaId = String(formData.get('mangaId') || '').trim()
  const draftKey = String(formData.get('draftKey') || '').trim()

  if (!mangaId && !draftKey) {
    throw new HttpError(400, 'Manga kapagi icin manga veya taslak bilgisi bulunamadi.')
  }

  assertMimeAndSize(file, {
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxSizeMb: STORAGE_LIMITS_MB.mangaCover,
    label: 'Manga kapagi',
  })

  const objectStem = buildMangaCoverObjectStem({ fansubId, mangaId, draftKey })
  await clearObjectVariants(env.MANGA_COVERS_BUCKET, objectStem, MANGA_COVER_EXTENSIONS)

  const objectPath = buildDeterministicObjectPath(objectStem, file)
  await putObject(env.MANGA_COVERS_BUCKET, objectPath, file, { cacheControl: CACHE_CONTROL_PROFILES.overwriteable })

  return json({
    objectPath,
    publicUrl: resolvePublicUrl(env.VITE_MANGA_COVER_PUBLIC_BASE_URL, objectPath),
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

// Sezonluk etkinlik banner'i: admin-only, store-assets R2 bucket'inda 'event-banners/' altina.
async function handleEventBannerUpload(authContext, env, formData) {
  requireAdmin(authContext)

  const rawFile = requireValue(formData.get('file'), 'Etkinlik banner dosyasi bulunamadi.')
  const file = (await normalizeUploadFileWithinLimit(rawFile, {
    maxSizeMb: STORAGE_LIMITS_MB.storeAsset,
    label: 'Etkinlik banner',
  })).file

  assertMimeAndSize(file, {
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
    maxSizeMb: STORAGE_LIMITS_MB.storeAsset,
    label: 'Etkinlik banner',
  })

  const objectPath = buildObjectPath('event-banners', file)
  await putObject(env.STORE_ASSETS_BUCKET, objectPath, file)

  return json({
    objectPath,
    assetRef: toStoreAssetRef(objectPath),
    publicUrl: resolvePublicUrl(env.VITE_STORE_ASSET_PUBLIC_BASE_URL, objectPath),
  })
}

export async function handleStorageUpload(request, env) {
  try {
    const authContext = await getAuthContext(request, env)
    const formData = await request.formData()
    const intent = String(formData.get('intent') || '').trim()
    const replayFingerprint = buildUploadReplayFingerprint(formData, intent, authContext, request)

    await assertUploadRateLimit({ request, env, authContext, intent })
    await assertUploadReplayGuard({ env, intent, target: replayFingerprint })

    let response
    switch (intent) {
      case 'announcement-image':
        response = await handleAnnouncementImageUpload(authContext, env, formData)
        break
      case 'user-avatar':
        response = await handleUserAvatarUpload(authContext, env, formData)
        break
      case 'draft-fansub-avatar':
        response = await handleDraftFansubAvatarUpload(authContext, env, formData)
        break
      case 'fansub-avatar':
        response = await handleFansubAvatarUpload(authContext, env, formData)
        break
      case 'user-profile-background':
        response = await handleUserProfileBackgroundUpload(authContext, env, formData)
        break
      case 'fansub-profile-background':
        response = await handleFansubProfileBackgroundUpload(authContext, env, formData)
        break
      case 'fansub-supporter-asset':
        response = await handleFansubSupporterAssetUpload(authContext, env, formData)
        break
      case 'manga-cover':
        response = await handleMangaCoverUpload(authContext, env, formData)
        break
      case 'store-asset':
        response = await handleStoreAssetUpload(authContext, env, formData)
        break
      case 'profile-effect-asset':
        response = await handleProfileEffectAssetUpload(authContext, env, formData)
        break
      case 'storefront-visual':
        response = await handleStorefrontVisualUpload(authContext, env, formData)
        break
      case 'event-banner':
        response = await handleEventBannerUpload(authContext, env, formData)
        break
      case 'chapter-page':
        response = await handleChapterPageUpload(authContext, env, formData)
        break
      case 'community-post-image':
        response = await handleCommunityPostImageUpload(authContext, env, formData)
        break
      default:
        throw new HttpError(400, 'Gecersiz upload niyeti.')
    }

    if (response instanceof Response && response.ok) {
      await markUploadReplayGuard({ env, intent, target: replayFingerprint })
    }

    return response
  } catch (error) {
    if (error instanceof HttpError || (error && typeof error.status === 'number')) {
      return fail(error.status, error.message, error.headers)
    }

    return fail(500, 'Cloudflare yukleme islemi tamamlanamadi.')
  }
}
