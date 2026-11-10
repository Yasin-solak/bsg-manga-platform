import { txa } from '@/i18n/activeLocale'
type FansubIdentityRecord = Record<string, unknown>

export type FansubIdentityTagAudience = 'shared' | 'member' | 'supporter'
export type FansubIdentityBadgeKey =
  | 'leaf'
  | 'blade'
  | 'heart'
  | 'flame'
  | 'drop'
  | 'moon'
  | 'bolt'
  | 'gem'

export interface FansubIdentityTagPresentation {
  id: string
  fansubId: string
  fansubName?: string | null
  fansubSlug?: string | null
  audience: FansubIdentityTagAudience
  shortcode: string
  badgeKey: string
}

export interface FansubIdentityBadgeMeta {
  key: FansubIdentityBadgeKey
  label: string
  tone: string
  borderTone: string
  glowTone: string
}

export const FANSUB_IDENTITY_BADGE_CATALOG: FansubIdentityBadgeMeta[] = [
  { key: 'leaf', get label() { return txa('Yaprak') }, tone: 'text-lime-300', borderTone: 'border-lime-400/30', glowTone: 'from-lime-500/14' },
  { key: 'blade', get label() { return txa('Kilic') }, tone: 'text-amber-200', borderTone: 'border-amber-400/28', glowTone: 'from-amber-500/14' },
  { key: 'heart', get label() { return txa('Kalp') }, tone: 'text-pink-300', borderTone: 'border-pink-400/30', glowTone: 'from-pink-500/14' },
  { key: 'flame', get label() { return txa('Alev') }, tone: 'text-orange-300', borderTone: 'border-orange-400/30', glowTone: 'from-orange-500/14' },
  { key: 'drop', get label() { return txa('Damla') }, tone: 'text-cyan-300', borderTone: 'border-cyan-400/28', glowTone: 'from-cyan-500/14' },
  { key: 'moon', get label() { return txa('Ay') }, tone: 'text-violet-200', borderTone: 'border-violet-400/28', glowTone: 'from-violet-500/14' },
  { key: 'bolt', get label() { return txa('Simsek') }, tone: 'text-yellow-200', borderTone: 'border-yellow-400/28', glowTone: 'from-yellow-500/14' },
  { key: 'gem', get label() { return txa('Kristal') }, tone: 'text-sky-300', borderTone: 'border-sky-400/28', glowTone: 'from-sky-500/14' },
]

const FANSUB_IDENTITY_BADGE_LOOKUP = new Map(
  FANSUB_IDENTITY_BADGE_CATALOG.map((badge) => [badge.key, badge] as const),
)

function asRecord(value: unknown): FansubIdentityRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as FansubIdentityRecord)
    : null
}

function readString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export function normalizeFansubIdentityShortcode(value: string) {
  return value.replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 4)
}

export function isFansubIdentityAudience(value: unknown): value is FansubIdentityTagAudience {
  return value === 'shared' || value === 'member' || value === 'supporter'
}

export function getFansubIdentityAudienceLabel(audience: FansubIdentityTagAudience) {
  if (audience === 'shared') return 'Fansub etiketi'
  return audience === 'member' ? 'Uye etiketi' : 'Destekci etiketi'
}

export function getFansubIdentityBadgeMeta(badgeKey: string) {
  return FANSUB_IDENTITY_BADGE_LOOKUP.get(badgeKey as FansubIdentityBadgeKey) || null
}

export function parseFansubIdentityTag(value: unknown): FansubIdentityTagPresentation | null {
  const row = asRecord(value)
  if (!row) return null

  const id = readString(row.id)
  const fansubId = readString(row.fansubId ?? row.fansub_id)
  const rawAudience = readString(row.audience).toLowerCase()
  const audience = isFansubIdentityAudience(rawAudience) ? rawAudience : 'shared'
  const shortcode = normalizeFansubIdentityShortcode(readString(row.shortcode))
  const badgeKey = readString(row.badgeKey ?? row.badge_key).toLowerCase()

  if (!id || !fansubId || !shortcode || !badgeKey) {
    return null
  }

  const fansubName = readString(row.fansubName ?? row.fansub_name) || null
  const fansubSlug = readString(row.fansubSlug ?? row.fansub_slug) || null

  return {
    id,
    fansubId,
    fansubName,
    fansubSlug,
    audience,
    shortcode,
    badgeKey,
  }
}
