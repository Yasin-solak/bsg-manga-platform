import { FEATURE_FLAG_REGISTRY, getFeatureFlagRegistryEntry, type FeatureFlagRegistryKey } from './featureFlagRegistry'
import { createScopedLogger } from './logger'
import { supabase } from './supabase'
import { isAbortError } from './supabaseError'

export type RuntimeFeatureFlagKey = FeatureFlagRegistryKey

export interface FeatureFlagUpdatePayload {
  key: string
  value?: boolean
}

interface CachedFeatureFlagValue {
  value: boolean
  expiresAt: number
}

type FeatureFlagBatchRow = {
  key: string
  is_enabled: boolean | null
}

const FEATURE_FLAG_CACHE_TTL_MS = 45_000
const FEATURE_FLAG_UPDATED_EVENT = 'bsgmanga:feature-flag-updated'
const FEATURE_FLAG_SYNC_STORAGE_KEY = 'bsgmanga:feature-flag-sync'
const featureFlagCache = new Map<string, CachedFeatureFlagValue>()
const featureFlagInFlight = new Map<string, Promise<boolean>>()
const featureFlagBatchQueue = new Map<string, Array<{ fallbackValue: boolean; resolve: (value: boolean) => void }>>()
let featureFlagBatchScheduled = false
const featureFlagLogger = createScopedLogger('featureFlagService')

function nowMs() {
  return Date.now()
}

function toFeatureFlagKey(input: string) {
  return input.trim().toLowerCase()
}

function getCachedValue(key: string) {
  const row = featureFlagCache.get(key)
  if (!row) return undefined
  if (row.expiresAt <= nowMs()) {
    featureFlagCache.delete(key)
    return undefined
  }
  return row.value
}

function setCachedValue(key: string, value: boolean) {
  featureFlagCache.set(key, {
    value,
    expiresAt: nowMs() + FEATURE_FLAG_CACHE_TTL_MS,
  })
}

async function fetchFeatureFlagBatch(keys: string[]) {
  const uniqueKeys = Array.from(new Set(keys.map((key) => toFeatureFlagKey(key)).filter(Boolean)))
  if (uniqueKeys.length === 0) return new Map<string, boolean>()

  try {
    const { data, error } = await supabase.rpc('get_runtime_feature_flags', {
      p_keys: uniqueKeys,
    })

    if (error) {
      if (!isAbortError(error)) {
        featureFlagLogger.error('getRuntimeFeatureFlags batch error', error)
      }
      return new Map<string, boolean>()
    }

    const output = new Map<string, boolean>()
    ;((data || []) as FeatureFlagBatchRow[]).forEach((row) => {
      const normalizedKey = toFeatureFlagKey(row.key || '')
      if (!normalizedKey || typeof row.is_enabled !== 'boolean') return
      setCachedValue(normalizedKey, row.is_enabled)
      output.set(normalizedKey, row.is_enabled)
    })
    return output
  } catch (error) {
    if (!isAbortError(error)) {
      featureFlagLogger.error('getRuntimeFeatureFlags batch unexpected error', error)
    }
    return new Map<string, boolean>()
  }
}

function scheduleFeatureFlagBatchFlush() {
  if (featureFlagBatchScheduled) return
  featureFlagBatchScheduled = true

  queueMicrotask(() => {
    featureFlagBatchScheduled = false
    const currentQueue = new Map(featureFlagBatchQueue)
    featureFlagBatchQueue.clear()
    const keys = Array.from(currentQueue.keys())

    void fetchFeatureFlagBatch(keys).then((batchValues) => {
      currentQueue.forEach((entries, key) => {
        entries.forEach((entry) => {
          entry.resolve(batchValues.get(key) ?? entry.fallbackValue)
        })
      })
    })
  })
}

function emitFeatureFlagUpdate(payload: FeatureFlagUpdatePayload) {
  if (typeof window === 'undefined') return

  window.dispatchEvent(new CustomEvent<FeatureFlagUpdatePayload>(FEATURE_FLAG_UPDATED_EVENT, {
    detail: payload,
  }))

  try {
    window.localStorage.setItem(FEATURE_FLAG_SYNC_STORAGE_KEY, JSON.stringify({
      ...payload,
      ts: nowMs(),
    }))
  } catch {
    // localStorage engelli ortamlarda sadece local event yeterli.
  }
}

