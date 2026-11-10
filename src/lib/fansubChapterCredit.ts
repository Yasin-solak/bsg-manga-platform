import { txa } from '@/i18n/activeLocale'
export const FANSUB_CHAPTER_CREDIT_TITLE_MAX = 96
export const FANSUB_CHAPTER_CREDIT_BODY_MAX = 180
export const FANSUB_CHAPTER_CREDIT_CTA_LABEL_MAX = 32
export const FANSUB_CHAPTER_CREDIT_MIN_SUPPORTER_COUNT = 1
export const FANSUB_CHAPTER_CREDIT_MAX_SUPPORTER_COUNT = 6
export const FANSUB_CHAPTER_CREDIT_DEFAULT_SUPPORTER_COUNT = 2

export const FANSUB_CHAPTER_CREDIT_CTA_TARGETS = [
  'fansub',
  'takviye',
  'mangalar',
] as const

export type FansubChapterCreditCtaTarget = (typeof FANSUB_CHAPTER_CREDIT_CTA_TARGETS)[number]

export const FANSUB_CHAPTER_CREDIT_OVERRIDE_MODES = [
  'inherit',
  'disabled',
  'custom',
] as const

export type FansubChapterCreditOverrideMode = (typeof FANSUB_CHAPTER_CREDIT_OVERRIDE_MODES)[number]

export type ResolvedFansubChapterCreditCopy = {
  title: string
  body: string
  ctaLabel: string
}

function isFansubChapterCreditCtaTarget(value: string): value is FansubChapterCreditCtaTarget {
  return FANSUB_CHAPTER_CREDIT_CTA_TARGETS.includes(value as FansubChapterCreditCtaTarget)
}

function isFansubChapterCreditOverrideMode(value: string): value is FansubChapterCreditOverrideMode {
  return FANSUB_CHAPTER_CREDIT_OVERRIDE_MODES.includes(value as FansubChapterCreditOverrideMode)
}

export function normalizeFansubChapterCreditCtaTarget(
  value: string | null | undefined,
): FansubChapterCreditCtaTarget | null {
  const normalized = value?.trim().toLowerCase() || ''
  if (!normalized) return null
  return isFansubChapterCreditCtaTarget(normalized) ? normalized : null
}

export function normalizeFansubChapterCreditOverrideMode(
  value: string | null | undefined,
): FansubChapterCreditOverrideMode {
  const normalized = value?.trim().toLowerCase() || ''
  return isFansubChapterCreditOverrideMode(normalized) ? normalized : 'inherit'
}

export function clampFansubChapterCreditSupporterCount(value: number | null | undefined) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return FANSUB_CHAPTER_CREDIT_DEFAULT_SUPPORTER_COUNT
  return Math.min(
    FANSUB_CHAPTER_CREDIT_MAX_SUPPORTER_COUNT,
    Math.max(FANSUB_CHAPTER_CREDIT_MIN_SUPPORTER_COUNT, Math.floor(numeric)),
  )
}

export function resolveFansubChapterCreditFallbackCopy(
  fansubName: string,
): ResolvedFansubChapterCreditCopy {
  const safeFansubName = fansubName.trim() || 'Bu fansub'

  return {
    title: `${safeFansubName} bu bolumu yayina hazirladi.`,
    body: 'Takimin sayfasina giderek yeni bolumleri ve guncel duyurulari inceleyebilirsin.',
    ctaLabel: txa('Fansub sayfasina git'),
  }
}
