import type { StoreItemType } from '@/data/storeProducts'

import { withAbortSignal, withServiceTimeout } from './apiResilience'
import { createScopedLogger } from './logger'
import { supabase } from './supabase'
import { isAbortError } from './supabaseError'

export type StoreItemLiteRow = {
  id: string
  name: string | null
  type: StoreItemType
  identifier: string
  image_key: string | null
  custom_asset_url: string | null
  poster_asset_url: string | null
}

type CachedStoreItemByIdEntry = {
  row: StoreItemLiteRow
  expiresAt: number
}

type CachedStoreItemByIdentifierEntry = {
  rows: StoreItemLiteRow[]
  expiresAt: number
}

type DeferredValue<T> = {
  promise: Promise<T>
  resolve: (value: T) => void
}

type StoreItemLiteLookupMaps = {
  byId: Map<string, StoreItemLiteRow>
  byTypeIdentifier: Map<string, StoreItemLiteRow>
}

type PendingStoreItemRefRequest = {
  ids: string[]
  identifiers: string[]
  deferred: DeferredValue<StoreItemLiteLookupMaps>
}

const STORE_ITEM_LITE_CACHE_TTL_MS = 30_000
const STORE_ITEM_LITE_BATCH_WINDOW_MS = 16
const storeItemLiteLogger = createScopedLogger('storeItemLiteDirectory')
const storeItemLiteByIdCache = new Map<string, CachedStoreItemByIdEntry>()
const storeItemLiteByIdentifierCache = new Map<string, CachedStoreItemByIdentifierEntry>()
const storeItemLiteByIdInFlight = new Map<string, Promise<void>>()
const storeItemLiteByIdentifierInFlight = new Map<string, Promise<void>>()
const storeItemLiteRefPending: PendingStoreItemRefRequest[] = []
let storeItemLiteRefFlushScheduled = false

function nowMs() {
  return Date.now()
}

function normalizeIdentifier(value: string) {
  return value.trim().toLowerCase()
}

