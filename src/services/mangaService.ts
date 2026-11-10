export {
  listMangas,
  listRelatedMangasForDetail,
  getTrendingMangas,
  getLatestMangas,
  getPopularMangas,
  getPopularMangasByPeriod,
  getMangasByFansubId,
  getGenreCounts,
} from './mangaService/discovery'
export type { RelatedMangaSuggestion } from './mangaService/discovery.list'
export {
  getMangaById,
  getMangaByIdentifier,
  trackMangaRead,
  getMyMangaRating,
  submitMangaRating,
  getChaptersByMangaId,
  getChapterDetails,
} from './mangaService/details'
export {
  listPendingContent,
  approveManga,
  rejectManga,
  approveChapter,
  rejectChapter,
} from './mangaService/moderation'
export {
  createManga,
  createChapter,
} from './mangaService/creation'
export type {
  MangaFilterParams,
  SubmitMangaRatingResult,
} from './mangaService/shared'
