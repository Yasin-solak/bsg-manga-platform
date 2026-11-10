import { supabase } from './supabase'

const STORE_ASSET_BUCKET = 'store-assets'
const STORE_ASSET_SCHEME = 'store-assets://'
const CHAPTER_PAGE_BUCKET = 'chapter-pages'
const CHAPTER_PAGE_SCHEME = 'chapter-pages://'
const STORE_ASSET_PUBLIC_BASE_URL = normalizePublicBaseUrl(import.meta.env.VITE_STORE_ASSET_PUBLIC_BASE_URL)
const CHAPTER_PAGE_PUBLIC_BASE_URL = normalizePublicBaseUrl(import.meta.env.VITE_CHAPTER_PAGE_PUBLIC_BASE_URL)

type BucketAssetConfig = {
    bucket: string
    scheme: string
    publicBaseUrl: string | null
}

const STORE_ASSET_CONFIG: BucketAssetConfig = {
    bucket: STORE_ASSET_BUCKET,
    scheme: STORE_ASSET_SCHEME,
    publicBaseUrl: STORE_ASSET_PUBLIC_BASE_URL,
}

const CHAPTER_PAGE_CONFIG: BucketAssetConfig = {
    bucket: CHAPTER_PAGE_BUCKET,
    scheme: CHAPTER_PAGE_SCHEME,
    publicBaseUrl: CHAPTER_PAGE_PUBLIC_BASE_URL,
}

