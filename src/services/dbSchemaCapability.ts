export const FANSUB_ACTIVE_PROFILE_EFFECT_COLUMN_STORAGE_KEY = 'mz:schema:fansubs:active-profile-effect-id:v1'

const SCHEMA_CAPABILITY_TTL_MS = 6 * 60 * 60 * 1000

type StoredSchemaCapability = {
  available: boolean
  updatedAt: number
}

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

export function readStoredColumnCapability(storageKey: string): boolean | null {
  if (!canUseStorage()) return null

  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) return null

    const parsed = JSON.parse(raw) as Partial<StoredSchemaCapability>
    if (typeof parsed.available !== 'boolean' || typeof parsed.updatedAt !== 'number') {
      window.localStorage.removeItem(storageKey)
      return null
    }

    if (Date.now() - parsed.updatedAt > SCHEMA_CAPABILITY_TTL_MS) {
      window.localStorage.removeItem(storageKey)
      return null
    }

    return parsed.available
  } catch {
    return null
  }
}

export function writeStoredColumnCapability(storageKey: string, available: boolean) {
  if (!canUseStorage()) return

  try {
    window.localStorage.setItem(storageKey, JSON.stringify({
      available,
      updatedAt: Date.now(),
    }))
  } catch {
    // localStorage engelli ortamlarda sessiz gec.
  }
}
