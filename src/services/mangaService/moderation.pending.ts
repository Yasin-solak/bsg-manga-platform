import { supabase } from '../supabase'
import {
  type DbPendingContentRevisionRow,
  mapLatestPendingRevisions,
  type PendingRevisionMap,
} from './shared'
import {
  mapPendingChapterRow,
  mapPendingMangaRow,
} from './moderation.pending.mappers'
import { listLiveContentRevisions } from './moderation.pending.revisions'

export async function listPendingContent() {
  const { data: mangas, error: mangaError } = await supabase
    .from('mangas')
    .select(`
      id,
      fansub_id,
      title,
      slug,
      description,
      author,
      artist,
      status,
      genres,
      cover_image_url,
      is_approved,
      is_active,
      last_chapter_number,
      total_views,
      rating,
      total_ratings,
      release_date,
      created_at,
      updated_at,
      fansub:fansub_id(name)
    `)
    .eq('is_approved', false)
    .order('created_at', { ascending: false })

  const { data: chapters, error: chapterError } = await supabase
    .from('chapters')
    .select(`
      id,
      manga_id,
      fansub_id,
      chapter_number,
      title,
      pages,
      publish_at,
      is_approved,
      is_active,
      created_at,
      updated_at,
      manga:manga_id(title, slug, cover_image_url),
      fansub:fansub_id(name)
    `)
    .eq('is_approved', false)
    .order('created_at', { ascending: false })

  if (mangaError || chapterError) {
    console.error('listPendingContent error', mangaError, chapterError)
    return { mangas: [], chapters: [] }
  }

  const pendingMangaIds = ((mangas || []) as Array<{ id: string }>).map((row) => row.id)
  const pendingChapterIds = ((chapters || []) as Array<{ id: string }>).map((row) => row.id)
  const followerCountByManga = new Map<string, number>()
  let revisionByTarget: PendingRevisionMap = new Map()

  if (pendingMangaIds.length > 0) {
    const { data: follows, error: followError } = await supabase
      .from('manga_follows')
      .select('manga_id')
      .in('manga_id', pendingMangaIds)

    if (followError) {
      console.error('[mangaService] listPendingContent follower query error', followError)
    } else {
      ;((follows || []) as Array<{ manga_id: string }>).forEach((row) => {
        followerCountByManga.set(row.manga_id, (followerCountByManga.get(row.manga_id) || 0) + 1)
      })
    }
  }

  const revisionTargetIds = [...pendingMangaIds, ...pendingChapterIds]
  if (revisionTargetIds.length > 0) {
    const { data: revisionRows, error: revisionError } = await supabase
      .from('pending_content_revisions')
      .select('target_type, target_id, change_action, before_data, after_data, created_at')
      .eq('status', 'pending')
      .in('target_type', ['manga', 'chapter'])
      .in('target_id', revisionTargetIds)
      .order('created_at', { ascending: false })

    if (revisionError) {
      console.error('[mangaService] listPendingContent revision query error', revisionError)
    } else {
      revisionByTarget = mapLatestPendingRevisions(
        (revisionRows || []) as DbPendingContentRevisionRow[],
      )
    }
  }

  // Pending changes to published content (the old version stays live until approval).
  const live = await listLiveContentRevisions()

  return {
    mangas: [
      ...(mangas || []).map((row: any) =>
        mapPendingMangaRow(row, revisionByTarget, followerCountByManga.get(row.id) || 0)),
      ...live.mangas,
    ],
    chapters: [
      ...(chapters || []).map((row: any) => mapPendingChapterRow(row, revisionByTarget)),
      ...live.chapters,
    ],
  }
}
