import type {
  AdminMangaChapterStats,
  AdminMangaControlDetail,
  SiteSettings,
} from './types'
import { DEFAULT_EXPLORE_COLLECTIONS } from '../exploreConfigService'
import { DEFAULT_MANGA_LIST_CREATE_COVER_IMAGES } from '../mangaListPageConfigService'

export const DEFAULT_SETTINGS: SiteSettings = {
  siteTitle: 'BSG Manga',
  siteDescription: 'Turkiyenin en iyi manga okuma platformu.',
  contactEmail: 'iletisim@bsgmanga.com',
  maintenanceMode: false,
  registrationEnabled: true,
  discordInviteUrl: 'https://discord.gg/example',
  logoUrl: '',
  homepageFeaturedMangaIds: [],
  exploreEditorMangaIds: [],
  exploreCollections: DEFAULT_EXPLORE_COLLECTIONS,
  mangaListCreateCoverImages: DEFAULT_MANGA_LIST_CREATE_COVER_IMAGES,
}

export const DEFAULT_LIST_LIMIT = 20
export const MAX_LIST_LIMIT = 60

export const EMPTY_CHAPTER_STATS: AdminMangaChapterStats = {
  total: 0,
  approved: 0,
  pending: 0,
  active: 0,
}

export const ADMIN_MANGA_CONTROL_DETAIL_CACHE_TTL_MS = 45_000
export const adminMangaControlDetailCache = new Map<string, { value: AdminMangaControlDetail; expiresAt: number }>()
export const adminMangaControlDetailInFlight = new Map<string, Promise<AdminMangaControlDetail>>()
