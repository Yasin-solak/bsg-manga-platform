import type { FrameType } from '@components/common/AvatarFrame'
import { buildCoverPlaceholder } from '@/lib/coverPlaceholder'
import { isVideoAssetUrl, resolveStoreAssetUrl } from '@/services/assetUrlService'
import type { FansubChapterPreview } from './types'
import { getActiveLocale, txa } from '@/i18n/activeLocale'

export type FansubChapterRow = {
  id: string
  chapter_number: number
  title?: string | null
  manga_id: string
  is_approved?: boolean | null
  publish_at?: string | null
  created_at: string
  mangas?: {
    id: string
    title: string
    slug?: string | null
    cover_image_url?: string | null
  } | Array<{
    id: string
    title: string
    slug?: string | null
    cover_image_url?: string | null
  }> | null
}

export const FRAME_TYPES = new Set<FrameType>([
  'christmas',
  'halloween',
  'avatarframe1',
  'avatarframe2',
  'avatarframe3',
  'avatarframe4',
  'fire',
  'ice',
  'neon',
  'gold',
  'rainbow',
  'default',
])

const BACKGROUND_PRESETS: Record<string, string> = {
  space: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 50%, #16213e 100%)',
  city: 'linear-gradient(135deg, #1e3c72 0%, #2a5298 50%, #7e8ba3 100%)',
  nature: 'linear-gradient(135deg, #134e5e 0%, #71b280 50%, #a8e6cf 100%)',
  ocean: 'linear-gradient(135deg, #1e3c72 0%, #2a5298 50%, #4facfe 100%)',
  sunset: 'linear-gradient(135deg, #f093fb 0%, #f5576c 50%, #4facfe 100%)',
  neon: 'linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%)',
}

export const DONATION_CONFIRMATION_TEXT = 'ONAYLIYORUM'

/** The word the user types varies by language; ONAYLIYORUM always goes to the server. */
export const donationConfirmationWord = () => (getActiveLocale() === 'en' ? 'CONFIRM' : DONATION_CONFIRMATION_TEXT)

export function toFrameType(value?: string | null): FrameType | null {
  if (!value) return null
  const normalized = value.trim().toLowerCase() as FrameType
  return FRAME_TYPES.has(normalized) ? normalized : null
}

export function resolveBackgroundPreview(value?: string | null): { style: string; videoUrl?: string } {
  if (!value) return { style: '#1f1f1f' }
  const normalized = value.trim()
  if (!normalized) return { style: '#1f1f1f' }
  const resolved = resolveStoreAssetUrl(normalized) || normalized
  if (isVideoAssetUrl(resolved)) {
    return {
      style: 'linear-gradient(135deg, #111827 0%, #1f2937 50%, #374151 100%)',
      videoUrl: resolved,
    }
  }
  if (/^(https?:|data:|blob:|\/)/i.test(resolved)) {
    return { style: `center / cover no-repeat url("${resolved}")` }
  }
  const preset = BACKGROUND_PRESETS[resolved.toLowerCase()]
  return { style: preset || resolved || '#1f1f1f' }
}

export function isFansubNotFoundError(error: unknown) {
  if (!error || typeof error !== 'object') return false
  const typed = error as { message?: string; code?: string; details?: string }
  const msg = (typed.message || '').toLowerCase()
  const det = (typed.details || '').toLowerCase()
  return typed.code === 'PGRST116'
    || msg.includes('fansub_not_found')
    || msg.includes('no rows')
    || msg.includes('not found')
    || det.includes('0 rows')
}

function chapterSortValue(chapter: FansubChapterRow | FansubChapterPreview) {
  const rowChapter = chapter as Partial<FansubChapterRow>
  const previewChapter = chapter as Partial<FansubChapterPreview>
  const publishedAt = rowChapter.publish_at ?? previewChapter.publishAt
  const createdAt = rowChapter.created_at ?? previewChapter.createdAt
  const comparableValue = publishedAt || createdAt
  if (!comparableValue) return 0
  return new Date(comparableValue).getTime()
}

export function buildChapterPreviews(chapters: FansubChapterRow[]): FansubChapterPreview[] {
  return [...chapters]
    .sort((a, b) => chapterSortValue(b) - chapterSortValue(a))
    .map((chapter) => {
      const relatedManga = Array.isArray(chapter.mangas) ? chapter.mangas[0] : chapter.mangas
      return {
        chapterId: chapter.id,
        chapterNumber: chapter.chapter_number,
        coverImage: relatedManga?.cover_image_url || buildCoverPlaceholder(relatedManga?.title || txa('Manga')),
        createdAt: chapter.created_at,
        isPending: chapter.is_approved === false,
        mangaId: chapter.manga_id,
        mangaSlug: relatedManga?.slug || undefined,
        mangaTitle: relatedManga?.title || txa('Bilinmeyen manga'),
        publishAt: chapter.publish_at,
        title: chapter.title,
      }
    })
}

export function normalizeDonationConfirmationInput(value: string) {
  return value.trim().replace(/\s+/g, ' ')
}

export function isDonationConfirmationInputValid(inputValue: string) {
  const normalizedInput = normalizeDonationConfirmationInput(inputValue)
  return normalizedInput === donationConfirmationWord()
}
