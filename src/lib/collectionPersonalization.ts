/**
 * Selects home page collections by the user's genres.
 *
 * The rule uses the SAME threshold as "Lucky pick": without enough genre signal there is no
 * personalization and the default order is used. Sharing a threshold between the two surfaces is
 * deliberate: if a user sees "for you" in one place but not the other, they
 * cannot tell which is right.
 *
 * PURE: no data access; the order is determined by signals passed in.
 */

import { MIN_GENRE_SIGNALS } from './luckyPick'

export interface PersonalizableCollection {
  id: string
  targetGenreId: string
  sortOrder: number
}

interface SelectInput<T extends PersonalizableCollection> {
  collections: T[]
  /** The user's genre signals; PRIORITY ORDER matters (first = most read). */
  genreSignals: string[]
  limit?: number
}

export interface CollectionSelection<T> {
  items: T[]
  /** Was personalization applied? The UI can tell the user. */
  personalized: boolean
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase('tr')
}

export function selectCollections<T extends PersonalizableCollection>({
  collections,
  genreSignals,
  limit = 4,
}: SelectInput<T>): CollectionSelection<T> {
  const byOrder = [...collections].sort((a, b) => a.sortOrder - b.sortOrder)

  const signals = genreSignals.map(normalize).filter(Boolean)
  const uniqueSignals = Array.from(new Set(signals))

  /*
   * NO personalization below the threshold.
   * Saying "for you" from one signal would present a guess as data, and
   * wrong personalization loses more trust than none at all.
   */
  if (uniqueSignals.length < MIN_GENRE_SIGNALS) {
    return { items: byOrder.slice(0, limit), personalized: false }
  }

  /*
   * Matches are ordered by the user's SIGNAL ORDER: the most-read genre comes
   * first. Sorting alphabetically or by sortOrder would waste half of
   * the personalization.
   */
  const rank = new Map<string, number>()
  uniqueSignals.forEach((genre, index) => rank.set(genre, index))

  const matched = byOrder
    .filter((item) => rank.has(normalize(item.targetGenreId)))
    .sort((a, b) => {
      const ra = rank.get(normalize(a.targetGenreId)) ?? Number.MAX_SAFE_INTEGER
      const rb = rank.get(normalize(b.targetGenreId)) ?? Number.MAX_SAFE_INTEGER
      return ra - rb || a.sortOrder - b.sortOrder
    })

  // Hicbiri eslesmediyse kisisellestirilmis GIBI gostermeyiz.
  if (matched.length === 0) {
    return { items: byOrder.slice(0, limit), personalized: false }
  }

  /*
   * If matches fall short, the rest is FILLED from the default order: leaving a four-slot
   * grid with two cards would make personalization look like a loss
   * rather than a gain.
   */
  const seen = new Set(matched.map((item) => item.id))
  const filler = byOrder.filter((item) => !seen.has(item.id))

  return {
    items: [...matched, ...filler].slice(0, limit),
    personalized: true,
  }
}
