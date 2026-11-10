import { toChapterPageRef, toStoreAssetRef } from '@/services/assetUrlService'
import type { StoreProfileEffectMediaMeta } from '@/data/storeProducts'
import { buildProfileEffectMediaMetaPatchFromFile } from '@/services/profileEffectMediaMeta'
import { supabase } from '@/services/supabase'
import { convertToWebP } from '@/utils/webpConverter'

import { canUseCloudflareStorageUpload, uploadFileViaCloudflareStorage } from './cloudflareUploadClient'
import { isAnimatedImageFile, normalizeUploadFile } from './mediaFileNormalization'
import { assertFileAllowed, getFileExtension, normalizeSegment, STORAGE_TARGETS, uploadPublicFile } from './shared'

const PROFILE_BACKGROUND_SLOT_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'mp4', 'webm'] as const
const PROFILE_BACKGROUND_MAX_SLOT_COUNT = 10
const FANSUB_BACKGROUND_MAX_SLOT_COUNT = 10

type MangaCoverUploadOptions = {
    fansubId?: string | null
    mangaId?: string | null
    draftKey?: string | null
}

type FansubAvatarUploadOptions = {
    fansubId?: string | null
}

type FansubSupporterAssetUploadOptions = {
    fansubId: string
    assetKind: 'emoji' | 'sticker'
    shortcode: string
}

type CommunityPostImageUploadOptions = {
    postId: string
    position: number
}

export interface FansubSupporterAssetUploadResult {
    assetRef: string
    uploadedFile: File
}

export interface CommunityPostImageUploadResult {
    assetRef: string
    objectPath: string
    publicUrl?: string
    uploadedFile: File
    width: number
    height: number
}

export interface ChapterPageUploadResult {
    ref: string
    /** 0 if unreadable; the caller skips this record. */
    width: number
    height: number
}

type UploadProgressHandler = (progress: number) => void

const COMMUNITY_POST_IMAGE_ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const COMMUNITY_POST_IMAGE_MAX_BYTES = 8 * 1024 * 1024

function requireCloudflarePublicUrl(publicUrl: string | undefined, label: string) {
    const normalizedPublicUrl = publicUrl?.trim()
    if (!normalizedPublicUrl) {
        throw new Error(`${label} icin Cloudflare public URL olusturulamadi.`)
    }
    return normalizedPublicUrl
}

async function prepareUploadFile(file: File): Promise<File> {
    const normalized = await normalizeUploadFile(file)
    return normalized.file
}

function assertCommunityPostImageAllowed(file: File) {
    if (!COMMUNITY_POST_IMAGE_ALLOWED_MIME_TYPES.includes(file.type)) {
        throw new Error(`Topluluk gorseli icin desteklenmeyen dosya tipi: ${file.type}`)
    }

    if (file.size > COMMUNITY_POST_IMAGE_MAX_BYTES) {
        throw new Error('Topluluk gorseli 8MB limitini asamaz.')
    }
}

function buildCommunityPostImageFallbackPath(postId: string, position: number) {
    const normalizedPostId = normalizeSegment(postId) || 'unknown-post'
    return `community/posts/${normalizedPostId}/slot-${String(position).padStart(2, '0')}`
}

async function readImageDimensions(file: File): Promise<{ width: number; height: number }> {
    if (typeof window === 'undefined' || typeof URL === 'undefined') {
        return { width: 0, height: 0 }
    }

    const objectUrl = URL.createObjectURL(file)
    try {
        return await new Promise((resolve) => {
            const image = new Image()
            image.onload = () => resolve({
                width: image.naturalWidth || 0,
                height: image.naturalHeight || 0,
            })
            image.onerror = () => resolve({ width: 0, height: 0 })
            image.src = objectUrl
        })
    } finally {
        URL.revokeObjectURL(objectUrl)
    }
}

