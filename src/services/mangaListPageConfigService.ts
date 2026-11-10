import { supabase } from './supabase'
import { clearSiteSettingsPublicSnapshotCache } from './siteSettingsPublicSnapshot'

export interface MangaListPageConfig {
  createCoverImages: string[]
}

const LIST_CREATE_COVER_IMAGES_KEY = 'manga_lists_create_cover_images'
const MAX_CREATE_COVER_IMAGE_COUNT = 3

export const DEFAULT_MANGA_LIST_CREATE_COVER_IMAGES = [
  '/assets/explore/collections/dram.webp',
  '/assets/explore/collections/aksiyon.webp',
  '/assets/explore/collections/romantik.webp',
]

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

export function sanitizeMangaListCreateCoverImages(value: unknown) {
  const source = Array.isArray(value) ? value : DEFAULT_MANGA_LIST_CREATE_COVER_IMAGES
  const seen = new Set<string>()
  const images: string[] = []

  source.forEach((entry) => {
    if (typeof entry !== 'string') return
    const image = entry.trim()
    if (!image || seen.has(image)) return
    seen.add(image)
    images.push(image)
  })

  const normalized = images.slice(0, MAX_CREATE_COVER_IMAGE_COUNT)
  return normalized.length > 0 ? normalized : DEFAULT_MANGA_LIST_CREATE_COVER_IMAGES
}

export function sanitizeMangaListPageConfig(value: unknown): MangaListPageConfig {
  const row = asRecord(value)
  return {
    createCoverImages: sanitizeMangaListCreateCoverImages(row[LIST_CREATE_COVER_IMAGES_KEY]),
  }
}

export async function getPublicMangaListPageConfig(): Promise<MangaListPageConfig> {
  const { data, error } = await supabase
    .from('site_settings')
    .select('store_home_config')
    .eq('id', 1)
    .maybeSingle()

  if (error) {
    console.warn('[mangaListPageConfigService] getPublicMangaListPageConfig fallback', error)
    return sanitizeMangaListPageConfig({})
  }

  return sanitizeMangaListPageConfig(data?.store_home_config)
}

export async function updateAdminMangaListPageConfig(config: MangaListPageConfig): Promise<MangaListPageConfig> {
  const sanitized = sanitizeMangaListPageConfig({
    [LIST_CREATE_COVER_IMAGES_KEY]: config.createCoverImages,
  })

  const { data: currentRow, error: readError } = await supabase
    .from('site_settings')
    .select('store_home_config')
    .eq('id', 1)
    .maybeSingle()

  if (readError) {
    console.error('[mangaListPageConfigService] updateAdminMangaListPageConfig read error', readError)
    throw readError
  }

  const nextStoreHomeConfig = {
    ...asRecord(currentRow?.store_home_config),
    [LIST_CREATE_COVER_IMAGES_KEY]: sanitized.createCoverImages,
  }

  const { data, error } = await supabase
    .from('site_settings')
    .upsert({ id: 1, store_home_config: nextStoreHomeConfig }, { onConflict: 'id' })
    .select('store_home_config')
    .single()

  if (error) {
    console.error('[mangaListPageConfigService] updateAdminMangaListPageConfig error', error)
    throw error
  }

  clearSiteSettingsPublicSnapshotCache()
  return sanitizeMangaListPageConfig(data?.store_home_config)
}
