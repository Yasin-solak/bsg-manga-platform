import { txa } from '@/i18n/activeLocale'
/**
 * "Lucky pick": weighted random series selection.
 *
 * Rule (user decision): if the user's genres are KNOWN those genres get a slightly higher
 * chance, but **not every time**. If unknown, plain random.
 *
 * This file is PURE: no network, no dates, randomness is injected.
 * So "lucky" behavior can be tested deterministically: with
 * randomness generated inside, there would be no way to verify the rule.
 */

/** Minimum genre signals needed for weighting. */
export const MIN_GENRE_SIGNALS = 3

/** Probability of drawing from the preference pool. The rest is from the whole catalog. */
export const PREFERRED_POOL_RATIO = 0.6

export type LuckyReason = 'preferred' | 'surprise' | 'random' | 'reread'

export interface LuckyCandidate {
  id: string
  genres?: string[]
}

export interface LuckyPickInput<T extends LuckyCandidate> {
  /** All selectable series. */
  candidates: T[]
  /** Kullanicinin tur sinyalleri (onboarding + okuma gecmisi birlesik). */
  genreSignals: string[]
  /** Takip edilen ya da okunmus seri id'leri; havuzdan cikarilir. */
  excludeIds: Set<string>
  /** Range [0,1). Tests give a deterministic value. */
  random: () => number
}

export interface LuckyPickResult<T> {
  manga: T | null
  reason: LuckyReason
  /** Tercih havuzundan geldiyse eslesen tur; rozette gosterilir. */
  matchedGenre?: string
}

/** Ignores case and whitespace differences; "Aksiyon" and "aksiyon" are the same genre. */
function normalizeGenre(value: string): string {
  return value.trim().toLocaleLowerCase('tr')
}

function pickOne<T>(items: T[], random: () => number): T | null {
  if (items.length === 0) return null
  const index = Math.min(items.length - 1, Math.floor(random() * items.length))
  return items[index] ?? null
}

export function pickLucky<T extends LuckyCandidate>({
  candidates,
  genreSignals,
  excludeIds,
  random,
}: LuckyPickInput<T>): LuckyPickResult<T> {
  /*
   * FILTER first: a series already followed or read is not "luck".
   * Without filtering, the most likely result would be a series the user knows,
   * because read series come from the most popular part of the catalog.
   */
  const fresh = candidates.filter((item) => !excludeIds.has(item.id))

  // Rather than leave a user who has read everything with an empty screen, we relax the filter.
  if (fresh.length === 0) {
    const anyManga = pickOne(candidates, random)
    return { manga: anyManga, reason: anyManga ? 'reread' : 'random' }
  }

  const signals = new Set(genreSignals.map(normalizeGenre).filter(Boolean))

  /*
   * No weighting when signals are BELOW THE THRESHOLD.
   * Claiming "your genre" from a single genre would be a guess, not data, and
   * a wrong guess loses more trust than no guess.
   */
  if (signals.size < MIN_GENRE_SIGNALS) {
    return { manga: pickOne(fresh, random), reason: 'random' }
  }

  const preferred = fresh.filter((item) =>
    (item.genres || []).some((genre) => signals.has(normalizeGenre(genre))),
  )

  /*
   * The dice roll FIRST: even with a full preference pool, there is a 40% chance of drawing from the whole
   * catalog. A "lucky pick" that always returns your own genre stops being luck;
   * the user wanted this on purpose.
   */
  const roll = random()
  const usePreferred = preferred.length > 0 && roll < PREFERRED_POOL_RATIO

  if (!usePreferred) {
    return { manga: pickOne(fresh, random), reason: 'surprise' }
  }

  const chosen = pickOne(preferred, random)
  if (!chosen) return { manga: pickOne(fresh, random), reason: 'surprise' }

  const matched = (chosen.genres || []).find((genre) => signals.has(normalizeGenre(genre)))
  return { manga: chosen, reason: 'preferred', matchedGenre: matched }
}

/** Badge text; "completely random" is a reason too and says so. */
export function luckyReasonLabel(result: LuckyPickResult<unknown>): string {
  switch (result.reason) {
    case 'preferred':
      return result.matchedGenre ? txa('{v1} sevdiğin için', { v1: result.matchedGenre }) : txa('Sana göre')
    case 'surprise':
      return txa('Sürpriz')
    case 'reread':
      return txa('Tekrar okumaya değer')
    default:
      return txa('Tamamen rastgele')
  }
}