async function requireCurrentAuthUserIdForStoragePath(): Promise<string> {
    const { data, error } = await supabase.auth.getUser()
    const authUserId = data.user?.id?.trim()
    if (error || !authUserId) {
        throw new Error('Yukleme yolu icin kullanici oturumu dogrulanamadi.')
    }

    return normalizeSegment(authUserId) || authUserId
}

function buildMangaCoverFallbackBasePath(options: MangaCoverUploadOptions): string {
    const normalizedFansubId = normalizeSegment(options.fansubId || '')
    if (!normalizedFansubId) return 'covers'

    const normalizedMangaId = normalizeSegment(options.mangaId || '')
    if (normalizedMangaId) {
        return `fansubs/${normalizedFansubId}/mangas/${normalizedMangaId}/cover`
    }

    const normalizedDraftKey = normalizeSegment(options.draftKey || 'untitled') || 'untitled'
    return `fansubs/${normalizedFansubId}/manga-drafts/${normalizedDraftKey}/cover`
}

async function buildFansubAvatarFallbackBasePath(options: FansubAvatarUploadOptions): Promise<string> {
    const normalizedFansubId = normalizeSegment(options.fansubId || '')
    if (normalizedFansubId) {
        return `fansubs/${normalizedFansubId}/avatar`
    }

    const authUserId = await requireCurrentAuthUserIdForStoragePath()
    return `fansub-drafts/${authUserId}/avatar`
}

export async function uploadMangaCover(file: File, options: MangaCoverUploadOptions = {}): Promise<string> {
    const normalizedFile = await prepareUploadFile(file)

    if (canUseCloudflareStorageUpload() && options.fansubId) {
        assertFileAllowed(normalizedFile, 'manga_cover')
        const finalFile = await autoConvertToWebP(normalizedFile, 'manga-cover')
        const uploaded = await uploadFileViaCloudflareStorage({
            intent: 'manga-cover',
            file: finalFile,
            fields: {
                fansubId: options.fansubId,
                mangaId: options.mangaId,
                draftKey: options.draftKey,
            },
        })
        return requireCloudflarePublicUrl(uploaded.publicUrl, 'Manga kapagi')
    }

    return uploadPublicFile('manga_cover', buildMangaCoverFallbackBasePath(options), normalizedFile)
}

export async function uploadCommunityPostImage(
    file: File,
    options: CommunityPostImageUploadOptions,
    onProgress?: UploadProgressHandler,
): Promise<CommunityPostImageUploadResult> {
    const normalizedFile = await prepareUploadFile(file)
    assertCommunityPostImageAllowed(normalizedFile)

    if (!options.postId?.trim()) {
        throw new Error('Topluluk gorseli icin gonderi bilgisi zorunludur.')
    }

    if (!Number.isInteger(options.position) || options.position < 1 || options.position > 4) {
        throw new Error('Topluluk gorseli sirasi 1 ile 4 arasinda olmali.')
    }

    const finalFile = await autoConvertToWebP(normalizedFile, 'community-post-image')
    assertCommunityPostImageAllowed(finalFile)
    const dimensions = await readImageDimensions(finalFile)

    if (canUseCloudflareStorageUpload()) {
        const uploaded = await uploadFileViaCloudflareStorage({
            intent: 'community-post-image',
            file: finalFile,
            fields: {
                postId: options.postId,
                position: options.position,
            },
            onProgress,
        })
        return {
            assetRef: uploaded.assetRef || toStoreAssetRef(uploaded.objectPath),
            objectPath: uploaded.objectPath,
            publicUrl: uploaded.publicUrl,
            uploadedFile: finalFile,
            ...dimensions,
        }
    }

    const objectPath = await uploadPublicFile(
        'store_asset',
        buildCommunityPostImageFallbackPath(options.postId, options.position),
        finalFile,
        { response: 'objectPath' },
    )
    onProgress?.(100)

    return {
        assetRef: toStoreAssetRef(objectPath),
        objectPath,
        uploadedFile: finalFile,
        ...dimensions,
    }
}

