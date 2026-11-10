import {
  DEFAULT_MANGA_LIST_CATEGORY_ID,
  LIST_DESCRIPTION_MAX_LENGTH,
  LIST_TITLE_MAX_LENGTH,
  LIST_TITLE_MIN_LENGTH,
  MANGA_LIST_CATEGORY_IDS,
  MANGA_LIST_ITEM_NOTE_MAX_LENGTH,
  MANGA_LIST_MIN_ITEM_COUNT,
} from './shared.constants'

export function normalizeMangaListCategoryId(value?: string | null) {
  const normalized = (value || DEFAULT_MANGA_LIST_CATEGORY_ID).trim().toLowerCase()
  return (MANGA_LIST_CATEGORY_IDS as readonly string[]).includes(normalized)
    ? normalized
    : DEFAULT_MANGA_LIST_CATEGORY_ID
}

export function normalizeMangaListPayload(payload: {
  title: string
  description?: string
  categoryId?: string
  mangaIds: string[]
  itemNotes?: Record<string, string>
}) {
  const normalizedTitle = payload.title.trim()
  if (normalizedTitle.length < LIST_TITLE_MIN_LENGTH || normalizedTitle.length > LIST_TITLE_MAX_LENGTH) {
    throw new Error(`Liste basligi ${LIST_TITLE_MIN_LENGTH}-${LIST_TITLE_MAX_LENGTH} karakter arasinda olmalidir.`)
  }

  const normalizedDescription = (payload.description || '').trim()
  if (normalizedDescription.length > LIST_DESCRIPTION_MAX_LENGTH) {
    throw new Error(`Aciklama en fazla ${LIST_DESCRIPTION_MAX_LENGTH} karakter olabilir.`)
  }

  const normalizedIds = Array.from(new Set((payload.mangaIds || []).map((id) => id.trim()).filter(Boolean)))
  if (normalizedIds.length < MANGA_LIST_MIN_ITEM_COUNT) {
    throw new Error(`Liste olusturmak icin en az ${MANGA_LIST_MIN_ITEM_COUNT} manga secmelisiniz.`)
  }

  const noteByMangaId = payload.itemNotes || {}
  const normalizedNotes = normalizedIds.reduce<Record<string, string>>((acc, mangaId) => {
    const note = (noteByMangaId[mangaId] || '').trim()
    if (note.length > MANGA_LIST_ITEM_NOTE_MAX_LENGTH) {
      throw new Error(`Neden listede notu en fazla ${MANGA_LIST_ITEM_NOTE_MAX_LENGTH} karakter olabilir.`)
    }
    if (note.length > 0) acc[mangaId] = note
    return acc
  }, {})

  return {
    normalizedTitle,
    normalizedDescription: normalizedDescription.slice(0, LIST_DESCRIPTION_MAX_LENGTH),
    normalizedCategoryId: normalizeMangaListCategoryId(payload.categoryId),
    normalizedIds,
    normalizedNotes,
  }
}
