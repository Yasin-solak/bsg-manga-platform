import { DEFAULT_SETTINGS } from './shared.constants'
import type { DbSiteSettings } from './shared.db'
import { normalizeDiscordInviteUrl } from './shared.utils'
import type { SiteSettings } from './types'
import { sanitizeExploreCollections, sanitizeExploreEditorMangaIds } from '../exploreConfigService'
import { sanitizeMangaListCreateCoverImages } from '../mangaListPageConfigService'

const HOMEPAGE_FEATURED_KEY = 'homepage_featured_manga_ids'
const EXPLORE_EDITOR_KEY = 'explore_editor_manga_ids'
const EXPLORE_COLLECTIONS_KEY = 'explore_thematic_collections'
const LIST_CREATE_COVER_IMAGES_KEY = 'manga_lists_create_cover_images'

function sanitizeFeaturedMangaIds(value: unknown) {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const ids: string[] = []

  value.forEach((entry) => {
    if (typeof entry !== 'string') return
    const id = entry.trim()
    if (!id || seen.has(id)) return
    seen.add(id)
    ids.push(id)
  })

  return ids.slice(0, 5)
}

function readHomepageFeaturedMangaIds(storeHomeConfig: unknown) {
  if (!storeHomeConfig || typeof storeHomeConfig !== 'object' || Array.isArray(storeHomeConfig)) return []
  return sanitizeFeaturedMangaIds((storeHomeConfig as Record<string, unknown>)[HOMEPAGE_FEATURED_KEY])
}

function readExploreEditorMangaIds(storeHomeConfig: unknown) {
  if (!storeHomeConfig || typeof storeHomeConfig !== 'object' || Array.isArray(storeHomeConfig)) return []
  return sanitizeExploreEditorMangaIds((storeHomeConfig as Record<string, unknown>)[EXPLORE_EDITOR_KEY])
}

function readExploreCollections(storeHomeConfig: unknown) {
  if (!storeHomeConfig || typeof storeHomeConfig !== 'object' || Array.isArray(storeHomeConfig)) {
    return DEFAULT_SETTINGS.exploreCollections
  }
  return sanitizeExploreCollections((storeHomeConfig as Record<string, unknown>)[EXPLORE_COLLECTIONS_KEY])
}

function readMangaListCreateCoverImages(storeHomeConfig: unknown) {
  if (!storeHomeConfig || typeof storeHomeConfig !== 'object' || Array.isArray(storeHomeConfig)) {
    return DEFAULT_SETTINGS.mangaListCreateCoverImages
  }
  return sanitizeMangaListCreateCoverImages((storeHomeConfig as Record<string, unknown>)[LIST_CREATE_COVER_IMAGES_KEY])
}

export function mapDbSiteSettings(row: DbSiteSettings): SiteSettings {
  return {
    siteTitle: row.site_title || DEFAULT_SETTINGS.siteTitle,
    siteDescription: row.site_description || DEFAULT_SETTINGS.siteDescription,
    contactEmail: row.contact_email || DEFAULT_SETTINGS.contactEmail,
    maintenanceMode: !!row.maintenance_mode,
    registrationEnabled: row.registration_enabled !== false,
    discordInviteUrl: normalizeDiscordInviteUrl(row.discord_invite_url),
    logoUrl: row.logo_url || '',
    homepageFeaturedMangaIds: readHomepageFeaturedMangaIds(row.store_home_config),
    exploreEditorMangaIds: readExploreEditorMangaIds(row.store_home_config),
    exploreCollections: readExploreCollections(row.store_home_config),
    mangaListCreateCoverImages: readMangaListCreateCoverImages(row.store_home_config),
  }
}
