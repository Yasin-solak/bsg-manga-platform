/**
 * "Recent searches": one of the four items in the prototype's Explore spec.
 *
 * WHY ON THE DEVICE, NOT THE SERVER: search history is a record of what a person
 * looked for. Keeping it on the server leaves a trace the user cannot delete, and
 * does not work for signed-out visitors anyway. On the device
 * "Clear" really deletes.
 *
 * Ordered and unique: a repeated query moves up in the list
 * rather than opening a second row.
 */

const STORAGE_KEY = 'bsgmanga:recent-searches'

/** The prototype has a short list; a longer one shows an archive, not recent searches. */
export const RECENT_SEARCH_LIMIT = 6

/** Very long queries overflow the row and are not worth keeping. */
const MAX_QUERY_LENGTH = 64

function read(): string[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      .slice(0, RECENT_SEARCH_LIMIT)
  } catch {
    // Storage off or record broken: no history shown, search still works.
    return []
  }
}

export function readRecentSearches(): string[] {
  return read()
}

export function rememberRecentSearch(query: string): string[] {
  const trimmed = query.trim().slice(0, MAX_QUERY_LENGTH)
  if (!trimmed) return read()

  const existing = read()
  // The same query with different casing should not open two rows.
  const lowered = trimmed.toLocaleLowerCase('tr')
  const next = [trimmed, ...existing.filter((item) => item.toLocaleLowerCase('tr') !== lowered)]
    .slice(0, RECENT_SEARCH_LIMIT)

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Yazilamazsa da arama calismaya devam eder.
  }
  return next
}

export function forgetRecentSearch(query: string): string[] {
  const lowered = query.trim().toLocaleLowerCase('tr')
  const next = read().filter((item) => item.toLocaleLowerCase('tr') !== lowered)
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // yoksay
  }
  return next
}

export function clearRecentSearches(): string[] {
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // yoksay
  }
  return []
}
