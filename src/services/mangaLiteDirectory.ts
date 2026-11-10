import { withAbortSignal, withServiceTimeout } from './apiResilience'
import { createScopedLogger } from './logger'
import { supabase } from './supabase'
import { isAbortError } from './supabaseError'

export type MangaLiteRow = {
  id: string
  title: string
  slug: string
  cover_image_url: string | null
}

type CachedEntry = {
  row: MangaLiteRow
  expiresAt: number
}

type DeferredValue<T> = {
  promise: Promise<T>
  resolve: (value: T) => void
}

const MANGA_LITE_CACHE_TTL_MS = 30_000
const MANGA_LITE_SELECT = 'id, title, slug, cover_image_url'

const mangaLiteLogger = createScopedLogger('mangaLiteDirectory')
const mangaLiteByIdCache = new Map<string, CachedEntry>()
const mangaLiteBySlugCache = new Map<string, CachedEntry>()
const mangaLiteByIdPending = new Map<string, DeferredValue<MangaLiteRow | undefined>>()
const mangaLiteBySlugPending = new Map<string, DeferredValue<MangaLiteRow | undefined>>()
let mangaLiteIdFlushScheduled = false
let mangaLiteSlugFlushScheduled = false

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

function setCachedRow(row: MangaLiteRow) {
  const entry = {
    row,
    expiresAt: nowMs() + MANGA_LITE_CACHE_TTL_MS,
  }

  mangaLiteByIdCache.set(row.id, entry)

  const normalizedSlug = normalizeSlug(row.slug || '')
  if (normalizedSlug) {
    mangaLiteBySlugCache.set(normalizedSlug, entry)
  }
}

export function primeMangaLiteRows(rows: Array<Partial<MangaLiteRow> | null | undefined>) {
  rows.forEach((row) => {
    if (!row?.id || !row.slug || !row.title) return
    setCachedRow({
      id: row.id,
      title: row.title,
      slug: row.slug,
      cover_image_url: row.cover_image_url ?? null,
    })
  })
}

function getCachedById(id: string) {
  const entry = mangaLiteByIdCache.get(id)
  if (!entry) return undefined
  if (entry.expiresAt <= nowMs()) {
    mangaLiteByIdCache.delete(id)
    return undefined
  }
  return entry.row
}

function getCachedBySlug(slug: string) {
  const normalizedSlug = normalizeSlug(slug)
  const entry = mangaLiteBySlugCache.get(normalizedSlug)
  if (!entry) return undefined
  if (entry.expiresAt <= nowMs()) {
    mangaLiteBySlugCache.delete(normalizedSlug)
    return undefined
  }
  return entry.row
}

async function queryByIds(ids: string[]) {
  const map = new Map<string, MangaLiteRow>()
  if (ids.length === 0) return map

  const { data, error } = await withServiceTimeout(
    (requestSignal) => withAbortSignal(
      supabase
        .from('mangas')
        .select(MANGA_LITE_SELECT)
        .eq('is_active', true)
        .eq('is_approved', true)
        .in('id', ids),
      requestSignal,
    ),
    { label: 'mangaLiteDirectory.fetchByIds' },
  )

  if (error || !data) {
    if (error && !isAbortError(error)) {
      mangaLiteLogger.warn('fetchByIds failed', { ids, error })
    }
    return map
  }

  ;(data as MangaLiteRow[]).forEach((row) => {
    if (!row.id) return
    setCachedRow(row)
    map.set(row.id, row)
  })
  return map
}

async function queryBySlugs(slugs: string[]) {
  const normalizedSlugs = slugs.map((slug) => normalizeSlug(slug))
  const map = new Map<string, MangaLiteRow>()
  if (normalizedSlugs.length === 0) return map

  const { data, error } = await withServiceTimeout(
    (requestSignal) => withAbortSignal(
      supabase
        .from('mangas')
        .select(MANGA_LITE_SELECT)
        .eq('is_active', true)
        .eq('is_approved', true)
        .in('slug', normalizedSlugs),
      requestSignal,
    ),
    { label: 'mangaLiteDirectory.fetchBySlugs' },
  )

  if (error || !data) {
    if (error && !isAbortError(error)) {
      mangaLiteLogger.warn('fetchBySlugs failed', { slugs: normalizedSlugs, error })
    }
    return map
  }

  ;(data as MangaLiteRow[]).forEach((row) => {
    if (!row.id) return
    setCachedRow(row)
    if (row.slug?.trim()) {
      map.set(normalizeSlug(row.slug), row)
    }
  })
  return map
}

function scheduleIdFlush() {
  if (mangaLiteIdFlushScheduled) return
  mangaLiteIdFlushScheduled = true

  queueMicrotask(() => {
    mangaLiteIdFlushScheduled = false
    const pendingEntries = Array.from(mangaLiteByIdPending.entries())
    if (pendingEntries.length === 0) return

    const ids = pendingEntries.map(([id]) => id)
    void queryByIds(ids)
      .then((rows) => {
        pendingEntries.forEach(([id, deferred]) => {
          deferred.resolve(rows.get(id))
          mangaLiteByIdPending.delete(id)
        })
      })
      .catch(() => {
        pendingEntries.forEach(([id, deferred]) => {
          deferred.resolve(undefined)
          mangaLiteByIdPending.delete(id)
        })
      })
  })
}

function scheduleSlugFlush() {
  if (mangaLiteSlugFlushScheduled) return
  mangaLiteSlugFlushScheduled = true

  queueMicrotask(() => {
    mangaLiteSlugFlushScheduled = false
    const pendingEntries = Array.from(mangaLiteBySlugPending.entries())
    if (pendingEntries.length === 0) return

    const slugs = pendingEntries.map(([slug]) => slug)
    void queryBySlugs(slugs)
      .then((rows) => {
        pendingEntries.forEach(([slug, deferred]) => {
          deferred.resolve(rows.get(slug))
          mangaLiteBySlugPending.delete(slug)
        })
      })
      .catch(() => {
        pendingEntries.forEach(([slug, deferred]) => {
          deferred.resolve(undefined)
          mangaLiteBySlugPending.delete(slug)
        })
      })
  })
}

function getPendingById(id: string) {
  const existing = mangaLiteByIdPending.get(id)
  if (existing) return existing.promise

  const deferred = createDeferredValue<MangaLiteRow | undefined>()
  mangaLiteByIdPending.set(id, deferred)
  scheduleIdFlush()
  return deferred.promise
}

function getPendingBySlug(slug: string) {
  const existing = mangaLiteBySlugPending.get(slug)
  if (existing) return existing.promise

  const deferred = createDeferredValue<MangaLiteRow | undefined>()
  mangaLiteBySlugPending.set(slug, deferred)
  scheduleSlugFlush()
  return deferred.promise
}

export async function loadMangaLiteByIds(ids: string[], signal?: AbortSignal) {
  const uniqueIds = Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)))
  const output = new Map<string, MangaLiteRow>()
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

export async function loadMangaLiteBySlugs(slugs: string[], signal?: AbortSignal) {
  const normalizedSlugs = Array.from(new Set(slugs.map((slug) => normalizeSlug(slug)).filter(Boolean)))
  const output = new Map<string, MangaLiteRow>()
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
