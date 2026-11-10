import type { FrameType } from '@/components/common/AvatarFrame'
import { isVideoAssetUrl, resolveAssetMediaType, resolveStoreAssetUrl } from '../assetUrlService'
import {
    loadStoreItemsLiteByRefs,
    toStoreItemLiteTypeIdentifierKey,
} from '../storeItemLiteDirectory'
import type {
    CommunityCosmeticFansubData,
    CommunityCosmeticPostRow,
    StoreCosmeticRow,
} from './types'

type StoreCosmeticLookupMaps = {
    byId: Map<string, StoreCosmeticRow>
    byTypeIdentifier: Map<string, StoreCosmeticRow>
}

type CachedStoreCosmeticLookup = {
    data: StoreCosmeticLookupMaps
    expiresAt: number
}

const FRAME_TYPES = new Set<FrameType>([
    'christmas',
    'halloween',
    'avatarframe1',
    'avatarframe2',
    'avatarframe3',
    'avatarframe4',
    'fire',
    'ice',
    'neon',
    'gold',
    'rainbow',
    'default',
])

const BACKGROUND_PRESETS: Record<string, string> = {
    space: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 50%, #16213e 100%)',
    city: 'linear-gradient(135deg, #1e3c72 0%, #2a5298 50%, #7e8ba3 100%)',
    nature: 'linear-gradient(135deg, #134e5e 0%, #71b280 50%, #a8e6cf 100%)',
    ocean: 'linear-gradient(135deg, #1e3c72 0%, #2a5298 50%, #4facfe 100%)',
    sunset: 'linear-gradient(135deg, #f093fb 0%, #f5576c 50%, #4facfe 100%)',
    neon: 'linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%)',
}

const STORE_COSMETIC_LOOKUP_CACHE_TTL_MS = 15_000
const storeCosmeticLookupCache = new Map<string, CachedStoreCosmeticLookup>()
const storeCosmeticLookupInFlight = new Map<string, Promise<StoreCosmeticLookupMaps>>()

function normalizeIdentifier(value: string) {
    return value.trim().toLowerCase()
}

function cloneStoreCosmeticLookupMaps(value: StoreCosmeticLookupMaps): StoreCosmeticLookupMaps {
    return {
        byId: new Map(value.byId),
        byTypeIdentifier: new Map(value.byTypeIdentifier),
    }
}

function buildStoreCosmeticLookupSignature(ids: string[], identifiers: string[]) {
    const normalizedIds = Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)))
        .sort((left, right) => left.localeCompare(right, 'tr'))
    const normalizedIdentifiers = Array.from(
        new Set(identifiers.map((identifier) => normalizeIdentifier(identifier)).filter(Boolean)),
    ).sort((left, right) => left.localeCompare(right, 'tr'))

    return `ids:${normalizedIds.join(',')}|identifiers:${normalizedIdentifiers.join(',')}`
}

function readStoreCosmeticLookupCache(signature: string) {
    const cached = storeCosmeticLookupCache.get(signature)
    if (!cached) return null
    if (cached.expiresAt <= Date.now()) {
        storeCosmeticLookupCache.delete(signature)
        return null
    }
    return cloneStoreCosmeticLookupMaps(cached.data)
}

