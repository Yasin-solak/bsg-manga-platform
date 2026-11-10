import { withAbortSignal, withServiceTimeout } from './apiResilience'
import { parseFansubIdentityTag, type FansubIdentityTagPresentation } from '@/lib/fansubIdentityTags'
import { createScopedLogger } from './logger'
import { supabase } from './supabase'
import { isAbortError } from './supabaseError'

export type PublicUserDirectoryLiteRow = {
  id: string
  username: string | null
  display_name?: string | null
  avatar_url: string | null
  frame_type: string | null
  background_type: string | null
  active_fansub_identity_tag?: FansubIdentityTagPresentation | null
  /** Name style passed through the premium gate (resolved by the server); null if not premium. */
  active_name_style?: Record<string, unknown> | null
}

type CachedRowEntry = {
  row: PublicUserDirectoryLiteRow
  expiresAt: number
}

type DeferredValue<T> = {
  promise: Promise<T>
  resolve: (value: T) => void
}

const PUBLIC_USER_DIRECTORY_CACHE_TTL_MS = 30_000
const publicUserDirectoryLogger = createScopedLogger('publicUserDirectoryLite')
const publicUserDirectoryByIdCache = new Map<string, CachedRowEntry>()
const publicUserDirectoryByUsernameCache = new Map<string, CachedRowEntry>()
const publicUserDirectoryByIdPending = new Map<string, DeferredValue<PublicUserDirectoryLiteRow | undefined>>()
const publicUserDirectoryByUsernamePending = new Map<string, DeferredValue<PublicUserDirectoryLiteRow | undefined>>()
let publicUserDirectoryIdFlushScheduled = false
let publicUserDirectoryUsernameFlushScheduled = false

function nowMs() {
  return Date.now()
}