function escapePostgrestInValue(value: string) {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

function toPostgrestInList(values: string[]) {
  return `(${values.map((value) => escapePostgrestInValue(value)).join(',')})`
}

export function toStoreItemLiteTypeIdentifierKey(type: string, identifier: string) {
  return `${type}:${normalizeIdentifier(identifier)}`
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

function setCachedRow(row: StoreItemLiteRow) {
  storeItemLiteByIdCache.set(row.id, {
    row,
    expiresAt: nowMs() + STORE_ITEM_LITE_CACHE_TTL_MS,
  })

  const normalizedIdentifier = normalizeIdentifier(row.identifier || '')
  if (!normalizedIdentifier) return

  const existingEntry = storeItemLiteByIdentifierCache.get(normalizedIdentifier)
  const existingRows = existingEntry && existingEntry.expiresAt > nowMs() ? existingEntry.rows : []
  const mergedRows = existingRows.some((entry) => entry.id === row.id)
    ? existingRows.map((entry) => (entry.id === row.id ? row : entry))
    : [...existingRows, row]

  storeItemLiteByIdentifierCache.set(normalizedIdentifier, {
    rows: mergedRows,
    expiresAt: nowMs() + STORE_ITEM_LITE_CACHE_TTL_MS,
  })
}

function setCachedIdentifierRows(identifier: string, rows: StoreItemLiteRow[]) {
  storeItemLiteByIdentifierCache.set(normalizeIdentifier(identifier), {
    rows,
    expiresAt: nowMs() + STORE_ITEM_LITE_CACHE_TTL_MS,
  })
  rows.forEach((row) => setCachedRow(row))
}

function getCachedRowById(id: string) {
  const entry = storeItemLiteByIdCache.get(id)
  if (!entry) return undefined
  if (entry.expiresAt <= nowMs()) {
    storeItemLiteByIdCache.delete(id)
    return undefined
  }
  return entry.row
}

function getCachedRowsByIdentifier(identifier: string) {
  const normalizedIdentifier = normalizeIdentifier(identifier)
  const entry = storeItemLiteByIdentifierCache.get(normalizedIdentifier)
  if (!entry) return undefined
  if (entry.expiresAt <= nowMs()) {
    storeItemLiteByIdentifierCache.delete(normalizedIdentifier)
    return undefined
  }
  return entry.rows
}

function buildStoreItemLookupMapsFromCache(ids: string[], identifiers: string[]): StoreItemLiteLookupMaps {
  const byId = new Map<string, StoreItemLiteRow>()
  const byTypeIdentifier = new Map<string, StoreItemLiteRow>()

  ids.forEach((id) => {
    const row = getCachedRowById(id)
    if (!row) return
    byId.set(id, row)
    byTypeIdentifier.set(toStoreItemLiteTypeIdentifierKey(row.type, row.identifier), row)
  })

  identifiers.forEach((identifier) => {
    const rows = getCachedRowsByIdentifier(identifier) || []
    rows.forEach((row) => {
      byId.set(row.id, row)
      byTypeIdentifier.set(toStoreItemLiteTypeIdentifierKey(row.type, row.identifier), row)
    })
  })

  return { byId, byTypeIdentifier }
}

function getMissingStoreItemRefs(ids: string[], identifiers: string[], lookups?: StoreItemLiteLookupMaps) {
  const seededById = lookups?.byId
  const missingIds = ids.filter((id) => !(seededById?.has(id) || getCachedRowById(id)))
  const missingIdentifiers = identifiers.filter((identifier) => !getCachedRowsByIdentifier(identifier))

  return {
    missingIds,
    missingIdentifiers,
  }
}

function getStoreItemInFlightPromises(ids: string[], identifiers: string[]) {
  const promises = new Set<Promise<void>>()

  ids.forEach((id) => {
    const pending = storeItemLiteByIdInFlight.get(id)
    if (pending) {
      promises.add(pending)
    }
  })

  identifiers.forEach((identifier) => {
    const pending = storeItemLiteByIdentifierInFlight.get(identifier)
    if (pending) {
      promises.add(pending)
    }
  })

  return Array.from(promises)
}

function registerStoreItemInFlightRefs(ids: string[], identifiers: string[], promise: Promise<void>) {
  ids.forEach((id) => {
    storeItemLiteByIdInFlight.set(id, promise)
  })
  identifiers.forEach((identifier) => {
    storeItemLiteByIdentifierInFlight.set(identifier, promise)
  })
}

function clearStoreItemInFlightRefs(ids: string[], identifiers: string[], promise: Promise<void>) {
  ids.forEach((id) => {
    if (storeItemLiteByIdInFlight.get(id) === promise) {
      storeItemLiteByIdInFlight.delete(id)
    }
  })
  identifiers.forEach((identifier) => {
    if (storeItemLiteByIdentifierInFlight.get(identifier) === promise) {
      storeItemLiteByIdentifierInFlight.delete(identifier)
    }
  })
}

async function awaitStoreItemInFlightRefs(ids: string[], identifiers: string[], signal?: AbortSignal) {
  const pending = getStoreItemInFlightPromises(ids, identifiers)
  if (pending.length === 0) return

  await awaitWithCallerAbort(
    Promise.allSettled(pending).then(() => undefined),
    signal,
  )
}

async function hydrateStoreItemLookups(
  ids: string[],
  identifiers: string[],
  signal?: AbortSignal,
): Promise<StoreItemLiteLookupMaps> {
  let lookups = buildStoreItemLookupMapsFromCache(ids, identifiers)
  let { missingIds, missingIdentifiers } = getMissingStoreItemRefs(ids, identifiers, lookups)

  if (missingIds.length === 0 && missingIdentifiers.length === 0) {
    return lookups
  }

  await awaitStoreItemInFlightRefs(missingIds, missingIdentifiers, signal)

  lookups = buildStoreItemLookupMapsFromCache(ids, identifiers)
  ;({ missingIds, missingIdentifiers } = getMissingStoreItemRefs(ids, identifiers, lookups))

  if (missingIds.length === 0 && missingIdentifiers.length === 0) {
    return lookups
  }

  await awaitWithCallerAbort(
    getPendingStoreItemsByRefs(missingIds, missingIdentifiers),
    signal,
  )

  return buildStoreItemLookupMapsFromCache(ids, identifiers)
}

async function queryStoreItemsByRefs(ids: string[], identifiers: string[]) {
  const uniqueIds = Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)))
  const normalizedIdentifiers = Array.from(
    new Set(identifiers.map((identifier) => normalizeIdentifier(identifier)).filter(Boolean)),
  )
  const output: StoreItemLiteRow[] = []
  if (uniqueIds.length === 0 && normalizedIdentifiers.length === 0) return output

  const clauses: string[] = []
  if (uniqueIds.length > 0) {
    clauses.push(`id.in.${toPostgrestInList(uniqueIds)}`)
  }
  if (normalizedIdentifiers.length > 0) {
    clauses.push(`identifier.in.${toPostgrestInList(normalizedIdentifiers)}`)
  }

  const { data, error } = await withServiceTimeout(
    (timeoutSignal) => withAbortSignal(
      supabase
        .from('store_items')
        .select('id, name, type, identifier, image_key, custom_asset_url, poster_asset_url')
        .or(clauses.join(',')),
      timeoutSignal,
    ),
    { label: 'storeItemLiteDirectory.fetchByRefs' },
  )

  if (error || !data) {
    if (error && !isAbortError(error)) {
      storeItemLiteLogger.warn('fetchByRefs failed', { ids: uniqueIds, identifiers: normalizedIdentifiers, error })
    }
    normalizedIdentifiers.forEach((identifier) => {
      setCachedIdentifierRows(identifier, [])
    })
    return output
  }

  const groupedByIdentifier = new Map<string, StoreItemLiteRow[]>()
  ;(data as StoreItemLiteRow[]).forEach((row) => {
    if (!row.id) return
    output.push(row)
    setCachedRow(row)

    const normalizedIdentifier = normalizeIdentifier(row.identifier || '')
    if (!normalizedIdentifier) return
    const rows = groupedByIdentifier.get(normalizedIdentifier) || []
    rows.push(row)
    groupedByIdentifier.set(normalizedIdentifier, rows)
  })

  normalizedIdentifiers.forEach((identifier) => {
    setCachedIdentifierRows(identifier, groupedByIdentifier.get(identifier) || [])
  })

  return output
}

