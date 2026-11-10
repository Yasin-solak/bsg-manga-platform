import { listPendingFansubRequests } from '@/services/fansubService'
import { listPendingContent } from '@/services/mangaService'
import type { Report, ReportStatus } from '@/services/reportService'
import type { PendingItem } from '@components/admin/AdminPendingSection'
import { intlLocale, txa } from '@/i18n/activeLocale'

export type AdminSection =
  | 'support'
  | 'diagnostics'
  | 'dashboard'
  | 'boost'
  | 'supporter_assets'
  | 'pending'
  | 'community'
  | 'comments'
  | 'legal_requests'
  | 'reports'
  | 'announcements'
  | 'users'
  | 'mangas'
  | 'lists'
  | 'series_requests'
  | 'translation_studio'
  | 'store'
  | 'coin_codes'
  | 'rewards'
  | 'games'
  | 'text_translations'
  | 'fansubs'
  | 'operations'
  | 'settings'

export const DEFAULT_ANNOUNCEMENT_FORM = {
  title: '',
  body: '',
  primaryColor: '#FFD600',
  secondaryColor: '#C62828',
  get announcementCategory() { return txa('Genel') },
  announcementTextColor: '#FFF8E1',
  announcementTextAnimation: 'marquee' as 'marquee' | 'pulse' | 'blink' | 'slide' | 'none',
  announcementActionLabel: '',
  announcementActionUrl: '',
}

export function textOrDash(value: unknown) {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : txa('Belirtilmedi')
  }
  if (typeof value === 'number') return String(value)
  if (typeof value === 'boolean') return value ? txa('Evet') : txa('Hayır')
  return txa('Belirtilmedi')
}

export function arrayOrDash(values?: string[]) {
  if (!values || values.length === 0) return txa('Belirtilmedi')
  return values.join(', ')
}

export function toErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) return error.message
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string' && message.trim()) return message
  }
  return fallback
}

export function communityStatusLabel(status?: string) {
  if (status === 'approved') return txa('Onayli')
  if (status === 'rejected') return txa('Reddedildi')
  return txa('Beklemede')
}

export function communityStatusBadgeVariant(status?: string): 'default' | 'destructive' | 'secondary' {
  if (status === 'approved') return 'default'
  if (status === 'rejected') return 'destructive'
  return 'secondary'
}

export function reportStatusLabel(status: ReportStatus | 'all') {
  if (status === 'resolved') return txa('Çözüldü')
  if (status === 'dismissed') return txa('Yoksayıldı')
  if (status === 'pending') return txa('Beklemede')
  return txa('Tüm durumlar')
}

export function reportStatusBadgeVariant(status: ReportStatus): 'default' | 'destructive' | 'secondary' {
  if (status === 'resolved') return 'default'
  if (status === 'dismissed') return 'destructive'
  return 'secondary'
}

export function reportTargetLabel(targetType: Report['target_type']) {
  if (targetType === 'user') return txa('Kullanıcı')
  if (targetType === 'manga_list_comment') return txa('Liste yorumu')
  if (targetType === 'manga') return txa('Manga')
  if (targetType === 'chapter') return txa('Manga bölümü')
  return txa('Manga yorumu')
}

export function formatDateTimeTr(value?: string) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString(intlLocale())
}

export function mapPendingItems(
  pendingData: Awaited<ReturnType<typeof listPendingContent>>,
  pendingFansubRequests: Awaited<ReturnType<typeof listPendingFansubRequests>>,
): PendingItem[] {
  const mangaItems: PendingItem[] = pendingData.mangas.map((manga: any) => ({
    id: manga.id,
    // Pending revision of a published series: decided with approve/reject_content_revision.
    revisionId: manga.revisionId || undefined,
    type: 'manga',
    title: manga.title,
    description: manga.description || '',
    author: manga.fansubName || txa('Bilinmiyor'),
    fansubId: manga.fansubId || undefined,
    createdAt: manga.createdAt,
    mangaDetails: {
      slug: manga.slug,
      coverImage: manga.coverImage,
      status: manga.status,
      genres: Array.isArray(manga.genres) ? manga.genres : [],
      authorName: manga.author,
      artistName: manga.artist,
      releaseDate: manga.releaseDate,
      isApproved: manga.isApproved,
      isActive: manga.isActive,
      lastChapterNumber: manga.lastChapterNumber,
      totalViews: manga.totalViews,
      followerCount: manga.followerCount,
      rating: manga.rating,
      totalRatings: manga.totalRatings,
      updatedAt: manga.updatedAt,
      changeAction: manga.changeAction,
      revisionCreatedAt: manga.revisionCreatedAt,
      revisionNote: manga.revisionNote ?? null,
      revisionBefore: manga.revisionBefore,
      revisionAfter: manga.revisionAfter,
    },
  }))

  const chapterItems: PendingItem[] = pendingData.chapters.map((chapter: any) => ({
    id: chapter.id,
    revisionId: chapter.revisionId || undefined,
    type: 'chapter',
    // In the list series first, then chapter: which chapter of which series reads at a glance.
    title: txa('{v1} · {v2}. bölüm', { v1: chapter.mangaTitle || txa('Seri'), v2: chapter.chapterNumber }),
    description: chapter.title || '',
    author: chapter.fansubName || txa('Bilinmiyor'),
    fansubId: chapter.fansubId || undefined,
    createdAt: chapter.createdAt,
    chapterDetails: {
      mangaId: chapter.mangaId,
      mangaTitle: chapter.mangaTitle,
      mangaSlug: chapter.mangaSlug,
      mangaCover: chapter.mangaCover,
      chapterNumber: chapter.chapterNumber,
      chapterTitle: chapter.title,
      pageCount: chapter.pageCount,
      publishAt: chapter.publishAt,
      isApproved: chapter.isApproved,
      isActive: chapter.isActive,
      updatedAt: chapter.updatedAt,
      changeAction: chapter.changeAction,
      revisionCreatedAt: chapter.revisionCreatedAt,
      beforeTitle: chapter.beforeTitle,
      afterTitle: chapter.afterTitle,
      beforePublishAt: chapter.beforePublishAt,
      afterPublishAt: chapter.afterPublishAt,
      beforePages: chapter.beforePages,
      afterPages: chapter.afterPages,
      addedPages: chapter.addedPages,
      removedPages: chapter.removedPages,
      reordered: chapter.reordered,
    },
  }))

  const fansubItems: PendingItem[] = pendingFansubRequests.map((request) => ({
    id: request.id,
    type: 'fansub_request',
    title: request.requestedName,
    description: request.requestedDescription,
    author: request.requester?.username || txa('Kullanıcı'),
    avatar: request.requester?.avatarUrl,
    requestedAvatar: request.requestedAvatarUrl,
    requestedSlug: request.requestedSlug,
    requestedDescription: request.requestedDescription,
    requesterUserId: request.requesterUserId,
    category: txa('Fansub Talebi'),
    createdAt: request.createdAt,
    requestMeta: request.requestMeta,
  }))

  return [...mangaItems, ...chapterItems, ...fansubItems]
}

export type AnnouncementFormState = typeof DEFAULT_ANNOUNCEMENT_FORM
