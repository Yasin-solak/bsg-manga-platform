import { supabase } from '../supabase'
import type {
  DbAdminChapterStatRow,
  DbAdminFansubAdminMemberRow,
} from './shared.db'
import { mapDbMangaChapterStats } from './shared.mappers'
import { getSingleRelation } from './shared.utils'
import type {
  AdminMangaActorMini,
  AdminMangaChapterStats,
} from './types'

export async function fetchChapterStatsByMangaIds(mangaIds: string[]) {
  if (mangaIds.length === 0) return new Map<string, AdminMangaChapterStats>()

  const { data, error } = await supabase
    .from('chapters')
    .select('manga_id, is_approved, is_active')
    .in('manga_id', mangaIds)

  if (error) {
    console.error('[adminService] fetchChapterStatsByMangaIds error', error)
    throw error
  }

  return mapDbMangaChapterStats((data || []) as DbAdminChapterStatRow[])
}

export async function fetchMangaFollowerCountsByMangaIds(mangaIds: string[]) {
  const normalizedMangaIds = Array.from(new Set(mangaIds.filter(Boolean)))
  const map = new Map<string, number>()
  if (normalizedMangaIds.length === 0) return map

  const { data, error } = await supabase
    .from('manga_follows')
    .select('manga_id')
    .in('manga_id', normalizedMangaIds)

  if (error) {
    console.error('[adminService] fetchMangaFollowerCountsByMangaIds error', error)
    return map
  }

  ;(data || []).forEach((row: any) => {
    const mangaId = typeof row?.manga_id === 'string' ? row.manga_id : null
    if (!mangaId) return
    map.set(mangaId, (map.get(mangaId) || 0) + 1)
  })

  return map
}

export async function fetchFansubAdminUsersByFansubIds(fansubIds: string[]) {
  const normalizedFansubIds = Array.from(new Set(fansubIds.filter(Boolean)))
  const map = new Map<string, AdminMangaActorMini>()
  if (normalizedFansubIds.length === 0) return map

  const { data, error } = await supabase
    .from('fansub_members')
    .select(`
      fansub_id,
      user_id,
      user:user_id (
        id,
        username,
        avatar_url
      )
    `)
    .eq('role', 'admin')
    .in('fansub_id', normalizedFansubIds)

  if (error) {
    console.error('[adminService] fetchFansubAdminUsersByFansubIds error', error)
    return map
  }

  ;((data || []) as DbAdminFansubAdminMemberRow[]).forEach((row) => {
    if (!row.fansub_id || map.has(row.fansub_id)) return
    const user = getSingleRelation(row.user)
    if (!user) return
    map.set(row.fansub_id, {
      id: user.id,
      username: user.username,
      avatarUrl: user.avatar_url || undefined,
    })
  })

  return map
}
