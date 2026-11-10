import { sendCommentModerationNotification } from '../notificationService'
import { supabase } from '../supabase'
import { tryWriteAdminAuditLog } from '../adminService/shared.audit'
import type { AdminCommentModerationItem, AdminCommentModerationSource } from './types'

type CascadeRow = {
  id: string
  authorUserId: string
}

function tableForSource(source: AdminCommentModerationSource) {
  if (source === 'list') return 'user_manga_list_comments'
  return 'manga_comments'
}

async function loadCascadeChildren(source: AdminCommentModerationSource, rootIds: string[]) {
  const collected = new Map<string, CascadeRow>()
  let frontier = Array.from(new Set(rootIds))

  while (frontier.length > 0) {
    if (source === 'list') {
      const { data, error } = await supabase
        .from('user_manga_list_comments')
        .select('id, author_id, parent_id')
        .in('parent_id', frontier)

      if (error) throw error

      const nextFrontier: string[] = []
      for (const row of data || []) {
        if (collected.has(row.id)) continue
        collected.set(row.id, { id: row.id, authorUserId: row.author_id })
        nextFrontier.push(row.id)
      }
      frontier = nextFrontier
      continue
    }

    const { data, error } = await supabase
      .from('manga_comments')
      .select('id, user_id, parent_id')
      .in('parent_id', frontier)

    if (error) throw error

    const nextFrontier: string[] = []
    for (const row of data || []) {
      if (collected.has(row.id)) continue
      collected.set(row.id, { id: row.id, authorUserId: row.user_id })
      nextFrontier.push(row.id)
    }
    frontier = nextFrontier
  }

  return Array.from(collected.values())
}

async function expandCascadeComments(comments: AdminCommentModerationItem[]) {
  const expanded = new Map<string, AdminCommentModerationItem>()

  for (const comment of comments) {
    expanded.set(comment.id, comment)
  }

  for (const comment of comments) {
    const cascadeRows = await loadCascadeChildren(comment.source, [comment.id])
    for (const row of cascadeRows) {
      if (expanded.has(row.id)) continue
      expanded.set(row.id, {
        ...comment,
        id: row.id,
        authorUserId: row.authorUserId,
        parentId: comment.id,
      })
    }
  }

  return Array.from(expanded.values())
}

export async function setAdminModerationCommentsActive(
  comments: AdminCommentModerationItem[],
  isActive: boolean,
  reason?: string,
) {
  if (comments.length === 0) return true

  const expandedComments = await expandCascadeComments(comments)
  // The notification goes only to the selected comment. Authors of replies hidden in the chain
  // used to receive "your comment was removed" with the parent comment's reason.
  const targetIds = new Set(comments.map((comment) => comment.id))

  const grouped = expandedComments.reduce<Record<string, string[]>>((acc, comment) => {
    const table = tableForSource(comment.source)
    if (!acc[table]) acc[table] = []
    acc[table].push(comment.id)
    return acc
  }, {})

  for (const [table, ids] of Object.entries(grouped)) {
    const { error } = await supabase
      .from(table)
      .update({ is_active: isActive })
      .in('id', ids)

    if (error) {
      console.error('[adminCommentModerationService] set active error', { table, ids, error })
      throw error
    }
  }

  await Promise.allSettled(
    expandedComments.map(async (comment) => {
      await tryWriteAdminAuditLog({
        action: isActive ? 'comment.restore' : 'comment.remove',
        resourceType: 'comment',
        resourceId: comment.id,
        summary: isActive ? 'Yorum yeniden gorunur yapildi.' : targetIds.has(comment.id) ? 'Yorum moderasyon nedeniyle kaldirildi.' : 'Ust yorum kaldirildigi icin yanit gizlendi.',
        metadata: {
          source: comment.source,
          entityId: comment.entityId,
          routeHint: comment.routeHint,
          reason: reason || null,
          cascaded: expandedComments.length > 1,
        },
      })

      if (!isActive && targetIds.has(comment.id)) {
        await sendCommentModerationNotification({
          userId: comment.authorUserId,
          source: comment.source,
          routeHint: comment.routeHint,
          contextTitle: comment.contextTitle,
          reason,
        })
      }
    }),
  )

  return true
}
