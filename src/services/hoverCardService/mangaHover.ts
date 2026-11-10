import { createScopedLogger } from '../logger'
import { createRequestContext, toRequestContextLogContext } from '../requestContext'
import { supabase } from '../supabase'
import {
  getMangaFallbackCover,
  normalizeKey,
  readCache,
  writeCache,
} from './shared'
import type {
  CacheEntry,
  MangaHoverFetchInput,
  MangaRow,
  ResolvedMangaHoverData,
} from './types'

const mangaCache = new Map<string, CacheEntry<ResolvedMangaHoverData>>()
const mangaInFlight = new Map<string, Promise<ResolvedMangaHoverData | null>>()
const mangaHoverLogger = createScopedLogger('hoverCardService.mangaHover')

function buildMangaCacheKey(input: MangaHoverFetchInput) {
  const byId = normalizeKey(input.mangaId)
  if (byId) return `id:${byId}`

  const bySlug = normalizeKey(input.slug)
  if (bySlug) return `slug:${bySlug}`

  return ''
}

async function fetchMangaRow(input: MangaHoverFetchInput): Promise<MangaRow | null> {
  const mangaId = (input.mangaId || '').trim()
  const slug = normalizeKey(input.slug)

  if (!mangaId && !slug) return null

  const queryColumns = `
    id,
    slug,
    title,
    cover_image_url,
    description,
    status,
    last_chapter_number,
    genres,
    total_views
  `
  const queryById = async () => {
    if (!mangaId) return null
    const requestContext = createRequestContext('hoverCardService.mangaHover', 'fetch-manga-row-by-id', { mangaId })
    const { data, error } = await supabase
      .from('mangas')
      .select(queryColumns)
      .eq('id', mangaId)
      .eq('is_approved', true)
      .eq('is_active', true)
      .maybeSingle()

    if (error) {
      mangaHoverLogger.error({
        event: requestContext.event,
        message: 'manga satiri id ile alinamadi.',
        context: toRequestContextLogContext(requestContext),
        error,
      })
      return null
    }
    return (data || null) as MangaRow | null
  }

  const queryBySlug = async () => {
    if (!slug) return null
    const requestContext = createRequestContext('hoverCardService.mangaHover', 'fetch-manga-row-by-slug', { slug })
    const { data, error } = await supabase
      .from('mangas')
      .select(queryColumns)
      .eq('slug', slug)
      .eq('is_approved', true)
      .eq('is_active', true)
      .maybeSingle()

    if (error) {
      mangaHoverLogger.error({
        event: requestContext.event,
        message: 'manga satiri slug ile alinamadi.',
        context: toRequestContextLogContext(requestContext),
        error,
      })
      return null
    }
    return (data || null) as MangaRow | null
  }

  const byId = await queryById()
  if (byId) return byId
  return queryBySlug()
}

export async function resolveMangaHoverData(input: MangaHoverFetchInput): Promise<ResolvedMangaHoverData | null> {
  const cacheKey = buildMangaCacheKey(input)
  if (!cacheKey) return null

  const cached = readCache(mangaCache, cacheKey)
  if (cached !== undefined) return cached

  const inFlight = mangaInFlight.get(cacheKey)
  if (inFlight) return inFlight

  const request = (async () => {
    const manga = await fetchMangaRow(input)
    if (!manga) {
      writeCache(mangaCache, cacheKey, null)
      return null
    }

    const data: ResolvedMangaHoverData = {
      id: manga.id,
      slug: manga.slug || undefined,
      title: manga.title,
      coverImage: manga.cover_image_url || getMangaFallbackCover(manga.title),
      description: manga.description || undefined,
      status: manga.status || undefined,
      lastChapterNumber: manga.last_chapter_number ?? null,
      genres: Array.isArray(manga.genres) ? manga.genres.filter((genre) => typeof genre === 'string' && genre.trim().length > 0) : [],
      followerCount: 0,
      viewCount: Number(manga.total_views || 0),
    }

    writeCache(mangaCache, cacheKey, data)
    writeCache(mangaCache, `id:${normalizeKey(manga.id)}`, data)
    if (manga.slug) writeCache(mangaCache, `slug:${normalizeKey(manga.slug)}`, data)
    return data
  })()

  mangaInFlight.set(cacheKey, request)
  try {
    return await request
  } finally {
    mangaInFlight.delete(cacheKey)
  }
}