export async function uploadChapterPages(files: File[], mangaId: string, chapterNumber: number, fansubId?: string): Promise<ChapterPageUploadResult[]> {
    const normalizedMangaId = normalizeSegment(mangaId) || 'unknown-manga'
    const chapterKey = `manga-${normalizedMangaId}/ch-${chapterNumber}`
    const refs: ChapterPageUploadResult[] = []
    const useCloudflareWritePath = canUseCloudflareStorageUpload()

    for (let i = 0; i < files.length; i += 1) {
        const normalizedFile = await prepareUploadFile(files[i])
        // Dimensions are read before upload so the reader can reserve the right space on the chapter's
        // FIRST frame (otherwise it jumps until the first images load).
        // If unreadable, returns 0 and the record is skipped; space reservation uses the fallback.
        const { width, height } = await readImageDimensions(normalizedFile)

        if (useCloudflareWritePath) {
            assertFileAllowed(normalizedFile, 'chapter_page')
            const finalFile = await autoConvertToWebP(normalizedFile, `chapter-page-${i + 1}`)
            const uploaded = await uploadFileViaCloudflareStorage({
                intent: 'chapter-page',
                file: finalFile,
                fields: {
                    mangaId,
                    chapterNumber,
                    pageIndex: i,
                    // Uploading fansub: the guard now checks admin of the fansub uploading the
                    // chapter, not the manga owner (multi-fansub version model).
                    ...(fansubId ? { fansubId } : {}),
                },
            })
            refs.push({ ref: uploaded.assetRef || toChapterPageRef(uploaded.objectPath), width, height })
            continue
        }

        const pagePath = `${chapterKey}/page-${String(i + 1).padStart(3, '0')}`
        // Kontrat notu: uploadPublicFile('chapter_page', pagePath, file, { response: 'objectPath' })
        const objectPath = await uploadPublicFile('chapter_page', pagePath, normalizedFile, { response: 'objectPath' })
        refs.push({ ref: toChapterPageRef(objectPath), width, height })
    }

    return refs
}

export async function uploadFansubAvatar(
    file: File,
    options: FansubAvatarUploadOptions = {},
    onProgress?: UploadProgressHandler,
): Promise<string> {
    const normalizedFile = await prepareUploadFile(file)

    if (canUseCloudflareStorageUpload()) {
        assertFileAllowed(normalizedFile, 'fansub_avatar')
        const finalFile = await autoConvertToWebP(normalizedFile, options.fansubId ? 'fansub-avatar' : 'draft-fansub-avatar')
        const uploaded = await uploadFileViaCloudflareStorage({
            intent: options.fansubId ? 'fansub-avatar' : 'draft-fansub-avatar',
            file: finalFile,
            fields: {
                fansubId: options.fansubId,
            },
            onProgress,
        })
        return requireCloudflarePublicUrl(uploaded.publicUrl, 'Fansub avatari')
    }

    const uploadedUrl = await uploadPublicFile('fansub_avatar', await buildFansubAvatarFallbackBasePath(options), normalizedFile)
    onProgress?.(100)
    return uploadedUrl
}

export async function uploadFansubSupporterAsset(
    file: File,
    options: FansubSupporterAssetUploadOptions,
): Promise<FansubSupporterAssetUploadResult> {
    const normalizedFile = await prepareUploadFile(file)
    const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
    if (!allowedMimeTypes.has(normalizedFile.type)) {
        throw new Error(`Supporter ifadesi icin desteklenmeyen dosya tipi: ${normalizedFile.type}`)
    }

    const maxBytes = options.assetKind === 'emoji'
        ? 1024 * 1024
        : 4 * 1024 * 1024
    if (normalizedFile.size > maxBytes) {
        throw new Error(options.assetKind === 'emoji'
            ? 'Emoji dosyasi 1MB limitini asamaz.'
            : 'Cikartma dosyasi 4MB limitini asamaz.')
    }

    const finalFile = await autoConvertToWebP(normalizedFile, `fansub-supporter-${options.assetKind}`)
    const normalizedFansubId = normalizeSegment(options.fansubId) || 'unknown-fansub'
    const normalizedShortcode = normalizeSegment(options.shortcode) || 'asset'
    const basePath = `fansubs/${normalizedFansubId}/supporter-assets/${options.assetKind}/${normalizedShortcode}`

    if (canUseCloudflareStorageUpload()) {
        const uploaded = await uploadFileViaCloudflareStorage({
            intent: 'fansub-supporter-asset',
            file: finalFile,
            fields: {
                fansubId: options.fansubId,
                assetKind: options.assetKind,
                shortcode: options.shortcode,
            },
        })
        return {
            assetRef: uploaded.assetRef || toStoreAssetRef(uploaded.objectPath),
            uploadedFile: finalFile,
        }
    }

    return {
        assetRef: toStoreAssetRef(await uploadPublicFile('store_asset', basePath, finalFile, { response: 'objectPath' })),
        uploadedFile: finalFile,
    }
}

