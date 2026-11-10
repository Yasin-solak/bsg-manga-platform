import { intlLocale, txa } from '@/i18n/activeLocale'
/**
 * Nitro early access rule.
 *
 * When a chapter is published it is **open to Nitro members**; non-members wait a fixed
 * time. Example: chapter published at 12:00, rule is 36 hours. A non-member arriving
 * at 16:00 sees "opens in 32 hours".
 *
 * **The rule is GLOBAL, not per-chapter data.** The schema has no early access column and none
 * was added: if every chapter uses the same duration, writing it on every row would mean
 * updating thousands of rows the day it changes. If the duration ever
 * varies per fansub, this opens up to a parameter.
 */

/** How long a non-member waits. Single source: the UI and (later) the server should use the same number. */
export const EARLY_ACCESS_HOURS = 36

const HOUR_MS = 60 * 60 * 1000

export interface EarlyAccessState {
  /** Still locked for a non-member? */
  locked: boolean
  /** Herkese acilacagi an. */
  opensAt: Date | null
  /** Kalan tam saat (yukari yuvarlanir); kilitli degilse 0. */
  hoursRemaining: number
  /**
   * The chapter is NOT PUBLISHED YET (publish_at is in the future).
   *
   * This differs from "non-member is waiting": at this stage Nitro members cannot
   * read either. Treating them the same would show a Nitro prompt next to a chapter
   * nobody can open, implying that buying it unlocks it.
   */
  notYetPublished: boolean
}

interface EarlyAccessInput {
  /** Bolumun yayin ani (ISO). Yoksa kilit UYGULANMAZ. */
  publishAt?: string | null
  /** Nitro/premium uyeligi aktif mi. */
  isPremium: boolean
  /** Can be passed in for testability. */
  nowMs?: number
  hours?: number
}

export function getEarlyAccessState({
  publishAt,
  isPremium,
  nowMs = Date.now(),
  hours = EARLY_ACCESS_HOURS,
}: EarlyAccessInput): EarlyAccessState {
  const unlocked: EarlyAccessState = {
    locked: false,
    opensAt: null,
    hoursRemaining: 0,
    notYetPublished: false,
  }

  // The lock is never calculated for a member.
  if (isPremium) return unlocked

  // Do not lock if the publish time is UNKNOWN. Treating missing data as "locked" would
  // make a public chapter look inaccessible.
  if (!publishAt) return unlocked

  const publishedMs = Date.parse(publishAt)
  if (Number.isNaN(publishedMs)) return unlocked

  const opensAtMs = publishedMs + hours * HOUR_MS
  if (nowMs >= opensAtMs) return unlocked

  // If the publish time is in the future the chapter is open to nobody; presenting the remaining hours
  // as an "early access wait" would be wrong. The number also grew unreadable:
  // a chapter scheduled eight days out said "237 hours".
  const notYetPublished = publishedMs > nowMs

  return {
    locked: true,
    opensAt: new Date(opensAtMs),
    // Round up: saying "31 hours" with 31h 10m left would imply it
    // opens earlier than the user is waiting for.
    hoursRemaining: notYetPublished ? 0 : Math.ceil((opensAtMs - nowMs) / HOUR_MS),
    notYetPublished,
  }
}

/**
 * "Public in 32 hours" / "Public in 2 hours"
 *
 * For an unpublished chapter, a DATE instead of hours: a countdown only makes sense after
 * publishing; before that it produced unreadable numbers like "237 hours".
 */
export function formatEarlyAccessLabel(state: EarlyAccessState): string {
  if (!state.locked) return ''
  if (state.notYetPublished) {
    if (!state.opensAt) return ''
    const date = state.opensAt.toLocaleDateString(intlLocale(), { day: 'numeric', month: 'long' })
    return txa('{date} tarihinde herkese açık', { date })
  }
  return txa('{hours} saat sonra herkese açık', { hours: state.hoursRemaining })
}
