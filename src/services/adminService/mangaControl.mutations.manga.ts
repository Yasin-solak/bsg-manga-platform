import { supabase } from '../supabase'
import { invalidateAdminMangaControlDetailCache } from './mangaControl.detail'
import { auditMangaMutation } from './mangaControl.mutations.shared'
import { createScopedLogger } from '../logger'
import { toUserFacingErrorMessage } from '../userFacingError'

const mangaMutationsLogger = createScopedLogger('adminService/mangaControl.mutations.manga')

export async function setAdminMangaActive(mangaId: string, isActive: boolean): Promise<void> {
  const { error } = await supabase
    .from('mangas')
    .update({ is_active: isActive })
    .eq('id', mangaId)

  if (error) {
    console.error('[adminService] setAdminMangaActive error', error)
    throw error
  }

  invalidateAdminMangaControlDetailCache(mangaId)
  await auditMangaMutation({
    action: 'manga.active.update',
    resourceType: 'manga',
    resourceId: mangaId,
    summary: isActive ? 'Manga aktif edildi.' : 'Manga pasife alindi.',
    metadata: { isActive },
  })
}

export async function setAdminMangaApproved(mangaId: string, isApproved: boolean): Promise<void> {
  const { error } = await supabase
    .from('mangas')
    .update({ is_approved: isApproved })
    .eq('id', mangaId)

  if (error) {
    console.error('[adminService] setAdminMangaApproved error', error)
    throw error
  }

  invalidateAdminMangaControlDetailCache(mangaId)
  await auditMangaMutation({
    action: 'manga.approval.update',
    resourceType: 'manga',
    resourceId: mangaId,
    summary: isApproved ? 'Manga onaylandi.' : 'Manga onayi kaldirildi.',
    metadata: { isApproved },
  })
}

export async function setAdminMangaStatus(
  mangaId: string,
  status: 'ongoing' | 'completed' | 'hiatus',
): Promise<void> {
  const { error } = await supabase
    .from('mangas')
    .update({ status })
    .eq('id', mangaId)

  if (error) {
    console.error('[adminService] setAdminMangaStatus error', error)
    throw error
  }

  invalidateAdminMangaControlDetailCache(mangaId)
  await auditMangaMutation({
    action: 'manga.status.update',
    resourceType: 'manga',
    resourceId: mangaId,
    summary: `Manga durumu "${status}" olarak guncellendi.`,
    metadata: { status },
  })
}

export async function setAdminMangaGenres(mangaId: string, genres: string[]): Promise<void> {
  const normalizedGenres = Array.from(
    new Set(
      (genres || [])
        .map((genre) => genre.trim())
        .filter(Boolean),
    ),
  ).slice(0, 20)

  const { error } = await supabase
    .from('mangas')
    .update({ genres: normalizedGenres })
    .eq('id', mangaId)

  if (error) {
    console.error('[adminService] setAdminMangaGenres error', error)
    throw error
  }

  invalidateAdminMangaControlDetailCache(mangaId)
  await auditMangaMutation({
    action: 'manga.genres.update',
    resourceType: 'manga',
    resourceId: mangaId,
    summary: 'Manga tur listesi guncellendi.',
    metadata: { genres: normalizedGenres },
  })
}

/** Seri turu — kaynak dili DEGIL, serinin ne oldugu. */
export const SERIES_TYPES = ['manga', 'manhwa', 'manhua', 'webtoon', 'yerli'] as const
export type SeriesType = (typeof SERIES_TYPES)[number]

export async function setAdminMangaSeriesType(mangaId: string, seriesType: SeriesType): Promise<void> {
  // The database has a check constraint too; rejecting early here keeps an invalid
  // value out of the audit record.
  if (!SERIES_TYPES.includes(seriesType)) {
    throw new Error(`Gecersiz seri turu: ${seriesType}`)
  }

  const { error } = await supabase
    .from('mangas')
    .update({ series_type: seriesType })
    .eq('id', mangaId)

  if (error) {
    mangaMutationsLogger.error({
      event: 'admin-manga-series-type-update',
      message: toUserFacingErrorMessage(error, 'Seri turu guncellenemedi.'),
      context: { mangaId, seriesType },
      error,
    })
    throw error
  }

  invalidateAdminMangaControlDetailCache(mangaId)
  await auditMangaMutation({
    action: 'manga.series_type.update',
    resourceType: 'manga',
    resourceId: mangaId,
    summary: `Seri turu "${seriesType}" olarak guncellendi.`,
    metadata: { seriesType },
  })
}

/**
 * 18+ flag.
 *
 * RLS is what actually enforces visibility (mangas_select_public + chapters_select_public):
 * users under 18 or with an unknown birth date never see this series.
 * This flag is the KEY to that gate, not a cosmetic badge,
 * so changes are written to the audit record.
 */
export async function setAdminMangaMature(mangaId: string, isMature: boolean): Promise<void> {
  const { error } = await supabase
    .from('mangas')
    .update({ is_mature: isMature })
    .eq('id', mangaId)

  if (error) {
    mangaMutationsLogger.error({
      event: 'admin-manga-mature-update',
      message: toUserFacingErrorMessage(error, '18+ isareti guncellenemedi.'),
      context: { mangaId, isMature },
      error,
    })
    throw error
  }

  invalidateAdminMangaControlDetailCache(mangaId)
  await auditMangaMutation({
    action: 'manga.mature.update',
    resourceType: 'manga',
    resourceId: mangaId,
    summary: isMature
      ? 'Seri 18+ olarak isaretlendi; yasi dogrulanmamis kullanicilara gorunmez.'
      : 'Serinin 18+ isareti kaldirildi.',
    metadata: { isMature },
  })
}

export async function setAdminMangaDescription(mangaId: string, description: string): Promise<void> {
  const normalized = description.trim()

  const { error } = await supabase
    .from('mangas')
    .update({ description: normalized || null })
    .eq('id', mangaId)

  if (error) {
    console.error('[adminService] setAdminMangaDescription error', error)
    throw error
  }

  invalidateAdminMangaControlDetailCache(mangaId)
  await auditMangaMutation({
    action: 'manga.description.update',
    resourceType: 'manga',
    resourceId: mangaId,
    summary: 'Manga aciklamasi guncellendi.',
    metadata: { hasDescription: Boolean(normalized) },
  })
}

export async function setAdminMangaCoverImage(mangaId: string, coverImageUrl: string): Promise<void> {
  const safeCoverImageUrl = coverImageUrl.trim()
  if (!safeCoverImageUrl) {
    throw new Error('Kapak URL bos olamaz.')
  }

  const { error } = await supabase
    .from('mangas')
    .update({ cover_image_url: safeCoverImageUrl })
    .eq('id', mangaId)

  if (error) {
    console.error('[adminService] setAdminMangaCoverImage error', error)
    throw error
  }

  invalidateAdminMangaControlDetailCache(mangaId)
  await auditMangaMutation({
    action: 'manga.cover.update',
    resourceType: 'manga',
    resourceId: mangaId,
    summary: 'Manga kapak gorseli guncellendi.',
    metadata: { coverImageUrl: safeCoverImageUrl },
  })
}
