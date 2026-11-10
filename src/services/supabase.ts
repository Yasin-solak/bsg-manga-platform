import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * We do not rebuild the Supabase client on HMR and StrictMode repeats;
 * one client is used in the same browser session.
 */
const isLocalE2EPreview = import.meta.env.DEV
  && typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).get('e2e') === '1'
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  || (isLocalE2EPreview ? 'http://127.0.0.1:54321' : undefined)
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  || (isLocalE2EPreview ? 'e2e-local-preview-key' : undefined)

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Supabase URL ve Anon Key environment variables olarak tanimlanmalidir!')
}

type SupabaseGlobalScope = typeof globalThis & {
  __BSGMANGA_SUPABASE__?: SupabaseClient
}

const supabaseGlobalScope = globalThis as SupabaseGlobalScope

type AuthStorageLike = {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
}

export type AuthPersistenceMode = 'session' | 'local'

const AUTH_PERSISTENCE_MODE_STORAGE_KEY = 'bsgmanga-auth-persistence-mode'
const memoryAuthStorage = createMemoryAuthStorage()
const SUPABASE_AUTH_STORAGE_KEY_PATTERN = /(^sb-)|auth-token/i

async function runWithoutNavigatorLock<R>(_name: string, _acquireTimeout: number, fn: () => Promise<R>): Promise<R> {
  return await fn()
}

function createMemoryAuthStorage(): AuthStorageLike {
  const memoryStore = new Map<string, string>()
  return {
    getItem: (key) => memoryStore.get(key) ?? null,
    setItem: (key, value) => {
      memoryStore.set(key, value)
    },
    removeItem: (key) => {
      memoryStore.delete(key)
    },
  }
}

function normalizeAuthPersistenceMode(value: unknown): AuthPersistenceMode {
  return value === 'local' ? 'local' : 'session'
}

function hasSupabaseAuthEntries(storage: Storage | null | undefined) {
  if (!storage) return false

  try {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index)
      if (key && isSupabaseAuthStorageKey(key)) {
        return true
      }
    }
  } catch {
    return false
  }

  return false
}

function probeBrowserStorage(storage: Storage | null | undefined) {
  if (!storage) return null

  try {
    const probeKey = '__bsgmanga_auth_storage_probe__'
    storage.setItem(probeKey, '1')
    storage.removeItem(probeKey)
    return storage
  } catch {
    return null
  }
}

function resolveBrowserStorage(mode: AuthPersistenceMode) {
  if (typeof window === 'undefined') {
    return null
  }

  return probeBrowserStorage(mode === 'local' ? window.localStorage : window.sessionStorage)
}

function readPreferredAuthPersistenceMode(): AuthPersistenceMode {
  const localStorage = resolveBrowserStorage('local')
  const sessionStorage = resolveBrowserStorage('session')
  const explicitPreference = localStorage?.getItem(AUTH_PERSISTENCE_MODE_STORAGE_KEY)
    || sessionStorage?.getItem(AUTH_PERSISTENCE_MODE_STORAGE_KEY)
    || null

  if (explicitPreference) {
    return normalizeAuthPersistenceMode(explicitPreference)
  }

  if (hasSupabaseAuthEntries(sessionStorage)) {
    return 'session'
  }

  if (hasSupabaseAuthEntries(localStorage)) {
    return 'local'
  }

  return 'session'
}

export function getPreferredAuthPersistenceMode(): AuthPersistenceMode {
  return readPreferredAuthPersistenceMode()
}

export function setPreferredAuthPersistenceMode(mode: AuthPersistenceMode) {
  const storage = resolveBrowserStorage('local') || resolveBrowserStorage('session')
  if (!storage) return
  storage.setItem(AUTH_PERSISTENCE_MODE_STORAGE_KEY, mode)
  migrateAuthSessionEntries(mode)
}

function isSupabaseAuthStorageKey(key: string) {
  return SUPABASE_AUTH_STORAGE_KEY_PATTERN.test(key)
}

function migrateAuthSessionEntries(mode: AuthPersistenceMode) {
  if (typeof window === 'undefined') return

  const preferredStorage = resolveBrowserStorage(mode)
  const secondaryStorage = resolveBrowserStorage(mode === 'local' ? 'session' : 'local')
  if (!preferredStorage || !secondaryStorage) return

  try {
    for (let index = 0; index < secondaryStorage.length; index += 1) {
      const key = secondaryStorage.key(index)
      if (!key || !isSupabaseAuthStorageKey(key)) continue
      const value = secondaryStorage.getItem(key)
      if (value == null) continue
      preferredStorage.setItem(key, value)
      secondaryStorage.removeItem(key)
      index -= 1
    }
  } catch {
    // Storage erisimi engellendiyse sessiz fallback yeterli.
  }
}

function resolveAuthStorage(): AuthStorageLike {
  if (typeof window === 'undefined') {
    return memoryAuthStorage
  }

  return {
    getItem: (key) => {
      const preferredMode = readPreferredAuthPersistenceMode()
      const preferredStorage = resolveBrowserStorage(preferredMode)
      const secondaryStorage = resolveBrowserStorage(preferredMode === 'local' ? 'session' : 'local')
      const preferredValue = preferredStorage?.getItem(key) ?? null
      if (preferredValue != null) return preferredValue

      const secondaryValue = secondaryStorage?.getItem(key) ?? null
      if (secondaryValue != null) {
        try {
          preferredStorage?.setItem(key, secondaryValue)
          secondaryStorage?.removeItem(key)
        } catch {
          // Storage yazimi engellenirse secondary okumasi yeterli.
        }
        return secondaryValue
      }

      return memoryAuthStorage.getItem(key)
    },
    setItem: (key, value) => {
      const preferredMode = readPreferredAuthPersistenceMode()
      const preferredStorage = resolveBrowserStorage(preferredMode)
      const secondaryStorage = resolveBrowserStorage(preferredMode === 'local' ? 'session' : 'local')

      if (preferredStorage) {
        preferredStorage.setItem(key, value)
        secondaryStorage?.removeItem(key)
        memoryAuthStorage.removeItem(key)
        return
      }

      memoryAuthStorage.setItem(key, value)
      secondaryStorage?.removeItem(key)
    },
    removeItem: (key) => {
      resolveBrowserStorage('local')?.removeItem(key)
      resolveBrowserStorage('session')?.removeItem(key)
      memoryAuthStorage.removeItem(key)
    },
  }
}

const authStorage = resolveAuthStorage()

export const supabase = supabaseGlobalScope.__BSGMANGA_SUPABASE__
  ?? createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      /**
       * The safe default is sessionStorage; if the user turns on "Remember this device"
       * it moves to persistent local storage. So we can offer expected session persistence
       * as an option without increasing shared device risk
       * in the default behavior.
       */
      storage: authStorage,
      persistSession: true,
      /**
       * The browser lock API produced needless AbortError noise when reusing the same client.
       * With one client + app-level session reconcile we
       * keep the auth lock chain simple with a local no-op.
       */
      lock: runWithoutNavigatorLock,
    },
  })

if (!supabaseGlobalScope.__BSGMANGA_SUPABASE__) {
  supabaseGlobalScope.__BSGMANGA_SUPABASE__ = supabase
}
