import { syncMangaPublicChapterMeta } from '../mangaMetaService'
import { supabase } from '../supabase'

export async function approveManga(id: string) {
  const { error } = await supabase
    .from('mangas')
    .update({ is_approved: true })
    .eq('id', id)
  if (error) throw error
}

export async function rejectManga(id: string) {
  const { error } = await supabase
    .from('mangas')
    .delete()
    .eq('id', id)
  if (error) throw error
}

export async function approveChapter(id: string) {
  const { data, error } = await supabase
    .from('chapters')
    .update({ is_approved: true })
    .eq('id', id)
    .select('manga_id')
    .maybeSingle<{ manga_id: string }>()
  if (error) throw error
  if (data?.manga_id) {
    await syncMangaPublicChapterMeta(data.manga_id)
  }
}

export async function rejectChapter(id: string) {
  const { data, error } = await supabase
    .from('chapters')
    .delete()
    .eq('id', id)
    .select('manga_id, is_approved')
    .maybeSingle<{ manga_id: string; is_approved: boolean | null }>()
  if (error) throw error
  if (data?.manga_id && data.is_approved === true) {
    await syncMangaPublicChapterMeta(data.manga_id)
  }
}
