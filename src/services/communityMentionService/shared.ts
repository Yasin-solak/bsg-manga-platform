import { withAbortSignal, withServiceTimeout } from '../apiResilience'
import { supabase } from '../supabase'
import { isAbortError } from '../supabaseError'
import type { CommunityInlineMeta, RelatedFansub, RelatedManga, RelatedUser } from './types'

export const MAX_TAG_COUNT = 8
export const MAX_RELATED_FANSUB_COUNT = 5
export const MAX_MENTIONED_MANGA_COUNT = 10
export const MAX_MENTIONED_USER_COUNT = 20
export const MAX_HANDLE_COUNT = 20
export const MAX_MENTION_HANDLE_LENGTH = 80
export const MAX_CHAPTER_NUMBER = 5000

const INLINE_MENTION_REGEX = new RegExp(
    `(^|[\\s([\\{\\n])@([a-zA-Z0-9_-]{2,${MAX_MENTION_HANDLE_LENGTH}})`,
    'g',
)
const HANDLE_VALIDATION_REGEX = new RegExp(
    `^[a-z0-9_][a-z0-9_-]{1,${MAX_MENTION_HANDLE_LENGTH - 1}}$`,
)

export function uniq<T>(items: T[], key: (item: T) => string) {
    const map = new Map<string, T>()
    items.forEach((item) => {
        const itemKey = key(item)
        if (!itemKey || map.has(itemKey)) return
        map.set(itemKey, item)
    })
    return Array.from(map.values())
}

export function sanitizeLikeQuery(input: string) {
    return input
        .replace(/[\\%_,()]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, MAX_MENTION_HANDLE_LENGTH)
}

export function normalizeCommunityTag(raw: string) {
    const normalized = raw.trim().toLocaleLowerCase('tr-TR').replace(/[^a-z0-9_-]/g, '')

    if (normalized.length < 2 || normalized.length > 30) return ''
    return normalized
}

export function normalizeCommunityMentionHandle(raw: string) {
    const normalized = raw.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '')

    if (!HANDLE_VALIDATION_REGEX.test(normalized)) return ''
    return normalized
}

export function extractMangaSlugFromChapterHandle(rawHandle: string) {
    const match = /^(.+)-([1-9][0-9]{0,3})$/.exec(rawHandle)
    if (!match) return ''

    const chapterNumber = Number.parseInt(match[2], 10)
    if (!Number.isInteger(chapterNumber) || chapterNumber < 1 || chapterNumber > MAX_CHAPTER_NUMBER) {
        return ''
    }

    return normalizeCommunityMentionHandle(match[1] || '')
}

export function extractInlineCommunityMeta(text: string): CommunityInlineMeta {
    const tags: string[] = []
    const handles: string[] = []

    const tagRegex = /(^|[\s([{\n])#([^\s#@]{2,30})/g
    const mentionRegex = new RegExp(INLINE_MENTION_REGEX.source, INLINE_MENTION_REGEX.flags)

    let match: RegExpExecArray | null = null

    while ((match = tagRegex.exec(text)) !== null) {
        const tag = normalizeCommunityTag(match[2] || '')
        if (!tag || tags.includes(tag)) continue
        tags.push(tag)
        if (tags.length >= MAX_TAG_COUNT) break
    }

    while ((match = mentionRegex.exec(text)) !== null) {
        const handle = normalizeCommunityMentionHandle(match[2] || '')
        if (!handle || handles.includes(handle)) continue
        handles.push(handle)
        if (handles.length >= MAX_HANDLE_COUNT) break
    }

    return { tags, mentionHandles: handles }
}

export function mergeCommunityTags(...lists: Array<string[] | undefined>) {
    const merged = lists
        .flatMap((list) => list || [])
        .map((tag) => normalizeCommunityTag(tag))
        .filter(Boolean)
    return uniq(merged, (tag) => tag).slice(0, MAX_TAG_COUNT)
}

export function mergeCommunityRelatedFansubs(...lists: Array<RelatedFansub[] | undefined>) {
    const merged = lists.flatMap((list) => list || [])
    return uniq(merged, (item) => item.id).slice(0, MAX_RELATED_FANSUB_COUNT)
}

export function mergeCommunityRelatedMangas(...lists: Array<RelatedManga[] | undefined>) {
    const merged = lists.flatMap((list) => list || [])
    return uniq(merged, (item) => item.id).slice(0, MAX_MENTIONED_MANGA_COUNT)
}

export function mergeCommunityRelatedUsers(...lists: Array<RelatedUser[] | undefined>) {
    const merged = lists.flatMap((list) => list || [])
    return uniq(merged, (item) => item.id).slice(0, MAX_MENTIONED_USER_COUNT)
}

export async function loadMentionUserStats(userIds: string[], signal?: AbortSignal) {
    const statsMap = new Map<string, { followerCount: number }>()
    const uniqueUserIds = uniq(
        userIds.filter(Boolean),
        (id) => id,
    )
    if (uniqueUserIds.length === 0) return statsMap

    const [followRowsRes] = await Promise.all([
        withServiceTimeout(
            (requestSignal) => withAbortSignal(
                supabase.from('user_follows').select('following_id').in('following_id', uniqueUserIds),
                requestSignal,
            ),
            { label: 'communityMentionService.loadMentionUserStats.follows', signal },
        ),
    ])

    if (followRowsRes.error) {
        if (isAbortError(followRowsRes.error)) throw followRowsRes.error
        console.error('[communityMentionService] loadMentionUserStats follows error', followRowsRes.error)
    }

    uniqueUserIds.forEach((userId) => {
        statsMap.set(userId, { followerCount: 0 })
    })

    ;(followRowsRes.data || []).forEach((row) => {
        const userId = row.following_id
        if (!userId || !statsMap.has(userId)) return
        const prev = statsMap.get(userId)!
        statsMap.set(userId, { ...prev, followerCount: prev.followerCount + 1 })
    })

    return statsMap
}
