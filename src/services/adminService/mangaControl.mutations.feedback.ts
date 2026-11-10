import { supabase } from '../supabase'
import { invalidateAdminMangaControlDetailCache } from './mangaControl.detail'
import { auditMangaMutation } from './mangaControl.mutations.shared'

type MangaRatingRow = {
  rating: number | null
}

async function updateMangaRatingSummary(mangaId: string) {
  const { data: ratingRows, error: ratingsError } = await supabase
    .from('manga_ratings')
    .select('rating')
    .eq('manga_id', mangaId)

  if (ratingsError) {
    console.error('[adminService] deleteAdminMangaRating fetch ratings error', ratingsError)
    throw ratingsError
  }

  const typedRatingRows = (ratingRows || []) as MangaRatingRow[]
  const totalRatings = typedRatingRows.length
  const averageRating = totalRatings > 0
    ? Number(
      (typedRatingRows.reduce((sum, row) => sum + Number(row.rating || 0), 0) / totalRatings).toFixed(2),
    )
    : null

  const { error: mangaUpdateError } = await supabase
    .from('mangas')
    .update({
      rating: averageRating,
      total_ratings: totalRatings,
    })
    .eq('id', mangaId)

  if (mangaUpdateError) {
    console.error('[adminService] deleteAdminMangaRating manga update error', mangaUpdateError)
    throw mangaUpdateError
  }

  return {
    totalRatings,
    averageRating,
  }
}

export async function setAdminMangaCommentActive(commentId: string, isActive: boolean): Promise<void> {
  const { error } = await supabase
    .from('manga_comments')
    .update({ is_active: isActive })
    .eq('id', commentId)

  if (error) {
    console.error('[adminService] setAdminMangaCommentActive error', error)
    throw error
  }

  invalidateAdminMangaControlDetailCache()
  await auditMangaMutation({
    action: 'manga_comment.active.update',
    resourceType: 'manga_comment',
    resourceId: commentId,
    summary: isActive ? 'Manga yorumu aktif edildi.' : 'Manga yorumu pasife alindi.',
    metadata: { isActive },
  })
}

export async function setAdminMangaCommentPinned(commentId: string, isPinned: boolean): Promise<void> {
  const { error } = await supabase
    .from('manga_comments')
    .update({ is_pinned: isPinned })
    .eq('id', commentId)

  if (error) {
    console.error('[adminService] setAdminMangaCommentPinned error', error)
    throw error
  }

  invalidateAdminMangaControlDetailCache()
  await auditMangaMutation({
    action: 'manga_comment.pin.update',
    resourceType: 'manga_comment',
    resourceId: commentId,
    summary: isPinned ? 'Manga yorumu sabitlendi.' : 'Manga yorumu sabitlikten cikarildi.',
    metadata: { isPinned },
  })
}

export async function deleteAdminMangaComment(commentId: string): Promise<void> {
  const { error } = await supabase
    .from('manga_comments')
    .delete()
    .eq('id', commentId)

  if (error) {
    console.error('[adminService] deleteAdminMangaComment error', error)
    throw error
  }

  invalidateAdminMangaControlDetailCache()
  await auditMangaMutation({
    action: 'manga_comment.delete',
    resourceType: 'manga_comment',
    resourceId: commentId,
    summary: 'Manga yorumu silindi.',
  })
}

export async function deleteAdminMangaRating(mangaId: string, userId: string): Promise<void> {
  const { error: deleteError } = await supabase
    .from('manga_ratings')
    .delete()
    .eq('manga_id', mangaId)
    .eq('user_id', userId)

  if (deleteError) {
    console.error('[adminService] deleteAdminMangaRating delete error', deleteError)
    throw deleteError
  }

  const { totalRatings, averageRating } = await updateMangaRatingSummary(mangaId)

  invalidateAdminMangaControlDetailCache(mangaId)
  await auditMangaMutation({
    action: 'manga_rating.delete',
    resourceType: 'manga_rating',
    resourceId: `${mangaId}:${userId}`,
    summary: 'Manga puani silindi.',
    metadata: {
      mangaId,
      userId,
      totalRatings,
      averageRating,
    },
  })
}