export async function uploadUserAvatar(file: File, userId: string): Promise<string> {
    const normalizedFile = await prepareUploadFile(file)

    if (canUseCloudflareStorageUpload({ allowLocalDev: true })) {
        assertFileAllowed(normalizedFile, 'user_avatar')
        const finalFile = await autoConvertToWebP(normalizedFile, 'user-avatar')
        const uploaded = await uploadFileViaCloudflareStorage({
            intent: 'user-avatar',
            file: finalFile,
        })
        return requireCloudflarePublicUrl(uploaded.publicUrl, 'Kullanici avatari')
    }

    const normalizedUserId = normalizeSegment(userId) || 'unknown-user'
    return uploadPublicFile('user_avatar', `user-avatars/${normalizedUserId}`, normalizedFile)
}

function buildProfileBackgroundSlotStem(normalizedUserId: string, slotIndex: number) {
    return `user-backgrounds/${normalizedUserId}/slots/slot-${String(slotIndex + 1).padStart(2, '0')}`
}

function buildFansubBackgroundSlotStem(normalizedFansubId: string, slotIndex: number) {
    return `fansubs/${normalizedFansubId}/backgrounds/slots/slot-${String(slotIndex + 1).padStart(2, '0')}`
}

function throwFriendlyUserProfileBackgroundUploadError(error: { message?: string; name?: string } | null | undefined): never {
    const normalizedMessage = `${error?.message || ''} ${error?.name || ''}`.toLowerCase()
    if (normalizedMessage.includes('row-level security') || normalizedMessage.includes('policy')) {
        throw new Error('Profil arka plani yukleme izni bulunamadi. Bu alan icin premium gerekir veya storage policy eksik olabilir.')
    }
    throw error
}

function throwFriendlyFansubProfileBackgroundUploadError(error: { message?: string; name?: string } | null | undefined): never {
    const normalizedMessage = `${error?.message || ''} ${error?.name || ''}`.toLowerCase()
    if (normalizedMessage.includes('seviye 2 boost gerekir')) {
        throw new Error('Video fansub arka plani icin en az Seviye 2 boost gerekir.')
    }
    if (normalizedMessage.includes('seviye 1 boost gerekir') || normalizedMessage.includes('boost yetkisi')) {
        throw new Error('Fansub arka plani yuklemek icin en az Seviye 1 boost gerekir.')
    }
    throw error
}

async function clearUserProfileBackgroundSlot(normalizedUserId: string, slotIndex: number) {
    const slotStem = buildProfileBackgroundSlotStem(normalizedUserId, slotIndex)
    const staleObjectPaths = PROFILE_BACKGROUND_SLOT_EXTENSIONS.map((extension) => `${slotStem}.${extension}`)
    const { error } = await supabase.storage.from(STORAGE_TARGETS.store_asset.bucket).remove(staleObjectPaths)
    if (!error) return

    const normalizedMessage = `${error.message || ''} ${error.name || ''}`.toLowerCase()
    if (normalizedMessage.includes('not found') || normalizedMessage.includes('404')) {
        return
    }
    throwFriendlyUserProfileBackgroundUploadError(error)
}

