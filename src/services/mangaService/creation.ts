import { createRandomSlugSuffix, slugifyText } from '@/lib/slug'
import { uploadChapterPages, uploadMangaCover } from '../storageService'
import {
  mergeChapterPageDimensionMap,
  toStorableChapterPageDimensions,
} from '@/lib/chapterPageDimensions'
import { supabase } from '../supabase'
import { mapDbChapter, mapDbManga, toIsoOrNow } from './shared'

export async function createManga(
  fansubId: string,
  payload: {
    title: string
    description: string
    coverFile?: File | null
    author?: string
    artist?: string
    status?: string
    originalLang?: string
    releaseDate?: string
    genres?: string[]
    tags?: string[]
    isNew?: boolean
  },
) {
  let coverUrl = null
  if (payload.coverFile) {
    coverUrl = await uploadMangaCover(payload.coverFile, {
      fansubId,
      draftKey: payload.title,
    })
  }

  const slugBase = slugifyText(payload.title, { maxLength: 72 })
  const generatedSlug = `${slugBase || 'manga'}-${createRandomSlugSuffix(5)}`

  const { data, error } = await supabase
    .from('mangas')
    .insert({
      fansub_id: fansubId,
      title: payload.title,
      slug: generatedSlug,
      description: payload.description,
      cover_image_url: coverUrl,
      author: payload.author,
      artist: payload.artist,
      status: payload.status,
      original_lang: payload.originalLang,
      release_date: payload.releaseDate?.trim() || null,
      is_new: payload.isNew,
      genres: payload.genres,
    })
    .select()
    .single()

  if (error) {
    console.error('[mangaService] createManga error', error)
    const message = [error.message, error.details, error.hint].filter(Boolean).join(' | ')
    throw new Error(message || 'Manga olusturulamadi.')
  }

  return mapDbManga(data)
}

export async function createChapter(
  fansubId: string,
  payload: {
    mangaId: string
    chapterNumber: number
    chapterTitle?: string
    notes?: string
    pageFiles: File[]
    pageCount?: number
    publishAt?: string
    releaseDate?: string
  },
) {
  const publishAt = toIsoOrNow(payload.publishAt || payload.releaseDate)
  const normalizedNotes = payload.notes?.trim() || null
  const uploadedPages = await uploadChapterPages(
    payload.pageFiles,
    payload.mangaId,
    payload.chapterNumber,
    fansubId,
  )
  const pageUrls = uploadedPages.map((page) => page.ref)
  // Dimensions for reserving space (see lib/chapterPageDimensions): missing ones are
  // not an error, the reader then measures from the image.
  const pageDimensions = toStorableChapterPageDimensions(
    mergeChapterPageDimensionMap({}, uploadedPages),
  )

  const { data, error } = await supabase
    .from('chapters')
    .insert({
      manga_id: payload.mangaId,
      fansub_id: fansubId,
      chapter_number: payload.chapterNumber,
      title: payload.chapterTitle,
      notes: normalizedNotes,
      pages: pageUrls,
      page_dimensions: pageDimensions,
      publish_at: publishAt,
    })
    .select()
    .single()

  if (error) throw error
  return mapDbChapter(data)
}
