import { withAbortSignal, withServiceTimeout } from './apiResilience'
import { createScopedLogger } from './logger'
import { supabase } from './supabase'
import { isAbortError } from './supabaseError'

type SiteSettingsPublicSnapshotRow = {
  site_title?: string | null
  site_description?: string | null
  maintenance_mode?: boolean | null
  registration_enabled?: boolean | null
  discord_invite_url?: string | null
  logo_url?: string | null
  storefront_runtime_config?: unknown
  store_home_config?: unknown
}

type SiteSettingsPublicContactSnapshotRow = {
  contact_email?: string | null
  discord_invite_url?: string | null
}

type SiteSettingsPublicSnapshotResult = {
  data: SiteSettingsPublicSnapshotRow | null
  error: unknown
}

// The DB column rejects empty/null (not-null + format check); a root URL with no invite code
// ('https://discord.gg/') passes the constraint but is a broken invite.
// It counts as absent here so public surfaces do not show the link.
function normalizeDiscordInviteUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim() || ''
  if (!trimmed) return null
  if (/^https?:\/\/(www\.)?discord\.gg\/?$/i.test(trimmed)) return null
  if (/^https?:\/\/(www\.)?discord\.com\/invite\/?$/i.test(trimmed)) return null
  return trimmed
}

type SiteSettingsPublicContactSnapshotResult = {
  data: SiteSettingsPublicContactSnapshotRow | null
  error: unknown
}

const SITE_SETTINGS_PUBLIC_CACHE_TTL_MS = 30_000
const siteSettingsPublicSnapshotLogger = createScopedLogger('siteSettingsPublicSnapshot')

let siteSettingsPublicSnapshotCache: {
  data: SiteSettingsPublicSnapshotRow | null
  expiresAt: number
} | null = null
let siteSettingsPublicSnapshotInFlight: Promise<SiteSettingsPublicSnapshotResult> | null = null
let siteSettingsPublicContactSnapshotCache: {
  data: SiteSettingsPublicContactSnapshotRow | null
  expiresAt: number
} | null = null
let siteSettingsPublicContactSnapshotInFlight: Promise<SiteSettingsPublicContactSnapshotResult> | null = null

function readSnapshotCache() {
  if (!siteSettingsPublicSnapshotCache) return null
  if (siteSettingsPublicSnapshotCache.expiresAt <= Date.now()) {
    siteSettingsPublicSnapshotCache = null
    return null
  }
  return siteSettingsPublicSnapshotCache.data
}

function writeSnapshotCache(data: SiteSettingsPublicSnapshotRow | null) {
  siteSettingsPublicSnapshotCache = {
    data,
    expiresAt: Date.now() + SITE_SETTINGS_PUBLIC_CACHE_TTL_MS,
  }
}

function readContactSnapshotCache() {
  if (!siteSettingsPublicContactSnapshotCache) return null
  if (siteSettingsPublicContactSnapshotCache.expiresAt <= Date.now()) {
    siteSettingsPublicContactSnapshotCache = null
    return null
  }
  return siteSettingsPublicContactSnapshotCache.data
}

function writeContactSnapshotCache(data: SiteSettingsPublicContactSnapshotRow | null) {
  siteSettingsPublicContactSnapshotCache = {
    data,
    expiresAt: Date.now() + SITE_SETTINGS_PUBLIC_CACHE_TTL_MS,
  }
}

export function clearSiteSettingsPublicSnapshotCache() {
  siteSettingsPublicSnapshotCache = null
  siteSettingsPublicContactSnapshotCache = null
}

export async function getSiteSettingsPublicSnapshot(
  options: { forceRefresh?: boolean } = {},
): Promise<SiteSettingsPublicSnapshotResult> {
  if (!options.forceRefresh) {
    const cached = readSnapshotCache()
    if (cached) {
      return { data: cached, error: null }
    }
  }

  if (siteSettingsPublicSnapshotInFlight && !options.forceRefresh) {
    return siteSettingsPublicSnapshotInFlight
  }

  const request = (async () => {
    const { data, error } = await withServiceTimeout(
      (signal) => withAbortSignal(
        supabase
          .from('site_settings')
          .select(`
            site_title,
            site_description,
            maintenance_mode,
            registration_enabled,
            discord_invite_url,
            logo_url,
            storefront_runtime_config,
            store_home_config
          `)
          .eq('id', 1)
          .maybeSingle(),
        signal,
      ),
      { label: 'siteSettingsPublicSnapshot.get' },
    )

    if (error) {
      if (!isAbortError(error)) {
        siteSettingsPublicSnapshotLogger.warn('public snapshot read failed', { error })
      }
      return { data: null, error }
    }

    const normalized = (data as SiteSettingsPublicSnapshotRow | null) || null
    if (normalized) {
      normalized.discord_invite_url = normalizeDiscordInviteUrl(normalized.discord_invite_url)
      writeSnapshotCache(normalized)
    }
    return { data: normalized, error: null }
  })()

  siteSettingsPublicSnapshotInFlight = request

  try {
    return await request
  } finally {
    if (siteSettingsPublicSnapshotInFlight === request) {
      siteSettingsPublicSnapshotInFlight = null
    }
  }
}

export async function getSiteSettingsPublicContactSnapshot(
  options: { forceRefresh?: boolean } = {},
): Promise<SiteSettingsPublicContactSnapshotResult> {
  if (!options.forceRefresh) {
    const cached = readContactSnapshotCache()
    if (cached) {
      return { data: cached, error: null }
    }
  }

  if (siteSettingsPublicContactSnapshotInFlight && !options.forceRefresh) {
    return siteSettingsPublicContactSnapshotInFlight
  }

  const request = (async () => {
    const { data, error } = await withServiceTimeout(
      (signal) => withAbortSignal(
        supabase
          .from('site_settings')
          .select(`
            contact_email,
            discord_invite_url
          `)
          .eq('id', 1)
          .maybeSingle(),
        signal,
      ),
      { label: 'siteSettingsPublicContactSnapshot.get' },
    )

    if (error) {
      if (!isAbortError(error)) {
        siteSettingsPublicSnapshotLogger.warn('public contact snapshot read failed', { error })
      }
      return { data: null, error }
    }

    const normalized = (data as SiteSettingsPublicContactSnapshotRow | null) || null
    if (normalized) {
      normalized.discord_invite_url = normalizeDiscordInviteUrl(normalized.discord_invite_url)
      writeContactSnapshotCache(normalized)
    }
    return { data: normalized, error: null }
  })()

  siteSettingsPublicContactSnapshotInFlight = request

  try {
    return await request
  } finally {
    if (siteSettingsPublicContactSnapshotInFlight === request) {
      siteSettingsPublicContactSnapshotInFlight = null
    }
  }
}