async function clearFansubProfileBackgroundSlot(normalizedFansubId: string, slotIndex: number) {
    const slotStem = buildFansubBackgroundSlotStem(normalizedFansubId, slotIndex)
    const staleObjectPaths = PROFILE_BACKGROUND_SLOT_EXTENSIONS.map((extension) => `${slotStem}.${extension}`)
    const { error } = await supabase.storage.from(STORAGE_TARGETS.store_asset.bucket).remove(staleObjectPaths)
    if (!error) return

    const normalizedMessage = `${error.message || ''} ${error.name || ''}`.toLowerCase()
    if (normalizedMessage.includes('not found') || normalizedMessage.includes('404')) {
        return
    }
    throw error
}

export async function uploadUserProfileBackground(file: File, userId: string, slotIndex = 0): Promise<string> {
    const normalizedFile = await prepareUploadFile(file)
    const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'video/webm', 'video/mp4'])
    if (!allowedMimeTypes.has(normalizedFile.type)) {
        throw new Error(`Profil arka plani icin desteklenmeyen dosya tipi: ${normalizedFile.type}`)
    }

    const maxBytes = 8 * 1024 * 1024
    if (normalizedFile.size > maxBytes) {
        throw new Error('Profil arka plani 8MB limitini asamaz.')
    }

    const finalFile = await autoConvertToWebP(normalizedFile, 'user-profile-background')
    if (canUseCloudflareStorageUpload()) {
        const uploaded = await uploadFileViaCloudflareStorage({
            intent: 'user-profile-background',
            file: finalFile,
            fields: {
                slotIndex,
            },
        })
        return uploaded.assetRef || toStoreAssetRef(uploaded.objectPath)
    }

    const normalizedUserId = normalizeSegment(userId) || 'unknown-user'
    if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= PROFILE_BACKGROUND_MAX_SLOT_COUNT) {
        throw new Error('Profil arka plani slot bilgisi gecersiz.')
    }

    await clearUserProfileBackgroundSlot(normalizedUserId, slotIndex)

    const slotStem = buildProfileBackgroundSlotStem(normalizedUserId, slotIndex)
    const objectPath = `${slotStem}.${getFileExtension(finalFile)}`
    const { error } = await supabase.storage.from(STORAGE_TARGETS.store_asset.bucket).upload(objectPath, finalFile, {
        upsert: true,
        cacheControl: '3600',
    })

    if (error) {
        throwFriendlyUserProfileBackgroundUploadError(error)
    }
    return toStoreAssetRef(objectPath)
}

export async function uploadFansubProfileBackground(
    file: File,
    fansubId: string,
    slotIndex = 0,
    onProgress?: UploadProgressHandler,
): Promise<string> {
    const normalizedFile = await prepareUploadFile(file)
    const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'video/webm', 'video/mp4'])
    if (!allowedMimeTypes.has(normalizedFile.type)) {
        throw new Error(`Fansub arka plani icin desteklenmeyen dosya tipi: ${normalizedFile.type}`)
    }

    const maxBytes = 8 * 1024 * 1024
    if (normalizedFile.size > maxBytes) {
        throw new Error('Fansub arka plani 8MB limitini asamaz.')
    }

    const finalFile = await autoConvertToWebP(normalizedFile, 'fansub-profile-background')
    if (canUseCloudflareStorageUpload()) {
        try {
            const uploaded = await uploadFileViaCloudflareStorage({
                intent: 'fansub-profile-background',
                file: finalFile,
                fields: {
                    fansubId,
                    slotIndex,
                },
                onProgress,
            })
            return uploaded.assetRef || toStoreAssetRef(uploaded.objectPath)
        } catch (error) {
            throwFriendlyFansubProfileBackgroundUploadError(error as { message?: string; name?: string } | null | undefined)
        }
    }

    const normalizedFansubId = normalizeSegment(fansubId) || 'unknown-fansub'
    if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= FANSUB_BACKGROUND_MAX_SLOT_COUNT) {
        throw new Error('Fansub arka plani slot bilgisi gecersiz.')
    }

    await clearFansubProfileBackgroundSlot(normalizedFansubId, slotIndex)

    const slotStem = buildFansubBackgroundSlotStem(normalizedFansubId, slotIndex)
    const objectPath = `${slotStem}.${getFileExtension(finalFile)}`
    const { error } = await supabase.storage.from(STORAGE_TARGETS.store_asset.bucket).upload(objectPath, finalFile, {
        upsert: true,
        cacheControl: '3600',
    })

    if (error) {
        throwFriendlyFansubProfileBackgroundUploadError(error)
    }
    onProgress?.(100)
    return toStoreAssetRef(objectPath)
}