function normalizeUsername(value: string) {
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

function setCachedRow(row: PublicUserDirectoryLiteRow) {
  const entry = {
    row,
    expiresAt: nowMs() + PUBLIC_USER_DIRECTORY_CACHE_TTL_MS,
  }
  publicUserDirectoryByIdCache.set(row.id, entry)

  const normalizedUsername = typeof row.username === 'string' ? normalizeUsername(row.username) : ''
  if (normalizedUsername) {
    publicUserDirectoryByUsernameCache.set(normalizedUsername, entry)
  }
}

function getCachedById(id: string) {
  const entry = publicUserDirectoryByIdCache.get(id)
  if (!entry) return undefined
  if (entry.expiresAt <= nowMs()) {
    publicUserDirectoryByIdCache.delete(id)
    return undefined
  }
  return entry.row
}

function getCachedByUsername(username: string) {
  const key = normalizeUsername(username)
  const entry = publicUserDirectoryByUsernameCache.get(key)
  if (!entry) return undefined
  if (entry.expiresAt <= nowMs()) {
    publicUserDirectoryByUsernameCache.delete(key)
    return undefined
  }
  return entry.row
}

function normalizePublicUserDirectoryRow(row: PublicUserDirectoryLiteRow) {
  return {
    ...row,
    active_fansub_identity_tag: parseFansubIdentityTag(row.active_fansub_identity_tag),
  }
}

async function queryByIds(ids: string[]) {
  const map = new Map<string, PublicUserDirectoryLiteRow>()
  if (ids.length === 0) return map

  const { data, error } = await withServiceTimeout(
    (requestSignal) => withAbortSignal(
      supabase
        .from('public_user_directory')
        .select('id, username, display_name, avatar_url, frame_type, background_type, active_fansub_identity_tag, active_name_style')
        .in('id', ids),
      requestSignal,
    ),
    { label: 'publicUserDirectoryLite.fetchByIds' },
  )

  if (error || !data) {
    if (error && !isAbortError(error)) {
      publicUserDirectoryLogger.warn('fetchByIds failed', { ids, error })
    }
    return map
  }

  ;(data as PublicUserDirectoryLiteRow[]).forEach((row) => {
    const normalizedRow = normalizePublicUserDirectoryRow(row)
    if (!normalizedRow.id) return
    setCachedRow(normalizedRow)
    map.set(normalizedRow.id, normalizedRow)
  })
  return map
}

async function queryByUsernames(usernames: string[]) {
  const map = new Map<string, PublicUserDirectoryLiteRow>()
  if (usernames.length === 0) return map

  const { data, error } = await withServiceTimeout(
    (requestSignal) => withAbortSignal(
      supabase
        .from('public_user_directory')
        .select('id, username, display_name, avatar_url, frame_type, background_type, active_fansub_identity_tag, active_name_style')
        .in('username', usernames),
      requestSignal,
    ),
    { label: 'publicUserDirectoryLite.fetchByUsernames' },
  )

  if (error || !data) {
    if (error && !isAbortError(error)) {
      publicUserDirectoryLogger.warn('fetchByUsernames failed', { usernames, error })
    }
    return map
  }

  ;(data as PublicUserDirectoryLiteRow[]).forEach((row) => {
    const normalizedRow = normalizePublicUserDirectoryRow(row)
    if (!normalizedRow.id) return
    setCachedRow(normalizedRow)
    if (typeof normalizedRow.username === 'string' && normalizedRow.username.trim()) {
      map.set(normalizeUsername(normalizedRow.username), normalizedRow)
    }
  })
  return map
}

function scheduleIdFlush() {
  if (publicUserDirectoryIdFlushScheduled) return
  publicUserDirectoryIdFlushScheduled = true

  queueMicrotask(() => {
    publicUserDirectoryIdFlushScheduled = false
    const pendingEntries = Array.from(publicUserDirectoryByIdPending.entries())
    if (pendingEntries.length === 0) return

    const ids = pendingEntries.map(([id]) => id)
    void queryByIds(ids)
      .then((rows) => {
        pendingEntries.forEach(([id, deferred]) => {
          deferred.resolve(rows.get(id))
          publicUserDirectoryByIdPending.delete(id)
        })
      })
      .catch(() => {
        pendingEntries.forEach(([id, deferred]) => {
          deferred.resolve(undefined)
          publicUserDirectoryByIdPending.delete(id)
        })
      })
  })
}

function scheduleUsernameFlush() {
  if (publicUserDirectoryUsernameFlushScheduled) return
  publicUserDirectoryUsernameFlushScheduled = true

  queueMicrotask(() => {
    publicUserDirectoryUsernameFlushScheduled = false
    const pendingEntries = Array.from(publicUserDirectoryByUsernamePending.entries())
    if (pendingEntries.length === 0) return

    const usernames = pendingEntries.map(([username]) => username)
    void queryByUsernames(usernames)
      .then((rows) => {
        pendingEntries.forEach(([username, deferred]) => {
          deferred.resolve(rows.get(username))
          publicUserDirectoryByUsernamePending.delete(username)
        })
      })
      .catch(() => {
        pendingEntries.forEach(([username, deferred]) => {
          deferred.resolve(undefined)
          publicUserDirectoryByUsernamePending.delete(username)
        })
      })
  })
}

function getPendingById(id: string) {
  const existing = publicUserDirectoryByIdPending.get(id)
  if (existing) return existing.promise

  const deferred = createDeferredValue<PublicUserDirectoryLiteRow | undefined>()
  publicUserDirectoryByIdPending.set(id, deferred)
  scheduleIdFlush()
  return deferred.promise
}

function getPendingByUsername(username: string) {
  const existing = publicUserDirectoryByUsernamePending.get(username)
  if (existing) return existing.promise

  const deferred = createDeferredValue<PublicUserDirectoryLiteRow | undefined>()
  publicUserDirectoryByUsernamePending.set(username, deferred)
  scheduleUsernameFlush()
  return deferred.promise
}

export async function loadPublicUserDirectoryLiteByIds(ids: string[], signal?: AbortSignal) {
  const uniqueIds = Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)))
  const output = new Map<string, PublicUserDirectoryLiteRow>()
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

export async function loadPublicUserDirectoryLiteByUsernames(usernames: string[], signal?: AbortSignal) {
  const normalizedUsernames = Array.from(
    new Set(usernames.map((username) => normalizeUsername(username)).filter(Boolean)),
  )
  const output = new Map<string, PublicUserDirectoryLiteRow>()
  const missingUsernames: string[] = []

  normalizedUsernames.forEach((username) => {
    const cached = getCachedByUsername(username)
    if (cached) output.set(username, cached)
    else missingUsernames.push(username)
  })

  if (missingUsernames.length > 0) {
    const fetchedRows = await Promise.all(
      missingUsernames.map(async (username) => (
        [username, await awaitWithCallerAbort(getPendingByUsername(username), signal)] as const
      )),
    )
    fetchedRows.forEach(([username, row]) => {
      if (!row) return
      output.set(username, row)
    })
  }

  return output
}
