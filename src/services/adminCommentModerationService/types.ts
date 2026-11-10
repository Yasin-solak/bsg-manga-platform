import type { FansubIdentityTagPresentation } from '@/lib/fansubIdentityTags'

export type AdminCommentModerationSource = 'manga' | 'chapter' | 'list'

/** Desk tab: one source or "All" across sources. */
export type AdminCommentModerationSourceFilter = 'all' | AdminCommentModerationSource

export type AdminCommentModerationStatusFilter = 'all' | 'active' | 'removed'

export type AdminCommentModerationSignalFilter =
  | 'flagged'
  | 'all'
  | 'links'
  | 'spoiler'
  | 'spam'
  | 'abuse'

export type AdminCommentSignal = Exclude<AdminCommentModerationSignalFilter, 'all' | 'flagged'>

export interface AdminCommentModerationItem {
  id: string
  source: AdminCommentModerationSource
  entityId: string
  /** Bolum / manga yorumunda serinin kimligi (bilgi karti). */
  mangaId?: string | null
  routeHint: string
  contextTitle: string
  contextSubtitle: string
  authorUserId: string
  authorUsername: string
  authorAvatarUrl: string | null
  activeFansubIdentityTag?: FansubIdentityTagPresentation | null
  parentId: string | null
  body: string
  isSpoiler: boolean
  isActive: boolean
  isPinned: boolean
  likesCount: number
  dislikesCount: number
  createdAt: string
  updatedAt: string
  /** Signals the server calculates from comment text only. */
  signals?: AdminCommentSignal[]
  /** Dogrudan yanit sayisi (kaldirilinca yanitlar da gizlenir). */
  replyCount?: number
  /** The author's removed comment count across all sources. */
  authorRemovedCount?: number
}

export interface AdminCommentModerationListQuery {
  source: AdminCommentModerationSourceFilter
  status: AdminCommentModerationStatusFilter
  signal: AdminCommentModerationSignalFilter
  search?: string
  limit?: number
  offset?: number
}

export interface AdminCommentModerationList {
  rows: AdminCommentModerationItem[]
  /** Real total matching the filter (pagination). */
  total: number
  /** Ayni filtrede kaynak basina sonuc (sekme sayilari). */
  sources: Record<AdminCommentModerationSourceFilter, number>
  /** Status counts for the selected source + search (strip). */
  counts: { active: number, removed: number, flagged: number }
}