function resolveFallbackValue(flagKey: string, fallback?: boolean) {
  if (typeof fallback === 'boolean') return fallback
  return getFeatureFlagRegistryEntry(flagKey)?.varsayilan ?? false
}

export function clearFeatureFlagCache(flagKey?: string) {
  if (!flagKey) {
    featureFlagCache.clear()
    return
  }
  featureFlagCache.delete(toFeatureFlagKey(flagKey))
}

export function notifyFeatureFlagUpdated(flagKey: string, value?: boolean) {
  const key = toFeatureFlagKey(flagKey)
  if (!key) return
  clearFeatureFlagCache(key)
  emitFeatureFlagUpdate({ key, value })
}

export function listenFeatureFlagUpdates(handler: (payload: FeatureFlagUpdatePayload) => void) {
  if (typeof window === 'undefined') {
    return () => { }
  }

  const onCustomEvent = (event: Event) => {
    const customEvent = event as CustomEvent<FeatureFlagUpdatePayload>
    const key = toFeatureFlagKey(customEvent.detail?.key || '')
    if (!key) return
    handler({ key, value: customEvent.detail?.value })
  }

  const onStorageEvent = (event: StorageEvent) => {
    if (event.key !== FEATURE_FLAG_SYNC_STORAGE_KEY || !event.newValue) return
    try {
      const parsed = JSON.parse(event.newValue) as FeatureFlagUpdatePayload
      const key = toFeatureFlagKey(parsed?.key || '')
      if (!key) return
      clearFeatureFlagCache(key)
      handler({ key, value: parsed?.value })
    } catch {
      // ignore parse hatasi
    }
  }

  window.addEventListener(FEATURE_FLAG_UPDATED_EVENT, onCustomEvent as EventListener)
  window.addEventListener('storage', onStorageEvent)

  return () => {
    window.removeEventListener(FEATURE_FLAG_UPDATED_EVENT, onCustomEvent as EventListener)
    window.removeEventListener('storage', onStorageEvent)
  }
}

export async function isFeatureEnabled(flagKey: string, fallback?: boolean, forceRefresh = false): Promise<boolean> {
  const key = toFeatureFlagKey(flagKey)
  if (!key) return resolveFallbackValue(flagKey, fallback)

  if (!getFeatureFlagRegistryEntry(key)) {
    featureFlagLogger.warn('Registry disi feature flag okundu.', { key })
  }

  if (!forceRefresh) {
    const cached = getCachedValue(key)
    if (typeof cached === 'boolean') {
      return cached
    }
  }

  const inFlight = featureFlagInFlight.get(key)
  if (inFlight) {
    return inFlight
  }

  const fallbackValue = resolveFallbackValue(key, fallback)

  const request = (async () => {
    return await new Promise<boolean>((resolve) => {
      const queue = featureFlagBatchQueue.get(key) || []
      queue.push({ fallbackValue, resolve })
      featureFlagBatchQueue.set(key, queue)
      scheduleFeatureFlagBatchFlush()
    })
  })()

  featureFlagInFlight.set(key, request)
  try {
    return await request
  } finally {
    if (featureFlagInFlight.get(key) === request) {
      featureFlagInFlight.delete(key)
    }
  }
}

export async function getRuntimeFeatureFlags(
  keys: RuntimeFeatureFlagKey[],
  fallback?: boolean,
  forceRefresh = false,
): Promise<Record<RuntimeFeatureFlagKey, boolean>> {
  const uniqueKeys = Array.from(new Set(keys))
  const output = {} as Record<RuntimeFeatureFlagKey, boolean>
  const missingKeys: RuntimeFeatureFlagKey[] = []

  uniqueKeys.forEach((key) => {
    if (!forceRefresh) {
      const cached = getCachedValue(key)
      if (typeof cached === 'boolean') {
        output[key] = cached
        return
      }
    }

    missingKeys.push(key)
  })

  if (missingKeys.length > 0) {
    const fetchedEntries = await Promise.all(
      missingKeys.map(async (key) => (
        [key, await isFeatureEnabled(key, fallback, forceRefresh)] as const
      )),
    )
    fetchedEntries.forEach(([key, value]) => {
      output[key] = value
    })
  }

  uniqueKeys.forEach((key) => {
    if (typeof output[key] !== 'boolean') {
      output[key] = resolveFallbackValue(key, fallback)
    }
  })

  return output
}

export function listRegisteredFeatureFlags() {
  return Object.entries(FEATURE_FLAG_REGISTRY).map(([key, value]) => ({ key, ...value }))
}
