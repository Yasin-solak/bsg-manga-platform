/**
 * Tiny in-memory read cache: concurrent callers share one in-flight request and, when ttlMs > 0,
 * a successful result is reused for a few seconds. Failures are never cached.
 *
 * Use it only for per-user reads (put the user id in the key) that several components request
 * at the same moment. Every cache registers itself so sign-out / user switch can drop them all.
 */
export interface ShortLivedCache<T> {
  get(key: string, load: () => Promise<T>): Promise<T>
  /** Drops entries whose key starts with the prefix (everything when omitted). */
  invalidate(prefix?: string): void
}

interface Entry<T> {
  promise: Promise<T>
  expiresAt: number
  settled: boolean
}

const registry = new Set<ShortLivedCache<never>>()

export function createShortLivedCache<T>(ttlMs: number, now: () => number = Date.now): ShortLivedCache<T> {
  const entries = new Map<string, Entry<T>>()

  const cache: ShortLivedCache<T> = {
    get(key, load) {
      const existing = entries.get(key)
      if (existing && (!existing.settled || existing.expiresAt > now())) return existing.promise

      const entry: Entry<T> = { promise: undefined as unknown as Promise<T>, expiresAt: 0, settled: false }
      entry.promise = load().then(
        (value) => {
          entry.settled = true
          entry.expiresAt = now() + ttlMs
          // ttlMs === 0 means in-flight sharing only.
          if (ttlMs <= 0 && entries.get(key) === entry) entries.delete(key)
          return value
        },
        (error) => {
          if (entries.get(key) === entry) entries.delete(key)
          throw error
        },
      )
      entries.set(key, entry)
      return entry.promise
    },
    invalidate(prefix) {
      if (!prefix) {
        entries.clear()
        return
      }
      for (const key of [...entries.keys()]) {
        if (key.startsWith(prefix)) entries.delete(key)
      }
    },
  }

  registry.add(cache as ShortLivedCache<never>)
  return cache
}

/** Sign-out, user switch and auth user updates: no per-user read may outlive the session. */
export function clearAllShortLivedCaches() {
  for (const cache of registry) cache.invalidate()
}
