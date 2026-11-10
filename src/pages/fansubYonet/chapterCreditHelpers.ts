import {
  FANSUB_CHAPTER_CREDIT_DEFAULT_SUPPORTER_COUNT,
  clampFansubChapterCreditSupporterCount,
  normalizeFansubChapterCreditCtaTarget,
  type FansubChapterCreditCtaTarget,
} from '@/lib/fansubChapterCredit'
import type {
  FansubChapterCreditOverride,
  FansubChapterCreditSettings,
  UpsertFansubChapterCreditOverrideInput,
  UpsertFansubChapterCreditSettingsInput,
} from '@/services/fansubChapterCreditService'
import type { ChapterCreditPresentationConfigInput } from '@/components/fansub/chapterCreditPresentation'
import { txa } from '@/i18n/activeLocale'

export type ChapterCreditToggleMode = 'inherit' | 'show' | 'hide'

export type ChapterCreditSettingsForm = {
  isEnabled: boolean
  title: string
  body: string
  ctaLabel: string
  ctaTarget: FansubChapterCreditCtaTarget | ''
  showMetrics: boolean
  showSupporters: boolean
  maxSupporterCount: string
}

export type ChapterCreditOverrideForm = {
  chapterId: string
  overrideMode: 'disabled' | 'custom'
  title: string
  body: string
  ctaLabel: string
  ctaTarget: FansubChapterCreditCtaTarget | ''
  showMetricsMode: ChapterCreditToggleMode
  showSupportersMode: ChapterCreditToggleMode
  maxSupporterCount: string
}

export const CHAPTER_CREDIT_SUPPORTER_OPTIONS = [1, 2] as const

export const CHAPTER_CREDIT_CTA_OPTIONS: Array<{
  value: FansubChapterCreditCtaTarget
  label: string
  description: string
}> = [
  { value: 'fansub', get label() { return txa('Fansub sayfasi') }, get description() { return txa('Fansub profilini acar.') } },
  { value: 'takviye', get label() { return txa('Takviye sekmesi') }, get description() { return txa('Takviye sekmesine goturur.') } },
  { value: 'mangalar', get label() { return txa('Mangalar sekmesi') }, get description() { return txa('Fansubun manga rafini acar.') } },
]

export function createChapterCreditSettingsForm(
  settings: FansubChapterCreditSettings,
): ChapterCreditSettingsForm {
  return {
    isEnabled: settings.isEnabled,
    title: settings.title || '',
    body: settings.body || '',
    ctaLabel: settings.ctaLabel || '',
    ctaTarget: settings.ctaTarget || '',
    showMetrics: settings.showMetrics,
    showSupporters: settings.showSupporters,
    maxSupporterCount: String(Math.min(clampFansubChapterCreditSupporterCount(settings.maxSupporterCount), 2)),
  }
}

export function createEmptyChapterCreditOverrideForm(chapterId = ''): ChapterCreditOverrideForm {
  return {
    chapterId,
    overrideMode: 'custom',
    title: '',
    body: '',
    ctaLabel: '',
    ctaTarget: '',
    showMetricsMode: 'inherit',
    showSupportersMode: 'inherit',
    maxSupporterCount: '',
  }
}

export function createChapterCreditOverrideForm(
  override: FansubChapterCreditOverride | null,
): ChapterCreditOverrideForm {
  if (!override) return createEmptyChapterCreditOverrideForm()

  return {
    chapterId: override.chapterId,
    overrideMode: override.overrideMode === 'disabled' ? 'disabled' : 'custom',
    title: override.title || '',
    body: override.body || '',
    ctaLabel: override.ctaLabel || '',
    ctaTarget: override.ctaTarget || '',
    showMetricsMode: override.showMetrics == null ? 'inherit' : override.showMetrics ? 'show' : 'hide',
    showSupportersMode: override.showSupporters == null ? 'inherit' : override.showSupporters ? 'show' : 'hide',
    maxSupporterCount: override.maxSupporterCount == null
      ? ''
      : String(Math.min(clampFansubChapterCreditSupporterCount(override.maxSupporterCount), 2)),
  }
}

