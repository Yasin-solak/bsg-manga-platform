import { createRandomSlugSuffix, slugifyText } from '@/lib/slug'

const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/

export const FANSUB_NAME_MIN_LENGTH = 3
export const FANSUB_NAME_MAX_LENGTH = 32
export const FANSUB_DESCRIPTION_MAX_LENGTH = 150
export const FANSUB_SLUG_MIN_LENGTH = 3
export const FANSUB_SLUG_MAX_LENGTH = 40
export const FANSUB_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
export const RESERVED_FANSUB_SLUGS = ['yonet', 'manga', 'bolum', 'ekle', 'tier'] as const
export const FANSUB_VANITY_URL_COOLDOWN_DAYS = 30

const emptyToUndefined = (value: unknown) => {
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

export function createOptionalTrimmedStringPreprocessor(maxLength: number) {
  return {
    maxLength,
    emptyToUndefined,
  }
}

export function normalizeOptionalStringArray(value: unknown) {
  if (!Array.isArray(value)) return undefined
  const normalized = value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter(Boolean)
  return normalized.length > 0 ? normalized : undefined
}

export function getHexColorPattern() {
  return HEX_COLOR_RE
}

export function slugifyFansubName(name: string) {
  const slug = slugifyText(name, { maxLength: FANSUB_SLUG_MAX_LENGTH })

  return slug || `fansub-${createRandomSlugSuffix(6)}`
}
