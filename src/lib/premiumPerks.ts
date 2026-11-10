import { useSyncExternalStore } from 'react'
import { z } from 'zod'
import { isPremiumPerkKey, PREMIUM_PERK_META, PREMIUM_PERKS, type PremiumPerkKey } from '@/data/premiumPerks'
import { withAbortSignal, withServiceTimeout } from '@/services/apiResilience'
import { supabase } from '@/services/supabase'

/*
 * On/off state of Premium perks (premium_perks_public). The list is fetched once and
 * cached in the browser; until a response arrives the cache is used, and without that the catalog default.
 * The server already does not apply a disabled perk; this state only aligns the UI with the same info.
 */

const perkSchema = z.object({
  key: z.string(),
  enabled: z.boolean(),
  config: z.record(z.unknown()).catch({}),
  updatedAt: z.string().nullable().optional().transform((value) => value ?? null),
})
export type PremiumPerkState = { enabled: boolean, config: Record<string, unknown>, updatedAt: string | null }
export type PremiumPerkMap = Record<PremiumPerkKey, PremiumPerkState>

const CACHE_KEY = 'bsg:premium-perks:v1'

function defaults(): PremiumPerkMap {
  return Object.fromEntries(PREMIUM_PERKS.map((perk) => [perk.key, {
    enabled: perk.defaultEnabled,
    config: perk.config ? { [perk.config.field]: perk.config.fallback } : {},
    updatedAt: null,
  }])) as PremiumPerkMap
}

function toMap(rows: Array<z.infer<typeof perkSchema>>): PremiumPerkMap {
  const map = defaults()
  for (const row of rows) {
    if (isPremiumPerkKey(row.key)) map[row.key] = { enabled: row.enabled, config: row.config, updatedAt: row.updatedAt }
  }
  return map
}

function readCache(): PremiumPerkMap {
  try {
    const raw = typeof window === 'undefined' ? null : window.localStorage.getItem(CACHE_KEY)
    if (!raw) return defaults()
    const parsed = z.array(perkSchema).safeParse(JSON.parse(raw))
    return parsed.success ? toMap(parsed.data) : defaults()
  } catch {
    return defaults()
  }
}

let perks: PremiumPerkMap = readCache()
let loaded = false
let loading: Promise<void> | null = null
const listeners = new Set<() => void>()

function emit() {
  listeners.forEach((listener) => listener())
}

/** Applies the server response and writes it to the cache (also called after a Shop Control save). */
export function setPremiumPerks(rows: unknown) {
  const parsed = z.array(perkSchema).safeParse(rows)
  if (!parsed.success) return
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(parsed.data))
  } catch {
    // Onbellek yalniz hizlandirir.
  }
  perks = toMap(parsed.data)
  loaded = true
  emit()
}

export function loadPremiumPerks(force = false) {
  if (loading && !force) return loading
  loading = withServiceTimeout(
    (signal) => withAbortSignal(supabase.rpc('premium_perks_public'), signal),
    { label: 'premiumPerks.public', timeoutMs: 10_000 },
  )
    .then(({ data, error }) => {
      if (!error) setPremiumPerks(data)
    })
    .catch(() => undefined)
  return loading
}

export function isPremiumPerkEnabled(key: PremiumPerkKey) {
  return perks[key]?.enabled ?? PREMIUM_PERK_META[key].defaultEnabled
}

/** Ayricaligin sayisal ayari (yuzde / saat); katalog sinirlarina kirpilir. */
export function premiumPerkValue(key: PremiumPerkKey, map: PremiumPerkMap = perks) {
  const field = PREMIUM_PERK_META[key].config
  if (!field) return null
  const raw = Number(map[key]?.config?.[field.field])
  if (!Number.isFinite(raw)) return field.fallback
  return Math.min(field.max, Math.max(field.min, Math.round(raw)))
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  if (!loading) void loadPremiumPerks()
  return () => { listeners.delete(listener) }
}

const getSnapshot = () => perks

export function usePremiumPerks() {
  const map = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  return {
    perks: map,
    loaded,
    isEnabled: (key: PremiumPerkKey) => map[key]?.enabled ?? PREMIUM_PERK_META[key].defaultEnabled,
    value: (key: PremiumPerkKey) => premiumPerkValue(key, map),
  }
}

export function usePremiumPerk(key: PremiumPerkKey) {
  const map = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  return map[key]?.enabled ?? PREMIUM_PERK_META[key].defaultEnabled
}
