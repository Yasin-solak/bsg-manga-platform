import { withAbortSignal, withServiceTimeout } from './apiResilience'
import { supabase } from './supabase'

type DbMyAccountEconomyRow = {
  id: string
  stones?: number | null
  owned_items?: Record<string, unknown> | null
  premium_expires_at?: string | null
}

export type MyAccountEconomySnapshot = {
  id: string
  stones: number
  ownedItems: Record<string, unknown>
  premiumExpiresAt: string | null
}

const MY_ACCOUNT_ECONOMY_CACHE_TTL_MS = 15_000
const MY_ACCOUNT_ECONOMY_STORAGE_KEY = 'bsgmanga-my-account-economy-snapshot'

let myAccountEconomySnapshotInFlight: Promise<MyAccountEconomySnapshot | null> | null = null
let myAccountEconomySnapshotCache: {
  value: MyAccountEconomySnapshot | null
  expiresAt: number
} | null = null

function getEconomySnapshotStorage(): Storage | null {
  if (typeof window === 'undefined') return null

  try {
    const storage = window.sessionStorage
    const probeKey = '__bsgmanga_economy_snapshot_probe__'
    storage.setItem(probeKey, '1')
    storage.removeItem(probeKey)
    return storage
  } catch {
    return null
  }
}

function normalizeStoredSnapshotPayload(value: unknown): MyAccountEconomySnapshot | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const payload = value as {
    id?: unknown
    stones?: unknown
    ownedItems?: unknown
    premiumExpiresAt?: unknown
    owned_items?: unknown
    premium_expires_at?: unknown
  }

  if (typeof payload.id !== 'string' || !payload.id.trim()) return null

  return {
    id: payload.id,
    stones: typeof payload.stones === 'number' && Number.isFinite(payload.stones) ? payload.stones : 0,
    ownedItems: normalizeOwnedItemsPayload(payload.ownedItems ?? payload.owned_items),
    premiumExpiresAt:
      typeof payload.premiumExpiresAt === 'string'
        ? payload.premiumExpiresAt
        : typeof payload.premium_expires_at === 'string'
          ? payload.premium_expires_at
          : null,
  }
}

function readStoredMyAccountEconomySnapshot(): MyAccountEconomySnapshot | null {
  const storage = getEconomySnapshotStorage()
  if (!storage) return null

  try {
    const raw = storage.getItem(MY_ACCOUNT_ECONOMY_STORAGE_KEY)
    if (!raw) return null
    return normalizeStoredSnapshotPayload(JSON.parse(raw))
  } catch {
    storage.removeItem(MY_ACCOUNT_ECONOMY_STORAGE_KEY)
    return null
  }
}

function writeStoredMyAccountEconomySnapshot(snapshot: MyAccountEconomySnapshot | null) {
  const storage = getEconomySnapshotStorage()
  if (!storage) return

  if (!snapshot) {
    storage.removeItem(MY_ACCOUNT_ECONOMY_STORAGE_KEY)
    return
  }

  try {
    storage.setItem(MY_ACCOUNT_ECONOMY_STORAGE_KEY, JSON.stringify(snapshot))
  } catch {
    // Storage quota/permission problemi display fallback'i engellemesin.
  }
}

function normalizeRpcRow<T>(data: unknown): T | null {
  if (!data) return null
  if (Array.isArray(data)) return (data[0] ?? null) as T | null
  return data as T
}

function normalizeOwnedItemsPayload(value: unknown): Record<string, unknown> {
  return {
    frames: ['default'],
    backgrounds: [],
    patterns: [],
    badges: [],
    premium: [],
    profile_effects: [],
    uploaded_background_slots: [],
    profile_background_upload_slot_limit: 1,
    ...(value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}),
  }
}

export function clearMyAccountEconomySnapshotCache() {
  myAccountEconomySnapshotInFlight = null
  myAccountEconomySnapshotCache = null
  writeStoredMyAccountEconomySnapshot(null)
}

