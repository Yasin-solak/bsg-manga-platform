import { getPublicChapterUnlockCutoffIso } from './premiumPackagePublicService'
import { supabase } from './supabase'

type DbPublishedChapterMetaRow = {
  chapter_number: number
}

type DbMangaMetaRow = {
  last_chapter_number: number | null
}

/**
 * Syncs manga.last_chapter_number from chapters visible to the public
 * (approved + active + publish time reached).
 */
export async function syncMangaPublicChapterMeta(mangaId: string): Promise<number | null> {
  if (!mangaId) return null

  const nowIso = await getPublicChapterUnlockCutoffIso()

  const { data: latestChapter, error: latestChapterError } = await supabase
    .from('chapters')
    .select('chapter_number')
    .eq('manga_id', mangaId)
    .eq('is_active', true)
    .eq('is_approved', true)
    .lte('publish_at', nowIso)
    .order('chapter_number', { ascending: false })
    .order('publish_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle<DbPublishedChapterMetaRow>()

  if (latestChapterError) {
    console.error('[mangaMetaService] syncMangaPublicChapterMeta latest chapter error', latestChapterError)
    throw latestChapterError
  }

  const nextLastChapter = latestChapter ? Number(latestChapter.chapter_number) : null

  const { data: mangaRow, error: mangaReadError } = await supabase
    .from('mangas')
    .select('last_chapter_number')
    .eq('id', mangaId)
    .maybeSingle<DbMangaMetaRow>()

  if (mangaReadError) {
    console.error('[mangaMetaService] syncMangaPublicChapterMeta manga read error', mangaReadError)
    throw mangaReadError
  }

  if (!mangaRow) return nextLastChapter

  const currentLastChapter = mangaRow.last_chapter_number != null
    ? Number(mangaRow.last_chapter_number)
    : null

  // Avoid needless updates: do not fire the updated_at trigger for nothing.
  if (currentLastChapter === nextLastChapter) {
    return nextLastChapter
  }

  const { error: updateError } = await supabase
    .from('mangas')
    .update({ last_chapter_number: nextLastChapter })
    .eq('id', mangaId)

  if (updateError) {
    console.error('[mangaMetaService] syncMangaPublicChapterMeta manga update error', updateError)
    throw updateError
  }

  return nextLastChapter
}