async function autoConvertToWebP(file: File, label: string): Promise<File> {
    const normalizedFile = await prepareUploadFile(file)
    const shouldSkipConversion = await isAnimatedImageFile(normalizedFile)

    if ((normalizedFile.type === 'image/jpeg' || normalizedFile.type === 'image/png') && !shouldSkipConversion) {
        try {
            const converted = await convertToWebP(normalizedFile)
            if (import.meta.env.DEV) console.log(`[StoreAsset] WebP donusum (${label}): ${normalizedFile.name} (${(normalizedFile.size / 1024).toFixed(0)}KB) -> ${converted.name} (${(converted.size / 1024).toFixed(0)}KB)`)
            return converted
        } catch {
            return normalizedFile
        }
    }
    return normalizedFile
}

// Seasonal event banner: Cloudflare R2 in production (event-banner intent),
// fallback to Supabase store-assets on localhost/no CF. (Like all other images.)
export async function uploadEventBanner(file: File): Promise<string> {
    if (canUseCloudflareStorageUpload()) {
        const uploaded = await uploadFileViaCloudflareStorage({
            intent: 'event-banner',
            file,
        })
        return uploaded.publicUrl || uploaded.assetRef || toStoreAssetRef(uploaded.objectPath)
    }
    return uploadPublicFile('store_asset', 'event-banners', file)
}

export async function uploadStoreAsset(
    file: File,
    productType: 'frame' | 'badge' | 'pattern' | 'background' | 'premium' | 'profile_effect' = 'frame',
    productVariant: 'live' | 'poster' = 'live',
): Promise<string> {
    const normalizedFile = await prepareUploadFile(file)
    const folderMap: Record<'frame' | 'badge' | 'pattern' | 'background' | 'premium' | 'profile_effect', string> = {
        frame: 'frames',
        badge: 'badges',
        pattern: 'patterns',
        background: 'backgrounds',
        premium: 'premium',
        profile_effect: 'profile-effects',
    }

    const allowedMimeTypesByProductType: Record<
        'frame' | 'badge' | 'pattern' | 'background' | 'premium' | 'profile_effect',
        string[]
    > = {
        frame: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
        badge: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
        pattern: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
        background: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm'],
        premium: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
        profile_effect: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm'],
    }

    const posterAllowedMimeTypesByProductType: Record<'frame' | 'background', string[]> = {
        frame: ['image/jpeg', 'image/png', 'image/webp'],
        background: ['image/jpeg', 'image/png', 'image/webp'],
    }

    const folder = folderMap[productType]
    if (!folder) {
        throw new Error(`Gecersiz urun tipi: ${productType}`)
    }

    if (productVariant === 'poster') {
        if (productType !== 'frame' && productType !== 'background') {
            throw new Error('Poster upload yalniz cerceve ve arkaplan urunlerinde desteklenir.')
        }

        if (!posterAllowedMimeTypesByProductType[productType].includes(normalizedFile.type)) {
            throw new Error(`Poster icin desteklenmeyen dosya tipi: ${normalizedFile.type}`)
        }

        // Kontrat notu: const finalFile = await autoConvertToWebP(file, 'poster')
        const finalFile = await autoConvertToWebP(normalizedFile, 'poster')
        if (canUseCloudflareStorageUpload()) {
            const uploaded = await uploadFileViaCloudflareStorage({
                intent: 'store-asset',
                file: finalFile,
                fields: {
                    productType,
                    productVariant: 'poster',
                },
            })
            return uploaded.publicUrl || uploaded.assetRef || toStoreAssetRef(uploaded.objectPath)
        }

        return uploadPublicFile('store_asset', `${folder}/posters`, finalFile)
    }

    if (!allowedMimeTypesByProductType[productType].includes(normalizedFile.type)) {
        throw new Error(`"${productType}" urun tipi icin desteklenmeyen dosya tipi: ${normalizedFile.type}`)
    }

    const finalFile = await autoConvertToWebP(normalizedFile, productType)
    if (canUseCloudflareStorageUpload()) {
        const uploaded = await uploadFileViaCloudflareStorage({
            intent: 'store-asset',
            file: finalFile,
            fields: {
                productType,
                productVariant,
            },
        })
        return uploaded.publicUrl || uploaded.assetRef || toStoreAssetRef(uploaded.objectPath)
    }

    const basePath = (productType === 'frame' || productType === 'background' || productType === 'profile_effect') ? `${folder}/live` : folder
    return uploadPublicFile('store_asset', basePath, finalFile)
}

