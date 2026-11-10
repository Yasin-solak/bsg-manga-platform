import type { Comment, RelatedFansub, RelatedManga, RelatedUser } from '@types'
import { resolveCommunityMentionHandles } from './communityMentionService'

const COMMENT_MENTION_REGEX = /(^|[\s([{\n])@([a-zA-Z0-9_-]{2,80})/g

export interface ResolvedCommentMentionContext {
  mentionedUsers: RelatedUser[]
  relatedFansubs: RelatedFansub[]
  mentionedMangas: RelatedManga[]
}

export function extractMentionHandlesFromComments(comments: Comment[]): string[] {
  const handleSet = new Set<string>()

  function walk(list: Comment[]) {
    for (const comment of list) {
      let match: RegExpExecArray | null = null
      COMMENT_MENTION_REGEX.lastIndex = 0
      while ((match = COMMENT_MENTION_REGEX.exec(comment.text)) !== null) {
        const handle = (match[2] || '').trim().toLowerCase()
        if (handle) handleSet.add(handle)
      }
      if (comment.replies?.length) walk(comment.replies)
    }
  }

  walk(comments)
  return Array.from(handleSet)
}

export async function resolveCommentMentionContext(
  comments: Comment[],
  signal?: AbortSignal,
): Promise<ResolvedCommentMentionContext> {
  const mentionHandles = extractMentionHandlesFromComments(comments)
  if (mentionHandles.length === 0) {
    return {
      mentionedUsers: [],
      relatedFansubs: [],
      mentionedMangas: [],
    }
  }

  const resolved = await resolveCommunityMentionHandles(mentionHandles, signal)
  return {
    mentionedUsers: resolved.mentionedUsers,
    relatedFansubs: resolved.relatedFansubs,
    mentionedMangas: resolved.mentionedMangas,
  }
}
