import { withAbortSignal, withServiceTimeout } from './apiResilience'
import { createScopedLogger } from './logger'
import { supabase } from './supabase'
import { isAbortError } from './supabaseError'

export type FansubLiteRow = {
  id: string
  name: string
  slug: string
  avatar_url: string | null
  description: string | null
  frame_type: string | null
  primary_color: string | null
  secondary_color: string | null
  custom_background_asset_url: string | null
  manga_count: number | null
  follower_count: number | null
  active_frame_id: string | null
  active_background_id: string | null
  active_pattern_id: string | null
  active_profile_effect_id: string | null
}

type CachedEntry = {
  row: FansubLiteRow
  expiresAt: number
}

type DeferredValue<T> = {
  promise: Promise<T>
  resolve: (value: T) => void
}

const FANSUB_LITE_CACHE_TTL_MS = 30_000
const FANSUB_LITE_SELECT = `
  id,
  name,
  slug,
  avatar_url,
  description,
  frame_type,
  primary_color,
  secondary_color,
  custom_background_asset_url,
  manga_count,
  follower_count,
  active_frame_id,
  active_background_id,
  active_pattern_id,
  active_profile_effect_id
`

const fansubLiteLogger = createScopedLogger('fansubLiteDirectory')
const fansubLiteByIdCache = new Map<string, CachedEntry>()
const fansubLiteBySlugCache = new Map<string, CachedEntry>()
const fansubLiteByIdPending = new Map<string, DeferredValue<FansubLiteRow | undefined>>()
const fansubLiteBySlugPending = new Map<string, DeferredValue<FansubLiteRow | undefined>>()
let fansubLiteIdFlushScheduled = false
let fansubLiteSlugFlushScheduled = false

function nowMs() {
  return Date.now()
}

function normalizeSlug(value: string) {
  return value.trim().toLowerCase()
}

function createDeferredValue<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve
  })

  return { promise, resolve }
}

function awaitWithCallerAbort<T>(promise: Promise<T>, signal?: AbortSignal) {
  if (!signal) return promise
  if (signal.aborted) {
    return Promise.reject(new DOMException('The operation was aborted.', 'AbortError'))
  }

  return new Promise<T>((resolve, reject) => {
    const handleAbort = () => {
      signal.removeEventListener('abort', handleAbort)
      reject(new DOMException('The operation was aborted.', 'AbortError'))
    }

    signal.addEventListener('abort', handleAbort, { once: true })
    promise.then(
      (value) => {
        signal.removeEventListener('abort', handleAbort)
        resolve(value)
      },
      (error) => {
        signal.removeEventListener('abort', handleAbort)
        reject(error)
      },
    )
  })
}

function setCachedRow(row: FansubLiteRow) {
  const entry = {
    row,
    expiresAt: nowMs() + FANSUB_LITE_CACHE_TTL_MS,
  }

  fansubLiteByIdCache.set(row.id, entry)

  const normalizedSlug = normalizeSlug(row.slug || '')
  if (normalizedSlug) {
    fansubLiteBySlugCache.set(normalizedSlug, entry)
  }
}

function getCachedById(id: string) {
  const entry = fansubLiteByIdCache.get(id)
  if (!entry) return undefined
  if (entry.expiresAt <= nowMs()) {
    fansubLiteByIdCache.delete(id)
    return undefined
  }
  return entry.row
}

function getCachedBySlug(slug: string) {
  const normalizedSlug = normalizeSlug(slug)
  const entry = fansubLiteBySlugCache.get(normalizedSlug)
  if (!entry) return undefined
  if (entry.expiresAt <= nowMs()) {
    fansubLiteBySlugCache.delete(normalizedSlug)
    return undefined
  }
  return entry.row
}

async function queryByIds(ids: string[]) {
  const map = new Map<string, FansubLiteRow>()
  if (ids.length === 0) return map

  const { data, error } = await withServiceTimeout(
    (requestSignal) => withAbortSignal(
      supabase
        .from('fansubs')
        .select(FANSUB_LITE_SELECT)
        .eq('is_active', true)
        .in('id', ids),
      requestSignal,
    ),
    { label: 'fansubLiteDirectory.fetchByIds' },
  )

  if (error || !data) {
    if (error && !isAbortError(error)) {
      fansubLiteLogger.warn('fetchByIds failed', { ids, error })
    }
    return map
  }

  ;(data as FansubLiteRow[]).forEach((row) => {
    if (!row.id) return
    setCachedRow(row)
    map.set(row.id, row)
  })
  return map
}

