import { supabase } from './supabase'

type RawOfferItem = {
  id?: unknown
  identifier?: unknown
  name?: unknown
  description?: unknown
  price?: unknown
}

export type ActivePremiumOfferItem = {
  id: string
  identifier: string
  name: string
  description?: string
  price?: number
}

export type ActivePremiumOffer = {
  premiumItem: ActivePremiumOfferItem
  durationDays: number
  publicUnlockDelayHours: number
}

type ActivePremiumOfferResult = {
  data: ActivePremiumOffer | null
  error: unknown
}

const OFFER_CACHE_TTL_MS = 5 * 60 * 1000
const DEFAULT_PREMIUM_DURATION_DAYS = 30
const DEFAULT_PUBLIC_UNLOCK_DELAY_HOURS = 36

let activePremiumOfferCache: {
  data: ActivePremiumOffer | null
  expiresAt: number
} | null = null
let activePremiumOfferInflight: Promise<ActivePremiumOfferResult> | null = null

function toText(value: unknown) {
  if (typeof value !== 'string') return ''
  return value.trim()
}

function toOptionalNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

function toPositiveInteger(value: unknown, fallback: number) {
  const parsed = toOptionalNumber(value)
  if (parsed == null) return fallback
  const normalized = Math.max(0, Math.floor(parsed))
  return normalized > 0 ? normalized : fallback
}

function normalizeOfferItem(payload: unknown) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
  const row = payload as RawOfferItem
  const id = toText(row.id)
  const identifier = toText(row.identifier)
  const name = toText(row.name)
  if (!id || !identifier || !name) return null
  const description = toText(row.description) || undefined
  return {
    id,
    identifier,
    name,
    description,
    price: toOptionalNumber(row.price),
  } as ActivePremiumOfferItem
}

function normalizeOffer(payload: unknown) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
  const row = payload as Record<string, unknown>
  const premiumItem = normalizeOfferItem(row.premium_item)

  if (!premiumItem) {
    return null
  }

  return {
    premiumItem,
    durationDays: toPositiveInteger(row.duration_days, DEFAULT_PREMIUM_DURATION_DAYS),
    publicUnlockDelayHours: toPositiveInteger(row.public_unlock_delay_hours, DEFAULT_PUBLIC_UNLOCK_DELAY_HOURS),
  } as ActivePremiumOffer
}

function readCachedOffer() {
  if (!activePremiumOfferCache) return null
  if (Date.now() > activePremiumOfferCache.expiresAt) return null
  return activePremiumOfferCache.data
}

function writeOfferCache(data: ActivePremiumOffer | null) {
  activePremiumOfferCache = {
    data,
    expiresAt: Date.now() + OFFER_CACHE_TTL_MS,
  }
}

export function clearActivePremiumOfferCache() {
  activePremiumOfferCache = null
}

export async function getActivePremiumOffer(options: { forceRefresh?: boolean } = {}): Promise<ActivePremiumOfferResult> {
  if (!options.forceRefresh) {
    const cached = readCachedOffer()
    if (cached !== null) {
      return { data: cached, error: null }
    }
  }

  if (activePremiumOfferInflight && !options.forceRefresh) {
    return activePremiumOfferInflight
  }

  const request = (async () => {
    const { data, error } = await supabase.rpc('get_active_premium_offer')

    if (error) {
      console.error('[premiumPackagePublicService] getActivePremiumOffer error', error)
      return { data: null, error }
    }

    const normalized = normalizeOffer(data)
    writeOfferCache(normalized)
    return {
      data: normalized,
      error: null,
    }
  })()

  activePremiumOfferInflight = request

  try {
    return await request
  } finally {
    if (activePremiumOfferInflight === request) {
      activePremiumOfferInflight = null
    }
  }
}

export async function getPublicUnlockDelayHours(options: { forceRefresh?: boolean } = {}) {
  const result = await getActivePremiumOffer(options)
  if (result.data) return result.data.publicUnlockDelayHours
  return DEFAULT_PUBLIC_UNLOCK_DELAY_HOURS
}

export async function getPublicChapterUnlockCutoffIso(baseDate = new Date(), options: { forceRefresh?: boolean } = {}) {
  const delayHours = await getPublicUnlockDelayHours(options)
  return new Date(baseDate.getTime() - delayHours * 60 * 60 * 1000).toISOString()
}

export function isPremiumActive(premiumExpiresAt?: string | null, referenceTimeMs = Date.now()) {
  if (typeof premiumExpiresAt !== 'string') return false
  const parsed = Date.parse(premiumExpiresAt)
  if (!Number.isFinite(parsed)) return false
  return parsed > referenceTimeMs
}