export type ProfileEffectAssetUploadVariant =
    | 'modal-backdrop'
    | 'card-asset'
    | 'card-intro'
    | 'card-loop'
    | 'profile-asset'
    | 'profile-intro'
    | 'profile-loop'
    | 'hover-asset'
    | 'hover-intro'
    | 'hover-loop'

const PROFILE_EFFECT_ASSET_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const PROFILE_EFFECT_VIDEO_MIME_TYPES = ['video/webm', 'video/mp4']
const PROFILE_EFFECT_ASSET_IMAGE_VARIANTS = new Set<ProfileEffectAssetUploadVariant>(['modal-backdrop', 'card-asset', 'profile-asset', 'hover-asset'])
const PROFILE_EFFECT_VIDEO_VARIANTS = new Set<ProfileEffectAssetUploadVariant>(['card-intro', 'card-loop', 'profile-intro', 'profile-loop', 'hover-intro', 'hover-loop'])

export interface ProfileEffectAssetUploadResult {
    url: string
    mediaMetaPatch: StoreProfileEffectMediaMeta
}

function normalizeCurrentAppRolePayload(value: unknown) {
    const payload = Array.isArray(value) ? value[0] : value
    if (typeof payload === 'string') return payload
    if (payload && typeof payload === 'object' && 'current_app_role' in payload) {
        const role = (payload as { current_app_role?: unknown }).current_app_role
        return typeof role === 'string' ? role : null
    }
    return null
}

async function assertLocalProfileEffectUploadAccess() {
    const sessionResult = await supabase.auth.getSession()
    const hasSession = Boolean(sessionResult.data.session?.access_token)
    if (!hasSession) {
        const isE2EMode = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('e2e') === '1'
        throw new Error(
            isE2EMode
                ? 'E2E mock admin ile Supabase Storage yuklemesi yapilamaz. Kalici urun asseti yuklemek icin e2e=1 olmadan gercek admin hesabi ile giris yapin.'
                : 'Profil effect asseti yuklemek icin gercek Supabase admin oturumu gerekiyor.',
        )
    }

    const { data, error } = await supabase.rpc('current_app_role')
    if (error) {
        throw new Error('Admin upload yetkisi dogrulanamadi. Oturumu yenileyip tekrar deneyin.')
    }

    const appRole = normalizeCurrentAppRolePayload(data)
    if (appRole !== 'admin') {
        throw new Error(`Profil effect asseti yuklemek icin admin rolu gerekiyor. Mevcut rol: ${appRole || 'bilinmiyor'}.`)
    }
}

