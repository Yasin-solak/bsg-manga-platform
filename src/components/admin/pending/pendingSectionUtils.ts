import type { FansubRequestMeta } from '@/services/fansubService'
import { buildPublicChapterPath, buildPublicMangaPath } from '@/lib/routes'
import { intlLocale, txa } from '@/i18n/activeLocale'

export type PendingItemType = 'manga' | 'chapter' | 'fansub_request'
export type PendingPriority = 'normal' | 'high' | 'critical'

export interface PendingItemMangaDetails {
  title?: string
  slug?: string
  coverImage?: string | null
  status?: string
  genres?: string[]
  authorName?: string
  artistName?: string
  releaseDate?: string | null
  isApproved?: boolean
  isActive?: boolean
  lastChapterNumber?: number | null
  totalViews?: number
  followerCount?: number
  rating?: number | null
  totalRatings?: number
  updatedAt?: string
  changeAction?: 'create' | 'edit'
  revisionCreatedAt?: string
  /** The team's correction reason. */
  revisionNote?: string | null
  revisionBefore?: {
    title?: string
    slug?: string
    description?: string
    status?: string | null
    genres?: string[]
    coverImageUrl?: string | null
    author?: string
    artist?: string
    releaseDate?: string | null
    isMature?: boolean
  } | null
  revisionAfter?: {
    title?: string
    slug?: string
    description?: string
    status?: string | null
    genres?: string[]
    coverImageUrl?: string | null
    author?: string
    artist?: string
    releaseDate?: string | null
    isMature?: boolean
  } | null
}

export interface PendingItemChapterDetails {
  mangaId?: string
  mangaTitle?: string
  mangaSlug?: string | null
  mangaCover?: string | null
  chapterNumber?: number
  chapterTitle?: string
  pageCount?: number
  publishAt?: string | null
  isApproved?: boolean
  isActive?: boolean
  updatedAt?: string
  changeAction?: 'create' | 'edit'
  revisionCreatedAt?: string
  beforeTitle?: string
  afterTitle?: string
  beforePublishAt?: string | null
  afterPublishAt?: string | null
  beforePages?: string[]
  afterPages?: string[]
  addedPages?: string[]
  removedPages?: string[]
  reordered?: boolean
}

export interface PendingItem {
  id: string
  /**
   * Pending revision of a published (approved) series/chapter. If set, approve/reject uses
   * approve/reject_content_revision; the old version stays live until approved.
   */
  revisionId?: string
  /** Target chapter on a revision row (the row id is the revision id). */
  chapterId?: string
  type: PendingItemType
  title: string
  description?: string
  author?: string
  /** The team sending the series / chapter request (unknown on a published revision; the name is used then). */
  fansubId?: string
  avatar?: string
  category?: string
  createdAt?: string
  requestedAvatar?: string
  requestedSlug?: string
  requestedDescription?: string
  requesterUserId?: string
  requestMeta?: FansubRequestMeta
  mangaDetails?: PendingItemMangaDetails
  chapterDetails?: PendingItemChapterDetails
}

/**
 * Info card key for the requester: team for series / chapters, user for fansub
 * applications. The name if no id (no card for an unknown sender).
 */
export function pendingAuthorEntity(item: PendingItem): { kind: 'fansub' | 'user', key: string | null } {
  if (item.type === 'manga' || item.type === 'chapter') {
    return { kind: 'fansub', key: item.fansubId || (item.author && item.author !== 'Bilinmiyor' ? item.author : null) }
  }
  return { kind: 'user', key: item.requesterUserId || item.author || null }
}

export function itemTypeLabel(type: PendingItemType) {
  if (type === 'manga') return txa('Manga')
  if (type === 'chapter') return txa('Bölüm')
  return txa('Fansub başvurusu')
}

export function formatDateTimeTr(value?: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString(intlLocale(), { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function normalizeSearchText(item: PendingItem) {
  return `${item.title} ${item.description || ''} ${item.author || ''} ${item.category || ''} ${item.requestedSlug || ''}`.toLowerCase()
}

export function toTimestamp(value?: string) {
  if (!value) return 0
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 0 : date.getTime()
}

export function mangaStatusLabel(status?: string) {
  if (status === 'completed') return txa('Tamamlandı')
  if (status === 'hiatus') return txa('Ara verdi')
  if (status === 'cancelled') return txa('İptal edildi')
  return txa('Devam ediyor')
}

export function changeActionLabel(action?: 'create' | 'edit') {
  if (action === 'edit') return txa('Düzenleme')
  return txa('Yeni kayıt')
}

export function normalizeText(value?: string | null) {
  if (typeof value !== 'string') return ''
  return value.trim()
}

export function pendingPriorityLevel(item: PendingItem): PendingPriority {
  if (item.type === 'fansub_request') return 'critical'
  if (item.type === 'manga' && item.mangaDetails?.changeAction === 'edit') return 'high'
  if (item.type === 'chapter' && item.chapterDetails?.changeAction === 'edit') return 'high'
  return 'normal'
}

export function pendingPriorityScore(item: PendingItem) {
  const level = pendingPriorityLevel(item)
  if (level === 'critical') return 3
  if (level === 'high') return 2
  return 1
}

export function pendingPriorityLabel(level: PendingPriority) {
  if (level === 'critical') return txa('Yüksek öncelik')
  if (level === 'high') return txa('Orta öncelik')
  return txa('Normal öncelik')
}

export function pendingLocationLabel(item: PendingItem) {
  if (item.type === 'manga') {
    const mangaSlug = normalizeText(item.mangaDetails?.slug)
    const mangaTitle = normalizeText(item.title)
    return txa('Manga › {v1}', { v1: mangaTitle || mangaSlug || txa('Seri') })
  }

  if (item.type === 'chapter') {
    const mangaTitle = normalizeText(item.chapterDetails?.mangaTitle)
    const chapterNumber = item.chapterDetails?.chapterNumber
    if (mangaTitle && typeof chapterNumber === 'number') {
      return txa('Manga › {v1} › {v2}. bölüm', { v1: mangaTitle, v2: chapterNumber })
    }
    if (mangaTitle) return txa('Manga › {v1} › Bölüm', { v1: mangaTitle })
    return txa('Manga › Bölüm')
  }

  const requestedSlug = normalizeText(item.requestedSlug)
  if (requestedSlug) return txa('Fansub › Başvuru › {v1}', { v1: requestedSlug })
  return txa('Fansub › Başvuru')
}

export function pendingPublicUrl(item: PendingItem) {
  if (item.type === 'manga') {
    return buildPublicMangaPath({
      id: item.id,
      slug: item.mangaDetails?.slug,
      title: item.mangaDetails?.title,
    })
  }

  if (item.type === 'chapter') {
    const mangaId = normalizeText(item.chapterDetails?.mangaId)
    const mangaSlug = normalizeText(item.chapterDetails?.mangaSlug)
    const chapterNumber = item.chapterDetails?.chapterNumber
    if (mangaId && typeof chapterNumber === 'number') {
      return buildPublicChapterPath({
        mangaId,
        mangaSlug,
        chapterNumber: Math.floor(chapterNumber),
      })
    }
    if (mangaId) {
      return buildPublicMangaPath({
        id: mangaId,
        slug: mangaSlug,
        title: item.chapterDetails?.mangaTitle,
      })
    }
    return null
  }

  return null
}
