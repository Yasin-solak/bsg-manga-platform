import type { Manga } from '@/types'
import { supabase } from './supabase'
import { createScopedLogger } from './logger'
import { clearSiteSettingsPublicSnapshotCache } from './siteSettingsPublicSnapshot'
import { type DbManga, MANGA_PUBLIC_SELECT, mapDbManga } from './mangaService/shared'

export interface HomepageConfig {
  featuredMangaIds: string[]
}

export interface HomepageMangaOption {
  id: string
  title: string
  slug?: string
  coverImageUrl?: string
  rating?: number
  totalViews?: number
}

const HOMEPAGE_FEATURED_KEY = 'homepage_featured_manga_ids'
const MAX_FEATURED_MANGA_COUNT = 5
const homepageConfigLogger = createScopedLogger('homepageConfigService')

function sanitizePostgrestSearchTerm(value: string) {
  return value.trim().replace(/[\\%_,()]/g, ' ').replace(/\s+/g, ' ').slice(0, 80)
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function sanitizeStringList(value: unknown, limit = MAX_FEATURED_MANGA_COUNT) {
  if (!Array.isArray(value)) return []

  const seen = new Set<string>()
  const result: string[] = []

  value.forEach((entry) => {
    if (typeof entry !== 'string') return
    const normalized = entry.trim()
    if (!normalized || seen.has(normalized)) return
    seen.add(normalized)
    result.push(normalized)
  })

  return result.slice(0, limit)
}

function sanitizeHomepageConfig(value: unknown): HomepageConfig {
  const row = asRecord(value)
  return {
    featuredMangaIds: sanitizeStringList(row[HOMEPAGE_FEATURED_KEY]),
  }
}

export async function getPublicHomepageConfig(): Promise<HomepageConfig> {
  const { data, error } = await supabase
    .from('site_settings')
    .select('store_home_config')
    .eq('id', 1)
    .maybeSingle()

  if (error) {
    homepageConfigLogger.warn({
      event: 'get-public-homepage-config-fallback',
      message: 'anasayfa konfig fallback kullanildi.',
      error,
    })
    return { featuredMangaIds: [] }
  }

  return sanitizeHomepageConfig(data?.store_home_config)
}

export async function updateAdminHomepageFeaturedMangaIds(ids: string[]): Promise<HomepageConfig> {
  const featuredMangaIds = sanitizeStringList(ids)
  const { data: currentRow, error: readError } = await supabase
    .from('site_settings')
    .select('store_home_config')
    .eq('id', 1)
    .maybeSingle()

  if (readError) {
    homepageConfigLogger.error({
      event: 'update-featured-manga-read-failed',
      message: 'featured manga ayari okunamadi.',
      error: readError,
    })
    throw readError
  }

  const nextStoreHomeConfig = {
    ...asRecord(currentRow?.store_home_config),
    [HOMEPAGE_FEATURED_KEY]: featuredMangaIds,
  }

  const { data, error } = await supabase
    .from('site_settings')
    .upsert({ id: 1, store_home_config: nextStoreHomeConfig }, { onConflict: 'id' })
    .select('store_home_config')
    .single()

  if (error) {
    homepageConfigLogger.error({
      event: 'update-featured-manga-failed',
      message: 'featured manga ayari yazilamadi.',
      error,
    })
    throw error
  }

  clearSiteSettingsPublicSnapshotCache()
  return sanitizeHomepageConfig(data?.store_home_config)
}

function toHomepageMangaOption(row: Partial<DbManga>): HomepageMangaOption {
  return {
    id: String(row.id || ''),
    title: String(row.title || ''),
    slug: row.slug || undefined,
    coverImageUrl: row.cover_image_url || undefined,
    rating: row.rating ?? undefined,
    totalViews: row.total_views ?? undefined,
  }
}

export async function loadHomepageFeaturedMangasByIds(ids: string[]): Promise<Manga[]> {
  const featuredMangaIds = sanitizeStringList(ids)
  if (featuredMangaIds.length === 0) return []

  const { data, error } = await supabase
    .from('mangas')
    .select(MANGA_PUBLIC_SELECT)
    .eq('is_active', true)
    .eq('is_approved', true)
    .in('id', featuredMangaIds)

  if (error) {
    homepageConfigLogger.warn({
      event: 'load-featured-mangas-fallback',
      message: 'featured manga listesi bos fallback kullandi.',
      error,
    })
    return []
  }

  const byId = new Map(((data || []) as DbManga[]).map((row) => [row.id, mapDbManga(row)]))
  return featuredMangaIds
    .map((id) => byId.get(id))
    .filter((item): item is Manga => Boolean(item))
}

export async function loadHomepageMangaOptionsByIds(ids: string[]): Promise<HomepageMangaOption[]> {
  const featuredMangaIds = sanitizeStringList(ids)
  if (featuredMangaIds.length === 0) return []

  const { data, error } = await supabase
    .from('mangas')
    .select('id, title, slug, cover_image_url, rating, total_views')
    .in('id', featuredMangaIds)

  if (error) {
    homepageConfigLogger.warn({
      event: 'load-manga-options-failed',
      message: 'manga secenekleri yuklenemedi.',
      error,
    })
    return []
  }

  const byId = new Map(((data || []) as Partial<DbManga>[]).map((row) => [String(row.id), toHomepageMangaOption(row)]))
  return featuredMangaIds
    .map((id) => byId.get(id))
    .filter((item): item is HomepageMangaOption => Boolean(item))
}

export async function searchHomepageMangaOptions(query: string, limit = 10): Promise<HomepageMangaOption[]> {
  const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(Math.floor(limit), 1), 20) : 10
  const trimmed = query.trim()

  let builder = supabase
    .from('mangas')
    .select('id, title, slug, cover_image_url, rating, total_views')
    .eq('is_active', true)
    .eq('is_approved', true)
    .order('total_views', { ascending: false, nullsFirst: false })
    .order('rating', { ascending: false, nullsFirst: false })
    .limit(safeLimit)

  if (trimmed) {
    const safeQuery = sanitizePostgrestSearchTerm(trimmed)
    builder = builder.or(`title.ilike.%${safeQuery}%,slug.ilike.%${safeQuery}%`)
  }

  const { data, error } = await builder

  if (error) {
    homepageConfigLogger.warn({
      event: 'search-manga-options-failed',
      message: 'manga secenek aramasi tamamlanamadi.',
      error,
    })
    return []
  }

  return ((data || []) as Partial<DbManga>[])
    .map(toHomepageMangaOption)
    .filter((item) => Boolean(item.id && item.title))
}
