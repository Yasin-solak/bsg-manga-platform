import type { Manga } from '@/types'
import { supabase } from './supabase'
import { clearSiteSettingsPublicSnapshotCache } from './siteSettingsPublicSnapshot'
import { type DbManga, MANGA_PUBLIC_SELECT, mapDbManga } from './mangaService/shared'

export interface ExploreCollectionConfig {
  id: string
  title: string
  targetGenreId: string
  imageUrl: string
  isActive: boolean
  sortOrder: number
}

export interface ExploreConfig {
  editorMangaIds: string[]
  collections: ExploreCollectionConfig[]
}

const EXPLORE_EDITOR_KEY = 'explore_editor_manga_ids'
const EXPLORE_COLLECTIONS_KEY = 'explore_thematic_collections'
const MAX_EDITOR_MANGA_COUNT = 12
const MAX_COLLECTION_COUNT = 12

export const DEFAULT_EXPLORE_COLLECTIONS: ExploreCollectionConfig[] = [
  {
    id: 'guc-fantezi',
    title: 'Güç Fantezisi',
    targetGenreId: 'fantasy',
    imageUrl: '/assets/explore/collections/guc-fantezi.webp',
    isActive: true,
    sortOrder: 10,
  },
  {
    id: 'aksiyon',
    title: 'Aksiyon',
    targetGenreId: 'action',
    imageUrl: '/assets/explore/collections/aksiyon.webp',
    isActive: true,
    sortOrder: 20,
  },
  {
    id: 'romantik',
    title: 'Romantik',
    targetGenreId: 'romance',
    imageUrl: '/assets/explore/collections/romantik.webp',
    isActive: true,
    sortOrder: 30,
  },
  {
    id: 'dram',
    title: 'Dram',
    targetGenreId: 'drama',
    imageUrl: '/assets/explore/collections/dram.webp',
    isActive: true,
    sortOrder: 40,
  },
  /*
   * The ones below are to WIDEN THE POOL.
   *
   * The home page shows four collections. With a pool of only four,
   * "personalization" would just reorder the same four, and
   * users would see the same cards whatever their genre.
   *
   * Images are SVG PLACEHOLDERS that say "test image": so nobody assumes it is
   * finished until real images are uploaded.
   */
  {
    id: 'dogaustu',
    title: 'Doğaüstü',
    targetGenreId: 'supernatural',
    imageUrl: '/assets/explore/collections/supernatural.svg',
    isActive: true,
    sortOrder: 50,
  },
  {
    id: 'okul-hayati',
    title: 'Okul Hayatı',
    targetGenreId: 'school',
    imageUrl: '/assets/explore/collections/school.svg',
    isActive: true,
    sortOrder: 60,
  },
  {
    id: 'korku',
    title: 'Korku',
    targetGenreId: 'horror',
    imageUrl: '/assets/explore/collections/horror.svg',
    isActive: true,
    sortOrder: 70,
  },
  {
    id: 'isekai',
    title: 'Isekai',
    targetGenreId: 'isekai',
    imageUrl: '/assets/explore/collections/isekai.svg',
    isActive: true,
    sortOrder: 80,
  },
  {
    id: 'komedi',
    title: 'Komedi',
    targetGenreId: 'comedy',
    imageUrl: '/assets/explore/collections/comedy.svg',
    isActive: true,
    sortOrder: 90,
  },
  {
    id: 'gizem',
    title: 'Gizem',
    targetGenreId: 'mystery',
    imageUrl: '/assets/explore/collections/mystery.svg',
    isActive: true,
    sortOrder: 100,
  },
]

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function sanitizeString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback
}

function sanitizeSlug(value: unknown, fallback: string) {
  const normalized = sanitizeString(value, fallback)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return normalized || fallback
}

export function sanitizeExploreEditorMangaIds(value: unknown, limit = MAX_EDITOR_MANGA_COUNT) {
  if (!Array.isArray(value)) return []

  const seen = new Set<string>()
  const result: string[] = []

  value.forEach((entry) => {
    if (typeof entry !== 'string') return
    const id = entry.trim()
    if (!id || seen.has(id)) return
    seen.add(id)
    result.push(id)
  })

  return result.slice(0, limit)
}

