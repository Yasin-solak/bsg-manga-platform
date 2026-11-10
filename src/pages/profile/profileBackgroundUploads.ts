import { normalizeStoreAssetRef, resolveAssetMediaType, type AssetMediaType } from '@/services/assetUrlService'
import { isPremiumActive } from '@/services/premiumPackagePublicService'
import type { OwnedBackground } from './types'
import { txa } from '@/i18n/activeLocale'

export type UploadedBackgroundSlotRecord = {
  slotIndex: number
  ref: string
  label: string
  mediaType: AssetMediaType
  updatedAt: string
}

export const PROFILE_BACKGROUND_UPLOAD_LIMITS = Object.freeze({
  default: 0,
  premium: 1,
})

export const PROFILE_BACKGROUND_UPLOAD_LIMIT_PRESETS = Object.freeze({
  premiumStarter: 5,
  premiumExtended: 10,
})

export type ProfileBackgroundUploadSlotPreset = keyof typeof PROFILE_BACKGROUND_UPLOAD_LIMIT_PRESETS

const UPLOADED_BACKGROUND_SLOTS_KEY = 'uploaded_background_slots'
const PROFILE_BACKGROUND_UPLOAD_SLOT_LIMIT_KEY = 'profile_background_upload_slot_limit'
const PROFILE_BACKGROUND_UPLOAD_SLOT_PRESET_KEY = 'profile_background_upload_slot_preset'
const MAX_BACKGROUND_UPLOAD_SLOT_COUNT = 10

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeSlotIndex(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value)) return null
  if (value < 0 || value >= MAX_BACKGROUND_UPLOAD_SLOT_COUNT) return null
  return value
}

function normalizeSlotCount(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value)) return null
  if (value < 1 || value > MAX_BACKGROUND_UPLOAD_SLOT_COUNT) return null
  return value
}

function normalizeLabel(value: unknown) {
  if (typeof value !== 'string') return null
  const normalized = value.trim().replace(/\s+/g, ' ')
  return normalized || null
}

function normalizeUpdatedAt(value: unknown) {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized || null
}

function normalizeSlotPreset(value: unknown): ProfileBackgroundUploadSlotPreset | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  if (normalized in PROFILE_BACKGROUND_UPLOAD_LIMIT_PRESETS) {
    return normalized as ProfileBackgroundUploadSlotPreset
  }
  return null
}

function normalizeMediaType(value: unknown, ref: string): AssetMediaType | null {
  if (value === 'image' || value === 'video') return value
  return resolveAssetMediaType(ref)
}

function parseUploadedBackgroundSlotRecord(value: unknown): UploadedBackgroundSlotRecord | null {
  if (!isRecord(value)) return null

  const slotIndex = normalizeSlotIndex(value.slotIndex)
  if (slotIndex === null) return null

  const normalizedRef = normalizeStoreAssetRef(typeof value.ref === 'string' ? value.ref : '')
  if (!normalizedRef) return null

  const mediaType = normalizeMediaType(value.mediaType, normalizedRef)
  if (!mediaType) return null

  const label = normalizeLabel(value.label) || txa('Kişisel arka plan {v1}', { v1: slotIndex + 1 })
  const updatedAt = normalizeUpdatedAt(value.updatedAt) || new Date(0).toISOString()

  return {
    slotIndex,
    ref: normalizedRef,
    label,
    mediaType,
    updatedAt,
  }
}

export function readUploadedBackgroundSlots(ownedItems: Record<string, unknown>): UploadedBackgroundSlotRecord[] {
  const rawValue = ownedItems[UPLOADED_BACKGROUND_SLOTS_KEY]
  if (!Array.isArray(rawValue)) return []

  const seenSlotIndexes = new Set<number>()
  return rawValue
    .map((item) => parseUploadedBackgroundSlotRecord(item))
    .filter((item): item is UploadedBackgroundSlotRecord => Boolean(item))
    .filter((item) => {
      if (seenSlotIndexes.has(item.slotIndex)) return false
      seenSlotIndexes.add(item.slotIndex)
      return true
    })
    .sort((left, right) => left.slotIndex - right.slotIndex)
}

export function buildUploadedBackgroundSlotRecord(params: {
  slotIndex: number
  ref: string
  label: string
  mediaType: AssetMediaType
  updatedAt?: string
}): UploadedBackgroundSlotRecord {
  return {
    slotIndex: params.slotIndex,
    ref: params.ref,
    label: params.label.trim() || txa('Kişisel arka plan {v1}', { v1: params.slotIndex + 1 }),
    mediaType: params.mediaType,
    updatedAt: params.updatedAt || new Date().toISOString(),
  }
}

