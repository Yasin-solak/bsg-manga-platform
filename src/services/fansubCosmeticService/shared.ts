import type { FrameType } from '@/components/common/AvatarFrame'
import { isVideoAssetUrl, resolveStoreAssetUrl } from '../assetUrlService'
import { resolvePatternStyle } from '../patternStyleService'
import type { StoreCosmeticRow, StoreItemType } from './types'

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

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export function normalizeRef(value: string | null | undefined) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
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

function isVideoAsset(url?: string) {
  return isVideoAssetUrl(url)
}

function toTypeIdentifierKey(type: StoreItemType, identifier: string) {
  return `${type}:${identifier.toLowerCase()}`
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

export function shouldLookupStoreBackgroundRef(reference: string | null) {
  if (!reference) return false

  const resolved = resolveStoreAssetUrl(reference) || reference
  const normalized = resolved.trim()
  if (!normalized) return false
  if (/^(https?:|data:|blob:|\/)/i.test(normalized)) return false
  if (BACKGROUND_PRESETS[normalized.toLowerCase()]) return false
  if (normalized.includes('://')) return false
  if (normalized.includes('/')) return false

  return true
}

export function collectRef(ids: Set<string>, identifiers: Set<string>, value: string | null) {
  if (!value) return
  if (isUuid(value)) {
    ids.add(value)
  } else {
    identifiers.add(value.toLowerCase())
  }
}

export function shouldLookupStoreFrameRef(reference: string | null) {
  if (!reference) return false

  const normalized = reference.trim().toLowerCase()
  if (!normalized) return false
  if (FRAME_TYPES.has(normalized as FrameType)) return false
  if (normalized.includes('://')) return false
  if (normalized.includes('/')) return false

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

export function resolveStoreRefItem(
  byId: Map<string, StoreCosmeticRow>,
  byTypeIdentifier: Map<string, StoreCosmeticRow>,
  type: StoreItemType,
  reference: string | null,
) {
  if (!reference) return undefined
  if (isUuid(reference)) {
    const byUuid = byId.get(reference)
    if (byUuid?.type === type) return byUuid
  }
  return byTypeIdentifier.get(toTypeIdentifierKey(type, reference))
}

export function resolvePattern(patternSource: string | null) {
  return resolvePatternStyle(patternSource)
}