export function sanitizeExploreCollections(value: unknown): ExploreCollectionConfig[] {
  const rawItems = Array.isArray(value) ? value : DEFAULT_EXPLORE_COLLECTIONS
  const seen = new Set<string>()
  const items: ExploreCollectionConfig[] = []

  rawItems.forEach((entry, index) => {
    const row = asRecord(entry)
    const fallback = DEFAULT_EXPLORE_COLLECTIONS[index % DEFAULT_EXPLORE_COLLECTIONS.length]
    const id = sanitizeSlug(row.id, fallback?.id || `collection-${index + 1}`)
    if (seen.has(id)) return
    seen.add(id)

    const targetGenreId = sanitizeSlug(row.targetGenreId || row.genreId, fallback?.targetGenreId || 'action')
    const imageUrl = sanitizeString(row.imageUrl, fallback?.imageUrl || '')
    if (!imageUrl) return

    items.push({
      id,
      title: sanitizeString(row.title, fallback?.title || 'Koleksiyon'),
      targetGenreId,
      imageUrl,
      isActive: row.isActive !== false,
      sortOrder: Number.isFinite(Number(row.sortOrder)) ? Number(row.sortOrder) : (index + 1) * 10,
    })
  })

  return items
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .slice(0, MAX_COLLECTION_COUNT)
}

export function sanitizeExploreConfig(value: unknown): ExploreConfig {
  const row = asRecord(value)
  return {
    editorMangaIds: sanitizeExploreEditorMangaIds(row[EXPLORE_EDITOR_KEY]),
    collections: sanitizeExploreCollections(row[EXPLORE_COLLECTIONS_KEY]),
  }
}

export async function getPublicExploreConfig(): Promise<ExploreConfig> {
  const { data, error } = await supabase
    .from('site_settings')
    .select('store_home_config')
    .eq('id', 1)
    .maybeSingle()

  if (error) {
    console.warn('[exploreConfigService] getPublicExploreConfig fallback', error)
    return sanitizeExploreConfig({})
  }

  return sanitizeExploreConfig(data?.store_home_config)
}

export async function updateAdminExploreConfig(config: ExploreConfig): Promise<ExploreConfig> {
  const sanitized = {
    editorMangaIds: sanitizeExploreEditorMangaIds(config.editorMangaIds),
    collections: sanitizeExploreCollections(config.collections),
  }

  const { data: currentRow, error: readError } = await supabase
    .from('site_settings')
    .select('store_home_config')
    .eq('id', 1)
    .maybeSingle()

  if (readError) {
    console.error('[exploreConfigService] updateAdminExploreConfig read error', readError)
    throw readError
  }

  const nextStoreHomeConfig = {
    ...asRecord(currentRow?.store_home_config),
    [EXPLORE_EDITOR_KEY]: sanitized.editorMangaIds,
    [EXPLORE_COLLECTIONS_KEY]: sanitized.collections,
  }

  const { data, error } = await supabase
    .from('site_settings')
    .upsert({ id: 1, store_home_config: nextStoreHomeConfig }, { onConflict: 'id' })
    .select('store_home_config')
    .single()

  if (error) {
    console.error('[exploreConfigService] updateAdminExploreConfig error', error)
    throw error
  }

  clearSiteSettingsPublicSnapshotCache()
  return sanitizeExploreConfig(data?.store_home_config)
}

export async function loadExploreEditorMangasByIds(ids: string[]): Promise<Manga[]> {
  const editorMangaIds = sanitizeExploreEditorMangaIds(ids)
  if (editorMangaIds.length === 0) return []

  const { data, error } = await supabase
    .from('mangas')
    .select(MANGA_PUBLIC_SELECT)
    .eq('is_active', true)
    .eq('is_approved', true)
    .in('id', editorMangaIds)

  if (error) {
    console.warn('[exploreConfigService] loadExploreEditorMangasByIds fallback', error)
    return []
  }

  const byId = new Map(((data || []) as DbManga[]).map((row) => [row.id, mapDbManga(row)]))
  return editorMangaIds
    .map((id) => byId.get(id))
    .filter((item): item is Manga => Boolean(item))
}
