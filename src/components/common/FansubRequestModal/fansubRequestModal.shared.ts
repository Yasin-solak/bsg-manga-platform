import type { FansubRequestMeta } from '@/services/fansubService'
import { txa } from '@/i18n/activeLocale'

export const STEP_LABELS = [
  'Temel Bilgi',
  'Yayın Planı',
  'Ekip ve İletişim',
  'Kimlik ve Kurallar',
] as const

export const GENRE_SUGGESTIONS = ['Aksiyon', 'Fantastik', 'Romantik', 'Gerilim', 'Komedi', 'Slice of Life']
export const CONTENT_TYPE_OPTIONS = ['Manga', 'Manhwa', 'Manhua', 'Webtoon']
export const TEAM_ROLE_OPTIONS = ['Translator', 'Cleaner', 'Typesetter', 'Editor', 'QC', 'Redrawer']
export const FANSUB_AVATAR_MAX_BYTES = 2 * 1024 * 1024
export const FANSUB_AVATAR_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const

export type FansubRequestStep = 1 | 2 | 3 | 4
export type FansubAgeRatingPolicy = 'all' | 'teen' | 'mature'
export type FansubExperienceLevel = 'new' | 'intermediate' | 'experienced'

export interface FansubRequestDraft {
  name: string
  description: string
  ageRatingPolicy: FansubAgeRatingPolicy
  focusGenresInput: string
  weeklyReleaseGoal: string
  experienceLevel: FansubExperienceLevel
  contentTypes: string[]
  teamSize: string
  recruitmentOpen: boolean
  teamRolesNeeded: string[]
  contactEmail: string
  contactDiscord: string
  portfolioNotes: string
  dmcaAccepted: boolean
}

export function createInitialFansubRequestDraft(): FansubRequestDraft {
  return {
    name: '',
    description: '',
    ageRatingPolicy: 'teen',
    focusGenresInput: '',
    weeklyReleaseGoal: '',
    experienceLevel: 'new',
    contentTypes: [txa('Manga')],
    teamSize: '',
    recruitmentOpen: true,
    teamRolesNeeded: [],
    contactEmail: '',
    contactDiscord: '',
    portfolioNotes: '',
    dmcaAccepted: false,
  }
}

export function splitCsv(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

export function appendCsvValue(current: string, value: string) {
  const existing = splitCsv(current).map((item) => item.toLowerCase())
  if (existing.includes(value.toLowerCase())) return current
  return current.trim().length > 0 ? `${current}, ${value}` : value
}

export function toggleListValue(items: string[], value: string) {
  return items.includes(value) ? items.filter((item) => item !== value) : [...items, value]
}

export function formatListValue(items: string[] | undefined, fallback = '-') {
  return items && items.length > 0 ? items.join(', ') : fallback
}

export function getExperienceLabel(value: FansubExperienceLevel) {
  if (value === 'experienced') return txa('Deneyimli ekip')
  if (value === 'intermediate') return txa('Orta seviye ekip')
  return txa('Yeni ekip')
}

export function getAgeRatingLabel(value: FansubAgeRatingPolicy) {
  if (value === 'all') return txa('Herkese uygun')
  if (value === 'mature') return txa('Yetişkin içerik olabilir')
  return txa('13+ ağırlıklı')
}

export function getDraftCompletion(draft: FansubRequestDraft) {
  const checks = [
    draft.name.trim().length >= 3,
    draft.description.trim().length >= 10,
    splitCsv(draft.focusGenresInput).length > 0,
    Boolean(draft.weeklyReleaseGoal),
    draft.contentTypes.length > 0,
    Boolean(draft.teamSize),
    Boolean(draft.contactEmail.trim() || draft.contactDiscord.trim()),
    draft.dmcaAccepted,
  ]
  return Math.round((checks.filter(Boolean).length / checks.length) * 100)
}

export function buildFansubRequestMeta(
  draft: FansubRequestDraft,
  dmcaAcceptedAt: string,
): FansubRequestMeta {
  return {
    contactEmail: draft.contactEmail || undefined,
    contactDiscord: draft.contactDiscord || undefined,
    teamSize: draft.teamSize ? Number(draft.teamSize) : undefined,
    experienceLevel: draft.experienceLevel,
    focusGenres: splitCsv(draft.focusGenresInput),
    weeklyReleaseGoal: draft.weeklyReleaseGoal ? Number(draft.weeklyReleaseGoal) : undefined,
    contentTypes: draft.contentTypes,
    recruitmentOpen: draft.recruitmentOpen,
    teamRolesNeeded: draft.teamRolesNeeded,
    portfolioNotes: draft.portfolioNotes || undefined,
    ageRatingPolicy: draft.ageRatingPolicy,
    dmcaAccepted: true,
    dmcaAcceptedAt,
  }
}