async function queryBySlugs(slugs: string[]) {
  const normalizedSlugs = slugs.map((slug) => normalizeSlug(slug))
  const map = new Map<string, FansubLiteRow>()
  if (normalizedSlugs.length === 0) return map

  const { data, error } = await withServiceTimeout(
    (requestSignal) => withAbortSignal(
      supabase
        .from('fansubs')
        .select(FANSUB_LITE_SELECT)
        .eq('is_active', true)
        .in('slug', normalizedSlugs),
      requestSignal,
    ),
    { label: 'fansubLiteDirectory.fetchBySlugs' },
  )

  if (error || !data) {
    if (error && !isAbortError(error)) {
      fansubLiteLogger.warn('fetchBySlugs failed', { slugs: normalizedSlugs, error })
    }
    return map
  }

  ;(data as FansubLiteRow[]).forEach((row) => {
    if (!row.id) return
    setCachedRow(row)
    if (row.slug?.trim()) {
      map.set(normalizeSlug(row.slug), row)
    }
  })
  return map
}

function scheduleIdFlush() {
  if (fansubLiteIdFlushScheduled) return
  fansubLiteIdFlushScheduled = true

  queueMicrotask(() => {
    fansubLiteIdFlushScheduled = false
    const pendingEntries = Array.from(fansubLiteByIdPending.entries())
    if (pendingEntries.length === 0) return

    const ids = pendingEntries.map(([id]) => id)
    void queryByIds(ids)
      .then((rows) => {
        pendingEntries.forEach(([id, deferred]) => {
          deferred.resolve(rows.get(id))
          fansubLiteByIdPending.delete(id)
        })
      })
      .catch(() => {
        pendingEntries.forEach(([id, deferred]) => {
          deferred.resolve(undefined)
          fansubLiteByIdPending.delete(id)
        })
      })
  })
}

function scheduleSlugFlush() {
  if (fansubLiteSlugFlushScheduled) return
  fansubLiteSlugFlushScheduled = true

  queueMicrotask(() => {
    fansubLiteSlugFlushScheduled = false
    const pendingEntries = Array.from(fansubLiteBySlugPending.entries())
    if (pendingEntries.length === 0) return

    const slugs = pendingEntries.map(([slug]) => slug)
    void queryBySlugs(slugs)
      .then((rows) => {
        pendingEntries.forEach(([slug, deferred]) => {
          deferred.resolve(rows.get(slug))
          fansubLiteBySlugPending.delete(slug)
        })
      })
      .catch(() => {
        pendingEntries.forEach(([slug, deferred]) => {
          deferred.resolve(undefined)
          fansubLiteBySlugPending.delete(slug)
        })
      })
  })
}

function getPendingById(id: string) {
  const existing = fansubLiteByIdPending.get(id)
  if (existing) return existing.promise

  const deferred = createDeferredValue<FansubLiteRow | undefined>()
  fansubLiteByIdPending.set(id, deferred)
  scheduleIdFlush()
  return deferred.promise
}

function getPendingBySlug(slug: string) {
  const existing = fansubLiteBySlugPending.get(slug)
  if (existing) return existing.promise

  const deferred = createDeferredValue<FansubLiteRow | undefined>()
  fansubLiteBySlugPending.set(slug, deferred)
  scheduleSlugFlush()
  return deferred.promise
}

export async function loadFansubLiteByIds(ids: string[], signal?: AbortSignal) {
  const uniqueIds = Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)))
  const output = new Map<string, FansubLiteRow>()
  const missingIds: string[] = []

  uniqueIds.forEach((id) => {
    const cached = getCachedById(id)
    if (cached) output.set(id, cached)
    else missingIds.push(id)
  })

  if (missingIds.length > 0) {
    const fetchedRows = await Promise.all(
      missingIds.map(async (id) => ([id, await awaitWithCallerAbort(getPendingById(id), signal)] as const)),
    )
    fetchedRows.forEach(([id, row]) => {
      if (!row) return
      output.set(id, row)
    })
  }

  return output
}

export async function loadFansubLiteBySlugs(slugs: string[], signal?: AbortSignal) {
  const normalizedSlugs = Array.from(new Set(slugs.map((slug) => normalizeSlug(slug)).filter(Boolean)))
  const output = new Map<string, FansubLiteRow>()
  const missingSlugs: string[] = []

  normalizedSlugs.forEach((slug) => {
    const cached = getCachedBySlug(slug)
    if (cached) output.set(slug, cached)
    else missingSlugs.push(slug)
  })

  if (missingSlugs.length > 0) {
    const fetchedRows = await Promise.all(
      missingSlugs.map(async (slug) => ([slug, await awaitWithCallerAbort(getPendingBySlug(slug), signal)] as const)),
    )
    fetchedRows.forEach(([slug, row]) => {
      if (!row) return
      output.set(slug, row)
    })
  }

  return output
}
