import { z } from 'zod'
import { parseFansubIdentityTag } from '@/lib/fansubIdentityTags'
import { supabase } from '../supabase'
import { listAdminUserDirectoryByIds } from '../userService/adminDirectory'
import type {
  AdminCommentModerationItem,
  AdminCommentModerationList,
  AdminCommentModerationListQuery,
  AdminCommentModerationSource,
  AdminCommentSignal,
} from './types'

const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 50
const SIGNALS = new Set<AdminCommentSignal>(['links', 'spoiler', 'spam', 'abuse'])

const rowSchema = z.object({
  id: z.string(),
  source: z.enum(['chapter', 'manga', 'list']),
  entityId: z.string().nullable().catch(''),
  mangaId: z.string().nullable().optional(),
  routeHint: z.string().catch(''),
  contextTitle: z.string().catch('Yorum bağlamı'),
  contextSubtitle: z.string().catch(''),
  authorUserId: z.string().nullable().catch(''),
  authorUsername: z.string().catch('Bilinmeyen kullanıcı'),
  authorAvatarUrl: z.string().nullable().optional(),
  activeFansubIdentityTag: z.unknown().optional(),
  parentId: z.string().nullable().optional(),
  body: z.string().catch(''),
  isSpoiler: z.boolean().catch(false),
  isActive: z.boolean().catch(true),
  isPinned: z.boolean().catch(false),
  likesCount: z.number().catch(0),
  dislikesCount: z.number().catch(0),
  createdAt: z.string().catch(''),
  updatedAt: z.string().catch(''),
  signals: z.array(z.string()).catch([]),
  replyCount: z.number().catch(0),
  authorRemovedCount: z.number().catch(0),
})

const countSchema = z.number().catch(0)
const listSchema = z.object({
  rows: z.array(z.unknown()).catch([]),
  total: countSchema,
  sources: z.object({
    all: countSchema, chapter: countSchema, manga: countSchema, list: countSchema,
  }).catch({ all: 0, chapter: 0, manga: 0, list: 0 }),
  counts: z.object({ active: countSchema, removed: countSchema, flagged: countSchema })
    .catch({ active: 0, removed: 0, flagged: 0 }),
})

function mapRow(value: unknown): AdminCommentModerationItem | null {
  const parsed = rowSchema.safeParse(value)
  if (!parsed.success) return null
  const row = parsed.data
  return {
    id: row.id,
    source: row.source as AdminCommentModerationSource,
    entityId: row.entityId ?? '',
    mangaId: row.mangaId ?? null,
    routeHint: row.routeHint,
    contextTitle: row.contextTitle,
    contextSubtitle: row.contextSubtitle,
    authorUserId: row.authorUserId ?? '',
    authorUsername: row.authorUsername,
    authorAvatarUrl: row.authorAvatarUrl ?? null,
    activeFansubIdentityTag: parseFansubIdentityTag(row.activeFansubIdentityTag),
    parentId: row.parentId ?? null,
    body: row.body,
    isSpoiler: row.isSpoiler,
    isActive: row.isActive,
    isPinned: row.isPinned,
    likesCount: row.likesCount,
    dislikesCount: row.dislikesCount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    signals: row.signals.filter((signal): signal is AdminCommentSignal => SIGNALS.has(signal as AdminCommentSignal)),
    replyCount: row.replyCount,
    authorRemovedCount: row.authorRemovedCount,
  }
}

/**
 * Comment desk page (admin_list_moderation_comments). Search and filters
 * work on all comments; the old window scanned only the last ~140 comments.
 * Names of hidden / banned authors are completed from the admin directory.
 */
export async function listAdminCommentModerationPage(query: AdminCommentModerationListQuery): Promise<AdminCommentModerationList> {
  const limit = Math.max(1, Math.min(query.limit || DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE))
  const { data, error } = await supabase.rpc('admin_list_moderation_comments', {
    p_source: query.source,
    p_status: query.status,
    p_signal: query.signal,
    p_search: query.search?.trim() || null,
    p_limit: limit,
    p_offset: Math.max(0, query.offset || 0),
  })
  if (error) throw new Error('Yorumlar yüklenemedi.')

  const payload = listSchema.parse(data ?? {})
  const rows = payload.rows.map(mapRow).filter((row): row is AdminCommentModerationItem => row !== null)
  const authorIds = Array.from(new Set(rows.map((row) => row.authorUserId).filter(Boolean)))
  const directory = new Map((await listAdminUserDirectoryByIds(authorIds).catch(() => [])).map((entry) => [entry.id, entry] as const))

  return {
    rows: rows.map((row) => {
      const author = directory.get(row.authorUserId)
      return author ? { ...row, authorUsername: author.username || row.authorUsername, authorAvatarUrl: author.avatar_url ?? row.authorAvatarUrl } : row
    }),
    total: payload.total,
    sources: payload.sources,
    counts: payload.counts,
  }
}