function normalizePublicBaseUrl(value: unknown): string | null {
    if (typeof value !== 'string') return null
    const trimmed = value.trim().replace(/\/+$/g, '')
    if (!trimmed) return null
    if (!/^https?:\/\//i.test(trimmed)) return null
    return trimmed
}

function isSafeLocalAssetPath(value: string): boolean {
    return value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/\\')
}

function isSafeDataAssetUrl(value: string): boolean {
    return /^data:(?:image|video)\//i.test(value)
}

export function isSafeAssetUrl(value?: string | null): boolean {
    if (!value) return false
    const trimmed = value.trim()
    if (!trimmed) return false
    if (/^https?:\/\//i.test(trimmed)) return true
    if (/^blob:/i.test(trimmed)) return true
    if (isSafeDataAssetUrl(trimmed)) return true
    return isSafeLocalAssetPath(trimmed)
}

function encodePathForUrl(path: string): string {
    return path
        .split('/')
        .filter(Boolean)
        .map((segment) => encodeURIComponent(segment))
        .join('/')
}

function isUuidSegment(value: string | undefined): boolean {
    return Boolean(value?.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i))
}

function isSupabaseCommunityFallbackStoreAssetPath(path: string): boolean {
    const segments = path.split('/').filter(Boolean)
    return (
        segments[0] === 'community'
        && segments[1] === 'posts'
        && isUuidSegment(segments[2])
        && /^slot-0[1-4]$/i.test(segments[3] || '')
    )
}

function isSupabasePublicBucketObjectUrl(value: string, config: BucketAssetConfig): boolean {
    if (!/^https?:\/\//i.test(value)) return false

    try {
        const url = new URL(value)
        return url.pathname.startsWith(`/storage/v1/object/public/${config.bucket}/`)
    } catch {
        return false
    }
}

function shouldPreserveSupabaseStorefrontFallbackUrl(value: string, path: string, config: BucketAssetConfig): boolean {
    return (
        config.bucket === STORE_ASSET_BUCKET
        && path.startsWith('storefront/')
        && isSupabasePublicBucketObjectUrl(value, config)
    )
}

const VIDEO_ASSET_EXTENSION_PATTERN = /\.(mp4|webm|ogg|mov)$/i
const IMAGE_ASSET_EXTENSION_PATTERN = /\.(avif|gif|jpe?g|png|webp)$/i

function extractUrlPathname(value: string): string {
    const withoutHash = value.split('#')[0] || value
    const withoutQuery = withoutHash.split('?')[0] || withoutHash
    return withoutQuery.trim()
}

function normalizeAssetPath(path: string): string | null {
    const trimmed = path.trim().replace(/^\/+/, '')
    if (!trimmed) return null
    try {
        return decodeURIComponent(trimmed)
    } catch {
        return trimmed
    }
}

function extractBucketAssetPathFromConfiguredBase(value: string, config: BucketAssetConfig): string | null {
    if (!config.publicBaseUrl) return null
    if (!/^https?:\/\//i.test(value)) return null

    try {
        const configuredBaseUrl = new URL(config.publicBaseUrl)
        const targetUrl = new URL(value)
        if (configuredBaseUrl.origin !== targetUrl.origin) return null

        const configuredBasePath = configuredBaseUrl.pathname.replace(/\/+$/g, '')
        const targetPath = targetUrl.pathname.replace(/^\/+/, '')

        if (!configuredBasePath) {
            return normalizeAssetPath(targetPath)
        }

        const normalizedConfiguredPath = configuredBasePath.replace(/^\/+/, '')
        if (targetPath === normalizedConfiguredPath) return null
        if (!targetPath.startsWith(`${normalizedConfiguredPath}/`)) return null

        return normalizeAssetPath(targetPath.slice(normalizedConfiguredPath.length + 1))
    } catch {
        return null
    }
}

function extractBucketAssetPath(value: string, config: BucketAssetConfig): string | null {
    if (value.startsWith(config.scheme)) {
        return normalizeAssetPath(value.slice(config.scheme.length))
    }

    if (value.startsWith(`${config.bucket}/`)) {
        return normalizeAssetPath(value.slice(config.bucket.length + 1))
    }

    const configuredBasePath = extractBucketAssetPathFromConfiguredBase(value, config)
    if (configuredBasePath) return configuredBasePath

    if (/^https?:\/\//i.test(value)) {
        try {
            const bucketPathPattern = new RegExp(`/storage/v1/object/(?:public|sign)/${config.bucket}/(.+)$`, 'i')
            const url = new URL(value)
            const match = url.pathname.match(bucketPathPattern)
            if (match?.[1]) {
                return normalizeAssetPath(match[1])
            }
        } catch {
            // ignore parse errors; fallback below
        }
    }

    return null
}

function resolveSupabaseBareObjectUrl(value: string, config: BucketAssetConfig): string | null {
    if (!/^https?:\/\//i.test(value)) return null

    try {
        const url = new URL(value)
        const bareObjectPattern = new RegExp(`/storage/v1/object/${config.bucket}/(.+)$`, 'i')
        const match = url.pathname.match(bareObjectPattern)
        if (!match?.[1]) return null

        const assetPath = normalizeAssetPath(match[1])
        if (!assetPath) return null

        return `${url.origin}/storage/v1/object/public/${config.bucket}/${encodePathForUrl(assetPath)}`
    } catch {
        return null
    }
}

function resolveBucketAssetUrl(value: string | null | undefined, config: BucketAssetConfig): string | undefined {
    if (!value) return undefined

    const trimmed = value.trim()
    if (!trimmed) return undefined

    const supabasePublicUrl = resolveSupabaseBareObjectUrl(trimmed, config)
    if (supabasePublicUrl) return supabasePublicUrl

    const assetPath = extractBucketAssetPath(trimmed, config)
    if (assetPath) {
        if (shouldPreserveSupabaseStorefrontFallbackUrl(trimmed, assetPath, config)) {
            return trimmed
        }

        if (config.bucket === STORE_ASSET_BUCKET && isSupabaseCommunityFallbackStoreAssetPath(assetPath)) {
            const { data } = supabase.storage.from(config.bucket).getPublicUrl(assetPath)
            return data.publicUrl
        }

        if (config.publicBaseUrl) {
            return `${config.publicBaseUrl}/${encodePathForUrl(assetPath)}`
        }

        const { data } = supabase.storage.from(config.bucket).getPublicUrl(assetPath)
        return data.publicUrl
    }

    if (isSafeAssetUrl(trimmed)) return trimmed

    return undefined
}

export function resolveStoreAssetUrl(value?: string | null): string | undefined {
    return resolveBucketAssetUrl(value, STORE_ASSET_CONFIG)
}

export function resolveChapterPageUrl(value?: string | null): string | undefined {
    return resolveBucketAssetUrl(value, CHAPTER_PAGE_CONFIG)
}

export function resolveSafeAssetUrl(value?: string | null): string | undefined {
    if (!value) return undefined
    const resolved = resolveStoreAssetUrl(value)
    if (resolved && isSafeAssetUrl(resolved)) return resolved

    const trimmed = value.trim()
    if (isSafeAssetUrl(trimmed)) return trimmed
    return undefined
}

export type AssetMediaType = 'image' | 'video'

export function resolveAssetMediaType(value?: string | null): AssetMediaType | null {
    if (!value) return null
    const trimmed = value.trim()
    if (!trimmed) return null

    const resolved = resolveSafeAssetUrl(trimmed)
    if (!resolved) return null

    const normalized = resolved.toLowerCase().trim()
    if (normalized.startsWith('data:video/')) return 'video'
    if (normalized.startsWith('data:image/')) return 'image'

    const pathname = extractUrlPathname(resolved)
    if (VIDEO_ASSET_EXTENSION_PATTERN.test(pathname)) return 'video'
    if (IMAGE_ASSET_EXTENSION_PATTERN.test(pathname)) return 'image'

    return null
}

export function isVideoAssetUrl(value?: string | null): boolean {
    return resolveAssetMediaType(value) === 'video'
}

function toBucketAssetRef(path: string, config: BucketAssetConfig): string {
    const normalized = normalizeAssetPath(path)
    return normalized ? `${config.scheme}${normalized}` : `${config.scheme}`
}

export function toStoreAssetRef(path: string): string {
    return toBucketAssetRef(path, STORE_ASSET_CONFIG)
}

export function toChapterPageRef(path: string): string {
    return toBucketAssetRef(path, CHAPTER_PAGE_CONFIG)
}

/**
 * Keep store asset fields in one standard:
 * - store-assets://<path>
 * - or as is, if a safe external URL/public path.
 */
export function normalizeStoreAssetRef(value?: string | null): string | undefined {
    if (!value) return undefined
    const trimmed = value.trim()
    if (!trimmed) return undefined

    const storeAssetPath = extractBucketAssetPath(trimmed, STORE_ASSET_CONFIG)
    if (storeAssetPath) return toStoreAssetRef(storeAssetPath)

    return isSafeAssetUrl(trimmed) ? trimmed : undefined
}

/**
 * Keep chapter page fields in one standard:
 * - chapter-pages://<path>
 * - or as is, if a safe external URL/public path.
 */
export function normalizeChapterPageRef(value?: string | null): string | undefined {
    if (!value) return undefined
    const trimmed = value.trim()
    if (!trimmed) return undefined

    const chapterPagePath = extractBucketAssetPath(trimmed, CHAPTER_PAGE_CONFIG)
    if (chapterPagePath) return toChapterPageRef(chapterPagePath)

    return isSafeAssetUrl(trimmed) ? trimmed : undefined
}