export function buildChapterCreditSettingsInput(
  fansubId: string,
  form: ChapterCreditSettingsForm,
): UpsertFansubChapterCreditSettingsInput {
  return {
    fansubId,
    isEnabled: form.isEnabled,
    title: form.title.trim() || null,
    body: form.body.trim() || null,
    ctaLabel: form.ctaLabel.trim() || null,
    ctaTarget: normalizeFansubChapterCreditCtaTarget(form.ctaTarget) || null,
    showMetrics: form.showMetrics,
    showSupporters: form.showSupporters,
    maxSupporterCount: Math.min(
      clampFansubChapterCreditSupporterCount(Number(form.maxSupporterCount || FANSUB_CHAPTER_CREDIT_DEFAULT_SUPPORTER_COUNT)),
      2,
    ),
  }
}

export function buildChapterCreditOverrideInput(
  fansubId: string,
  form: ChapterCreditOverrideForm,
): UpsertFansubChapterCreditOverrideInput {
  return {
    fansubId,
    chapterId: form.chapterId,
    overrideMode: form.overrideMode,
    title: form.overrideMode === 'custom' ? (form.title.trim() || null) : null,
    body: form.overrideMode === 'custom' ? (form.body.trim() || null) : null,
    ctaLabel: form.overrideMode === 'custom' ? (form.ctaLabel.trim() || null) : null,
    ctaTarget: form.overrideMode === 'custom' ? (normalizeFansubChapterCreditCtaTarget(form.ctaTarget) || null) : null,
    showMetrics: form.overrideMode === 'custom'
      ? form.showMetricsMode === 'inherit'
        ? null
        : form.showMetricsMode === 'show'
      : null,
    showSupporters: form.overrideMode === 'custom'
      ? form.showSupportersMode === 'inherit'
        ? null
        : form.showSupportersMode === 'show'
      : null,
    maxSupporterCount: form.overrideMode === 'custom' && form.maxSupporterCount
      ? Math.min(clampFansubChapterCreditSupporterCount(Number(form.maxSupporterCount)), 2)
      : null,
  }
}

export function buildChapterCreditPreviewConfig(
  settingsForm: ChapterCreditSettingsForm,
  overrideForm?: ChapterCreditOverrideForm | null,
): ChapterCreditPresentationConfigInput {
  const base: ChapterCreditPresentationConfigInput = {
    title: settingsForm.title.trim() || null,
    body: settingsForm.body.trim() || null,
    ctaLabel: settingsForm.ctaLabel.trim() || null,
    ctaTarget: normalizeFansubChapterCreditCtaTarget(settingsForm.ctaTarget) || null,
    showMetrics: settingsForm.showMetrics,
    showSupporters: settingsForm.showSupporters,
    maxSupporterCount: Math.min(
      clampFansubChapterCreditSupporterCount(Number(settingsForm.maxSupporterCount || FANSUB_CHAPTER_CREDIT_DEFAULT_SUPPORTER_COUNT)),
      2,
    ),
  }

  if (!overrideForm || overrideForm.overrideMode === 'disabled') return base

  return {
    title: overrideForm.title.trim() || base.title,
    body: overrideForm.body.trim() || base.body,
    ctaLabel: overrideForm.ctaLabel.trim() || base.ctaLabel,
    ctaTarget: normalizeFansubChapterCreditCtaTarget(overrideForm.ctaTarget) || base.ctaTarget,
    showMetrics: overrideForm.showMetricsMode === 'inherit'
      ? base.showMetrics
      : overrideForm.showMetricsMode === 'show',
    showSupporters: overrideForm.showSupportersMode === 'inherit'
      ? base.showSupporters
      : overrideForm.showSupportersMode === 'show',
    maxSupporterCount: overrideForm.maxSupporterCount
      ? Math.min(clampFansubChapterCreditSupporterCount(Number(overrideForm.maxSupporterCount)), 2)
      : base.maxSupporterCount,
  }
}

export function formatChapterCreditOverrideLabel(override: FansubChapterCreditOverride) {
  const chapterLabel = `${txa('Bolum {v1}', { v1: override.chapterNumber })}${override.chapterTitle ? ` - ${override.chapterTitle}` : ''}`
  return `${override.mangaTitle} / ${chapterLabel}`
}