export async function uploadProfileEffectAsset(file: File, variant: ProfileEffectAssetUploadVariant): Promise<ProfileEffectAssetUploadResult> {
    const normalizedUpload = await normalizeUploadFile(file)
    const normalizedFile = normalizedUpload.file

    if (PROFILE_EFFECT_ASSET_IMAGE_VARIANTS.has(variant)) {
        const isAllowedAssetMimeType = PROFILE_EFFECT_ASSET_IMAGE_MIME_TYPES.includes(normalizedFile.type)
        const isAllowedAssetMediaKind = normalizedUpload.mediaKind === 'static-image' || normalizedUpload.mediaKind === 'animated-image'
        if (!isAllowedAssetMimeType || !isAllowedAssetMediaKind) {
            throw new Error(`Profil effect asset'i icin desteklenmeyen dosya tipi: ${normalizedFile.type}`)
        }
    } else if (PROFILE_EFFECT_VIDEO_VARIANTS.has(variant)) {
        const isAllowedAnimationMimeType = PROFILE_EFFECT_VIDEO_MIME_TYPES.includes(normalizedFile.type)
            || PROFILE_EFFECT_ASSET_IMAGE_MIME_TYPES.includes(normalizedFile.type)
        // A static transparent layer is also a valid effect (e.g. a fixed light / pattern).
        const isAllowedAnimationMediaKind = normalizedUpload.mediaKind === 'video'
            || normalizedUpload.mediaKind === 'animated-image'
            || normalizedUpload.mediaKind === 'static-image'
        if (!isAllowedAnimationMimeType || !isAllowedAnimationMediaKind) {
            throw new Error(`Profil effect animasyonu icin desteklenmeyen dosya tipi: ${normalizedFile.type}. Gecis ve loop slotlari icin video ya da (animasyonlu) gorsel kullanin.`)
        }
    } else {
        throw new Error(`Profil effect medyasi icin gecersiz slot: ${variant}`)
    }

    const finalFile = PROFILE_EFFECT_ASSET_IMAGE_VARIANTS.has(variant)
        ? await autoConvertToWebP(normalizedFile, `profile-effect-${variant}`)
        : normalizedFile
    const mediaMetaPatch = await buildProfileEffectMediaMetaPatchFromFile(finalFile, variant)
    if (canUseCloudflareStorageUpload()) {
        const uploaded = await uploadFileViaCloudflareStorage({
            intent: 'profile-effect-asset',
            file: finalFile,
            fields: { variant },
        })
        return {
            url: uploaded.assetRef || toStoreAssetRef(uploaded.objectPath),
            mediaMetaPatch,
        }
    }

    await assertLocalProfileEffectUploadAccess()

    const targetPath = variant === 'card-asset' ? 'profile-effects/card-asset' : `profile-effects/${variant}`
    const objectPath = await uploadPublicFile('store_asset', targetPath, finalFile, { response: 'objectPath' })
    return {
        url: toStoreAssetRef(objectPath),
        mediaMetaPatch,
    }
}

const STOREFRONT_VISUAL_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/webm']

export async function uploadStorefrontVisual(file: File, targetKey: string): Promise<string> {
    const normalizedFile = await prepareUploadFile(file)
    if (!STOREFRONT_VISUAL_MIME_TYPES.includes(normalizedFile.type)) {
        throw new Error(`Storefront gorseli icin desteklenmeyen dosya tipi: ${normalizedFile.type}`)
    }

    const finalFile = await autoConvertToWebP(normalizedFile, 'storefront')

    const normalizedPath = targetKey
        .split('/')
        .map((segment) => normalizeSegment(segment))
        .filter(Boolean)
        .join('/')

    const basePath = normalizedPath ? `storefront/${normalizedPath}` : 'storefront/misc'
    if (canUseCloudflareStorageUpload()) {
        const uploaded = await uploadFileViaCloudflareStorage({
            intent: 'storefront-visual',
            file: finalFile,
            fields: { targetKey },
        })
        return uploaded.publicUrl || uploaded.assetRef || toStoreAssetRef(uploaded.objectPath)
    }

    return uploadPublicFile('store_asset', basePath, finalFile)
}