export function upsertUploadedBackgroundSlot(
  ownedItems: Record<string, unknown>,
  nextSlot: UploadedBackgroundSlotRecord,
): Record<string, unknown> {
  const existingSlots = readUploadedBackgroundSlots(ownedItems).filter((slot) => slot.slotIndex !== nextSlot.slotIndex)
  return {
    ...ownedItems,
    [UPLOADED_BACKGROUND_SLOTS_KEY]: [...existingSlots, nextSlot].sort((left, right) => left.slotIndex - right.slotIndex),
  }
}

export function withProfileBackgroundUploadSlotLimit(
  ownedItems: Record<string, unknown>,
  slotLimit: number,
): Record<string, unknown> {
  const normalizedSlotLimit = normalizeSlotCount(slotLimit) || PROFILE_BACKGROUND_UPLOAD_LIMITS.default
  return {
    ...ownedItems,
    [PROFILE_BACKGROUND_UPLOAD_SLOT_LIMIT_KEY]: normalizedSlotLimit,
  }
}

export function withProfileBackgroundUploadSlotPreset(
  ownedItems: Record<string, unknown>,
  preset: ProfileBackgroundUploadSlotPreset | null,
): Record<string, unknown> {
  if (!preset) {
    const { [PROFILE_BACKGROUND_UPLOAD_SLOT_PRESET_KEY]: _ignoredPreset, ...restOwnedItems } = ownedItems
    return restOwnedItems
  }

  return {
    ...ownedItems,
    [PROFILE_BACKGROUND_UPLOAD_SLOT_PRESET_KEY]: preset,
    [PROFILE_BACKGROUND_UPLOAD_SLOT_LIMIT_KEY]: PROFILE_BACKGROUND_UPLOAD_LIMIT_PRESETS[preset],
  }
}

function readProfileBackgroundUploadSlotLimitOverride(ownedItems: Record<string, unknown>) {
  const preset = normalizeSlotPreset(ownedItems[PROFILE_BACKGROUND_UPLOAD_SLOT_PRESET_KEY])
  if (preset) return PROFILE_BACKGROUND_UPLOAD_LIMIT_PRESETS[preset]

  const explicitLimit = normalizeSlotCount(ownedItems[PROFILE_BACKGROUND_UPLOAD_SLOT_LIMIT_KEY])
  return explicitLimit || null
}

export function resolveProfileBackgroundUploadSlotLimit(
  ownedItems: Record<string, unknown>,
  premiumExpiresAt: string | null,
) {
  const baseLimit = isPremiumActive(premiumExpiresAt)
    ? PROFILE_BACKGROUND_UPLOAD_LIMITS.premium
    : PROFILE_BACKGROUND_UPLOAD_LIMITS.default
  const premiumOverride = isPremiumActive(premiumExpiresAt)
    ? readProfileBackgroundUploadSlotLimitOverride(ownedItems)
    : null

  return premiumOverride || baseLimit
}

export function resolveProfileBackgroundUploadTargetSlotIndex(
  ownedItems: Record<string, unknown>,
  requestedSlotIndex: number | null | undefined,
  maxSlots: number,
) {
  if (maxSlots <= 1) return 0
  if (typeof requestedSlotIndex === 'number' && requestedSlotIndex >= 0 && requestedSlotIndex < maxSlots) {
    return requestedSlotIndex
  }

  const occupiedSlots = new Set(readUploadedBackgroundSlots(ownedItems).map((slot) => slot.slotIndex))
  for (let slotIndex = 0; slotIndex < maxSlots; slotIndex += 1) {
    if (!occupiedSlots.has(slotIndex)) return slotIndex
  }
  return 0
}

export function toOwnedBackgroundFromUploadedSlot(slot: UploadedBackgroundSlotRecord): OwnedBackground {
  return {
    id: slot.ref,
    label: slot.label,
    background: slot.ref,
    mediaType: slot.mediaType,
    origin: 'upload',
    slotIndex: slot.slotIndex,
  }
}

export function resolveUploadedBackgroundsFromOwnedItems(ownedItems: Record<string, unknown>): OwnedBackground[] {
  return readUploadedBackgroundSlots(ownedItems).map((slot) => toOwnedBackgroundFromUploadedSlot(slot))
}

export function extractUploadedBackgroundSlotIndex(ref?: string | null): number | undefined {
  if (typeof ref !== 'string') return undefined
  const match = ref.match(/\/slot-(\d{2})\.(?:avif|gif|jpe?g|png|webp|mp4|webm)$/i)
  if (!match) return undefined
  const parsed = Number.parseInt(match[1], 10)
  if (!Number.isInteger(parsed) || parsed <= 0) return undefined
  return parsed - 1
}