export function primeMyAccountEconomySnapshotCache(snapshot: MyAccountEconomySnapshot | null) {
  // We keep the last correct economy summary so auth/focus syncs do not briefly drop to 0.
  myAccountEconomySnapshotCache = {
    value: snapshot,
    expiresAt: Date.now() + MY_ACCOUNT_ECONOMY_CACHE_TTL_MS,
  }
  writeStoredMyAccountEconomySnapshot(snapshot)
}

export function peekMyAccountEconomySnapshot(options: { userId?: string | null } = {}): MyAccountEconomySnapshot | null {
  const userId = typeof options.userId === 'string' && options.userId.trim() ? options.userId : null
  const cachedSnapshot = myAccountEconomySnapshotCache?.value ?? null

  if (cachedSnapshot && (!userId || cachedSnapshot.id === userId)) {
    return cachedSnapshot
  }

  const storedSnapshot = readStoredMyAccountEconomySnapshot()
  if (!storedSnapshot || (userId && storedSnapshot.id !== userId)) {
    return null
  }

  // We load the storage fallback back into the memory cache so sync surfaces can
  // use the last known correct snapshot too.
  myAccountEconomySnapshotCache = {
    value: storedSnapshot,
    expiresAt: Date.now() + MY_ACCOUNT_ECONOMY_CACHE_TTL_MS,
  }

  return storedSnapshot
}

export function resolveMyAccountStones(options: {
  userId?: string | null
  fallbackStones?: number | null
} = {}): number {
  const snapshot = peekMyAccountEconomySnapshot({ userId: options.userId })
  if (snapshot && Number.isFinite(snapshot.stones)) {
    return snapshot.stones
  }

  return typeof options.fallbackStones === 'number' && Number.isFinite(options.fallbackStones)
    ? options.fallbackStones
    : 0
}

export async function getMyAccountEconomySnapshot(
  options: { force?: boolean } = {},
): Promise<MyAccountEconomySnapshot | null> {
  const forceRefresh = options.force === true
  const now = Date.now()

  if (!forceRefresh && myAccountEconomySnapshotCache && myAccountEconomySnapshotCache.expiresAt > now) {
    return myAccountEconomySnapshotCache.value
  }

  if (!forceRefresh && myAccountEconomySnapshotInFlight) {
    return myAccountEconomySnapshotInFlight
  }

  const request = (async () => {
    const { data, error } = await withServiceTimeout(
      (signal) => withAbortSignal(
        supabase.rpc('get_my_account_economy_snapshot'),
        signal,
      ),
      { label: 'selfAccountEconomyService.getMyAccountEconomySnapshot' },
    )

    if (error) {
      throw error
    }

    const payload = normalizeRpcRow<DbMyAccountEconomyRow>(data)
    if (!payload?.id) return null

    const snapshot = {
      id: payload.id,
      stones: typeof payload.stones === 'number' ? payload.stones : 0,
      ownedItems: normalizeOwnedItemsPayload(payload.owned_items),
      premiumExpiresAt: typeof payload.premium_expires_at === 'string' ? payload.premium_expires_at : null,
    }

    primeMyAccountEconomySnapshotCache(snapshot)
    return snapshot
  })()

  myAccountEconomySnapshotInFlight = request

  try {
    return await request
  } catch (error) {
    // Keeping the last known correct balance on a brief RPC error is safer than showing a fake "0 coins".
    if (myAccountEconomySnapshotCache?.value) {
      return myAccountEconomySnapshotCache.value
    }
    const storedSnapshot = readStoredMyAccountEconomySnapshot()
    if (storedSnapshot) {
      primeMyAccountEconomySnapshotCache(storedSnapshot)
      return storedSnapshot
    }
    throw error
  } finally {
    if (myAccountEconomySnapshotInFlight === request) {
      myAccountEconomySnapshotInFlight = null
    }
  }
}
