import { buildPublicFansubPath, buildPublicMangaPath } from '@/lib/routes'
import { buildCoverPlaceholder } from '@/lib/coverPlaceholder'
import { sanitizeLikeQuery } from './communityMentionService/shared'
import { supabase } from './supabase'
import { withAbortSignal } from './apiResilience'

export interface GlobalSearchMangaItem {
  id: string
  title: string
  slug?: string
  coverImage?: string
  rating?: number
  href: string
}

export interface GlobalSearchAuthorItem {
  name: string
  mangaCount: number
  href: string
}

export interface GlobalSearchFansubItem {
  id: string
  name: string
  slug?: string
  avatar?: string
  followerCount?: number
  href: string
}

export interface GlobalSearchUserItem {
  id: string
  username: string
  displayName: string
  avatar?: string
  href: string
}

export interface GlobalSearchResult {
  partial?: boolean
  mangas: GlobalSearchMangaItem[]
  authors: GlobalSearchAuthorItem[]
  fansubs: GlobalSearchFansubItem[]
  users: GlobalSearchUserItem[]
}

const EMPTY_RESULT: GlobalSearchResult = {
  mangas: [],
  authors: [],
  fansubs: [],
  users: [],
}

type MangaSearchRow = {
  id: string
  title: string
  slug: string | null
  cover_image_url: string | null
  rating: number | null
  total_views: number | null
  author: string | null
  artist: string | null
}

type FansubSearchRow = {
  id: string
  name: string
  slug: string | null
  avatar_url: string | null
  follower_count: number | null
}

type UserSearchRow = {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
}

function normalizeQuery(query: string) {
  return sanitizeLikeQuery(query).trim()
}

function normalizeUserQuery(query: string) {
  const withoutHandlePrefix = query.trim().replace(/^@+/, '')
  if (/^[a-z0-9_-]+$/i.test(withoutHandlePrefix)) {
    return withoutHandlePrefix.slice(0, 80)
  }
  return sanitizeLikeQuery(withoutHandlePrefix).trim()
}

function buildAuthorItems(rows: MangaSearchRow[], query: string): GlobalSearchAuthorItem[] {
  const normalizedQuery = query.toLocaleLowerCase('tr-TR')
  const authorMap = new Map<string, number>()

  rows.forEach((row) => {
    ;[row.author, row.artist].forEach((name) => {
      const trimmed = String(name || '').trim()
      if (!trimmed) return
      if (normalizedQuery && !trimmed.toLocaleLowerCase('tr-TR').includes(normalizedQuery)) return
      authorMap.set(trimmed, (authorMap.get(trimmed) || 0) + 1)
    })
  })

  return [...authorMap.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], 'tr'))
    .slice(0, 4)
    .map(([name, mangaCount]) => ({
      name,
      mangaCount,
      href: `/kesfet?q=${encodeURIComponent(name)}`,
    }))
}

export async function searchGlobalEntities(query: string, limit = 5, signal?: AbortSignal): Promise<GlobalSearchResult> {
  const safeQuery = normalizeQuery(query.slice(0, 80))
  if (safeQuery.length < 2) return EMPTY_RESULT

  const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(Math.floor(limit), 1), 8) : 5
  const like = `%${safeQuery}%`
  const userQuery = normalizeUserQuery(query)
  const userLike = `%${userQuery || safeQuery}%`

  const [mangasResult, fansubsResult, usersResult] = await Promise.all([
    withAbortSignal(supabase
      .from('mangas')
      .select('id, title, slug, cover_image_url, rating, total_views, author, artist')
      .eq('is_active', true)
      .eq('is_approved', true)
      .or(`title.ilike.${like},slug.ilike.${like},author.ilike.${like},artist.ilike.${like}`)
      .order('total_views', { ascending: false, nullsFirst: false })
      .limit(safeLimit * 2), signal),
    withAbortSignal(supabase
      .from('fansubs')
      .select('id, name, slug, avatar_url, follower_count')
      .eq('is_active', true)
      .or(`name.ilike.${like},slug.ilike.${like}`)
      .order('follower_count', { ascending: false, nullsFirst: false })
      .limit(safeLimit), signal),
    withAbortSignal(supabase
      .from('public_user_directory')
      .select('id, username, display_name, avatar_url')
      .or(`username.ilike.${userLike},display_name.ilike.${userLike}`)
      .order('username', { ascending: true })
      .limit(safeLimit), signal),
  ])

  if (signal?.aborted) throw new DOMException('Arama iptal edildi.', 'AbortError')
  if (mangasResult.error || fansubsResult.error || usersResult.error) {
    console.warn('[globalSearchService] searchGlobalEntities partial error', {
      manga: mangasResult.error,
      fansub: fansubsResult.error,
      user: usersResult.error,
    })
  }

  const mangaRows = ((mangasResult.data || []) as MangaSearchRow[])
  const mangas = mangaRows.slice(0, safeLimit).map((row) => ({
    id: row.id,
    title: row.title,
    slug: row.slug || undefined,
    coverImage: row.cover_image_url || buildCoverPlaceholder(row.title),
    rating: row.rating ?? undefined,
    href: buildPublicMangaPath({ id: row.id, slug: row.slug, title: row.title }),
  }))

  const fansubs = ((fansubsResult.data || []) as FansubSearchRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug || undefined,
    avatar: row.avatar_url || undefined,
    followerCount: row.follower_count ?? undefined,
    href: buildPublicFansubPath({ id: row.id, slug: row.slug }),
  }))

  const users = ((usersResult.data || []) as UserSearchRow[]).map((row) => ({
    id: row.id,
    username: row.username,
    displayName: row.display_name?.trim() || row.username,
    avatar: row.avatar_url || undefined,
    href: `/profil/${encodeURIComponent(row.username)}`,
  }))

  return {
    partial: Boolean(mangasResult.error || fansubsResult.error || usersResult.error),
    mangas,
    authors: buildAuthorItems(mangaRows, safeQuery),
    fansubs,
    users,
  }
}