export function isUuid(value: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export function toFrameType(value?: string | null): FrameType | string | undefined {
    if (!value) return undefined
    const normalized = value.trim().toLowerCase()
    if (!normalized) return undefined

    if (FRAME_TYPES.has(normalized as FrameType)) {
        return normalized as FrameType
    }
    return normalized
}

export function normalizeRef(value: unknown): string | null {
    if (typeof value === 'string') {
        const trimmed = value.trim()
        return trimmed || null
    }
    if (value && typeof value === 'object') {
        const typed = value as { id?: unknown; identifier?: unknown; image?: unknown; value?: unknown }
        if (typeof typed.id === 'string' && typed.id.trim()) return typed.id.trim()
        if (typeof typed.identifier === 'string' && typed.identifier.trim()) return typed.identifier.trim()
        if (typeof typed.image === 'string' && typed.image.trim()) return typed.image.trim()
        if (typeof typed.value === 'string' && typed.value.trim()) return typed.value.trim()
    }
    return null
}

function isVideoAsset(url?: string) {
    return isVideoAssetUrl(url)
}

export function shouldLookupStoreBackgroundRef(reference: string | null) {
    if (!reference) return false

    const resolved = resolveStoreAssetUrl(reference) || reference
    const normalized = resolved.trim()
    if (!normalized) return false
    if (/^(https?:|data:|blob:|\/)/i.test(normalized)) return false
    if (resolveAssetMediaType(reference)) return false
    if (BACKGROUND_PRESETS[normalized.toLowerCase()]) return false
    if (normalized.includes('://')) return false
    if (normalized.includes('/')) return false

    return true
}

export function shouldLookupStoreFrameRef(reference: string | null) {
    if (!reference) return false

    const resolved = resolveStoreAssetUrl(reference) || reference
    const normalized = resolved.trim()
    if (!normalized) return false
    if (/^(https?:|data:|blob:|\/)/i.test(normalized)) return false
    if (FRAME_TYPES.has(normalized.toLowerCase() as FrameType)) return false
    if (normalized.includes('://')) return false

    return true
}

export function shouldLookupStorePatternRef(reference: string | null) {
    if (!reference) return false

    const resolved = resolveStoreAssetUrl(reference) || reference
    const normalized = resolved.trim()
    if (!normalized) return false
    if (/^(https?:|data:|blob:|\/)/i.test(normalized)) return false
    if (normalized.includes('://')) return false

    return true
}

export function toTypeIdentifierKey(type: StoreCosmeticRow['type'], identifier: string) {
    return toStoreItemLiteTypeIdentifierKey(type, identifier)
}

export function resolveBackground(rawValue?: string | null): { style?: string; videoUrl?: string } {
    if (!rawValue) return {}
    const resolved = resolveStoreAssetUrl(rawValue) || rawValue
    if (/^(https?:|data:|blob:|\/)/i.test(resolved)) {
        if (isVideoAsset(resolved)) {
            return {
                style: 'linear-gradient(135deg, #0d1117 0%, #111827 50%, #1f2937 100%)',
                videoUrl: resolved,
            }
        }
        return {
            style: `center / cover no-repeat url(${resolved})`,
        }
    }
    return {
        style: BACKGROUND_PRESETS[resolved.toLowerCase()] || undefined,
    }
}

export function resolveStoreRefItem(
    byId: Map<string, StoreCosmeticRow>,
    byTypeIdentifier: Map<string, StoreCosmeticRow>,
    type: StoreCosmeticRow['type'],
    reference: string | null,
) {
    if (!reference) return undefined
    if (isUuid(reference)) {
        const item = byId.get(reference)
        if (item?.type === type) return item
    }
    return byTypeIdentifier.get(toTypeIdentifierKey(type, reference))
}

export function collectRef(ids: Set<string>, identifiers: Set<string>, value: string | null) {
    if (!value) return
    if (isUuid(value)) {
        ids.add(value)
    } else {
        identifiers.add(value.toLowerCase())
    }
}

export function getSingleRelation<T>(value: T | T[] | null | undefined): T | undefined {
    if (!value) return undefined
    return Array.isArray(value) ? value[0] : value
}

export function getRowUserData(row: CommunityCosmeticPostRow) {
    return getSingleRelation(row.users || row.user)
}

export function getRowFansubData(row: CommunityCosmeticPostRow): CommunityCosmeticFansubData | undefined {
    return getSingleRelation(row.fansub)
}

export async function loadStoreCosmeticLookups(
    storeIdRefs: Set<string>,
    storeIdentifierRefs: Set<string>,
    signal?: AbortSignal,
) {
    const ids = Array.from(storeIdRefs)
    const identifiers = Array.from(storeIdentifierRefs)
    const signature = buildStoreCosmeticLookupSignature(ids, identifiers)

    if (signature === 'ids:|identifiers:') {
        return {
            byId: new Map<string, StoreCosmeticRow>(),
            byTypeIdentifier: new Map<string, StoreCosmeticRow>(),
        }
    }

    const cached = readStoreCosmeticLookupCache(signature)
    if (cached) return cached

    const existing = storeCosmeticLookupInFlight.get(signature)
    if (existing) {
        return cloneStoreCosmeticLookupMaps(await existing)
    }

    const request = (async (): Promise<StoreCosmeticLookupMaps> => {
        const { byId, byTypeIdentifier } = await loadStoreItemsLiteByRefs(
            {
                ids,
                identifiers,
            },
            signal,
        )

        const resolved = {
            byId: byId as Map<string, StoreCosmeticRow>,
            byTypeIdentifier: new Map(
                Array.from(byTypeIdentifier.entries()).map(([key, item]) => [
                    key || toTypeIdentifierKey(item.type, item.identifier),
                    item as StoreCosmeticRow,
                ]),
            ),
        }

        storeCosmeticLookupCache.set(signature, {
            data: cloneStoreCosmeticLookupMaps(resolved),
            expiresAt: Date.now() + STORE_COSMETIC_LOOKUP_CACHE_TTL_MS,
        })

        return resolved
    })()

    storeCosmeticLookupInFlight.set(signature, request)

    try {
        return cloneStoreCosmeticLookupMaps(await request)
    } finally {
        if (storeCosmeticLookupInFlight.get(signature) === request) {
            storeCosmeticLookupInFlight.delete(signature)
        }
    }
}