function scheduleStoreItemRefFlush() {
  if (storeItemLiteRefFlushScheduled) return
  storeItemLiteRefFlushScheduled = true

  globalThis.setTimeout(() => {
    storeItemLiteRefFlushScheduled = false
    const pendingEntries = storeItemLiteRefPending.splice(0, storeItemLiteRefPending.length)
    if (pendingEntries.length === 0) return

    const ids = Array.from(new Set(
      pendingEntries.flatMap((entry) => entry.ids.map((id) => id.trim()).filter(Boolean)),
    ))
    const identifiers = Array.from(new Set(
      pendingEntries.flatMap((entry) => entry.identifiers.map((identifier) => normalizeIdentifier(identifier)).filter(Boolean)),
    ))

    const fetchPromise = queryStoreItemsByRefs(ids, identifiers)
      .then(() => undefined)
      .catch(() => undefined)

    registerStoreItemInFlightRefs(ids, identifiers, fetchPromise)

    void fetchPromise.finally(() => {
      clearStoreItemInFlightRefs(ids, identifiers, fetchPromise)
      pendingEntries.forEach((entry) => {
        entry.deferred.resolve(buildStoreItemLookupMapsFromCache(entry.ids, entry.identifiers))
      })
    })
  }, STORE_ITEM_LITE_BATCH_WINDOW_MS)
}

function getPendingStoreItemsByRefs(ids: string[], identifiers: string[]) {
  const deferred = createDeferredValue<StoreItemLiteLookupMaps>()
  storeItemLiteRefPending.push({
    ids,
    identifiers,
    deferred,
  })
  scheduleStoreItemRefFlush()
  return deferred.promise
}

export async function loadStoreItemsLiteByIds(ids: string[], signal?: AbortSignal) {
  const uniqueIds = Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)))
  return hydrateStoreItemLookups(uniqueIds, [], signal).then((lookups) => lookups.byId)
}

export async function loadStoreItemsLiteByIdentifiers(identifiers: string[], signal?: AbortSignal) {
  const uniqueIdentifiers = Array.from(new Set(identifiers.map((identifier) => normalizeIdentifier(identifier)).filter(Boolean)))
  return hydrateStoreItemLookups([], uniqueIdentifiers, signal).then((lookups) => lookups.byTypeIdentifier)
}

export async function loadStoreItemsLiteByRefs(
  refs: { ids?: string[]; identifiers?: string[] },
  signal?: AbortSignal,
): Promise<StoreItemLiteLookupMaps> {
  const uniqueIds = Array.from(new Set((refs.ids || []).map((id) => id.trim()).filter(Boolean)))
  const uniqueIdentifiers = Array.from(
    new Set((refs.identifiers || []).map((identifier) => normalizeIdentifier(identifier)).filter(Boolean)),
  )
  // Even if different loaders miss the same event-loop tick, they share the in-flight fetch for the same ref,
  // so a second store_items query does not open in consecutive hydrate steps such as the profile.
  return hydrateStoreItemLookups(uniqueIds, uniqueIdentifiers, signal)
}
