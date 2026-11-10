import {
    buildCommentAuthorCosmeticMapFromRows,
    buildFansubCosmeticMap,
} from '../communityCosmeticService'
import { loadFansubLiteBySlugs } from '../fansubLiteDirectory'
import { loadMangaLiteBySlugs } from '../mangaLiteDirectory'
import { loadPublicUserDirectoryLiteByUsernames } from '../publicUserDirectoryLite'
import {
    MAX_HANDLE_COUNT,
    extractMangaSlugFromChapterHandle,
    loadMentionUserStats,
    mergeCommunityRelatedFansubs,
    mergeCommunityRelatedMangas,
    mergeCommunityRelatedUsers,
    normalizeCommunityMentionHandle,
    uniq,
} from './shared'
import type {
    MentionFansubRow,
    MentionMangaRow,
    MentionUserRow,
    RelatedFansub,
    RelatedManga,
    RelatedUser,
} from './types'

export async function resolveCommunityMentionHandles(handles: string[], signal?: AbortSignal): Promise<{
    relatedFansubs: RelatedFansub[]
    mentionedMangas: RelatedManga[]
    mentionedUsers: RelatedUser[]
}> {
    const normalizedHandles = uniq(
        handles.map((handle) => normalizeCommunityMentionHandle(handle)).filter(Boolean),
        (handle) => handle,
    ).slice(0, MAX_HANDLE_COUNT)

    if (normalizedHandles.length === 0) {
        return { relatedFansubs: [], mentionedMangas: [], mentionedUsers: [] }
    }

    const [usersMap, fansubsRes, mangasRes] = await Promise.all([
        loadPublicUserDirectoryLiteByUsernames(normalizedHandles, signal),
        loadFansubLiteBySlugs(normalizedHandles, signal),
        loadMangaLiteBySlugs(normalizedHandles, signal),
    ])

    const resolvedUserRows = Array.from(usersMap.values()) as MentionUserRow[]
    const resolvedFansubRows = Array.from(fansubsRes.values()) as MentionFansubRow[]
    const exactMentionedMangaRows = Array.from(mangasRes.values()) as MentionMangaRow[]

    const [userCosmeticMap, fansubCosmeticMap, mentionUserStatsMap] = await Promise.all([
        buildCommentAuthorCosmeticMapFromRows(
            resolvedUserRows.map((row) => ({
                id: row.id,
                frame_type: row.frame_type || null,
                background_type: row.background_type || null,
            })),
            signal,
        ),
        buildFansubCosmeticMap(
            resolvedFansubRows.map((row) => ({
                id: row.id,
                frame_type: row.frame_type,
                custom_background_asset_url: row.custom_background_asset_url,
                primary_color: row.primary_color,
                secondary_color: row.secondary_color,
                active_frame_id: row.active_frame_id,
                active_background_id: row.active_background_id,
                active_pattern_id: row.active_pattern_id,
            })),
            signal,
        ),
        loadMentionUserStats(resolvedUserRows.map((row) => row.id), signal),
    ])

    const mentionedUsers: RelatedUser[] = resolvedUserRows.map((row) => {
        const cosmetic = userCosmeticMap.get(row.id)
        const stats = mentionUserStatsMap.get(row.id)
        return {
            id: row.id,
            username: row.username,
            displayName: row.display_name?.trim() || row.username,
            avatar: row.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${row.username}`,
            followerCount: stats?.followerCount ?? 0,
            frameType: cosmetic?.frameType,
            primaryColor: cosmetic?.primaryColor,
            secondaryColor: cosmetic?.secondaryColor,
            profileBackgroundStyle: cosmetic?.backgroundStyle,
            profileBackgroundVideoUrl: cosmetic?.backgroundVideoUrl,
            profilePatternStyle: cosmetic?.patternStyle,
        }
    })

    const relatedFansubs: RelatedFansub[] = resolvedFansubRows.map((row) => {
        const cosmetic = fansubCosmeticMap.get(row.id)
        return {
            id: row.id,
            name: row.name,
            slug: row.slug,
            avatar: row.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${row.slug || row.id}`,
            description: row.description || undefined,
            mangaCount: Number(row.manga_count || 0),
            followerCount: Number(row.follower_count || 0),
            frameType: cosmetic?.frameType,
            primaryColor: cosmetic?.primaryColor || row.primary_color || undefined,
            secondaryColor: cosmetic?.secondaryColor || row.secondary_color || undefined,
            profileBackgroundStyle: cosmetic?.backgroundStyle,
            profileBackgroundVideoUrl: cosmetic?.backgroundVideoUrl,
            profilePatternStyle: cosmetic?.patternStyle,
        }
    })

    const mentionedMangasBySlug = new Map<string, RelatedManga>()
    exactMentionedMangaRows.forEach((row) => {
        mentionedMangasBySlug.set(row.slug, {
            id: row.id,
            title: row.title,
            slug: row.slug,
            coverImage: row.cover_image_url || undefined,
        })
    })

    const resolvedHandleSet = new Set<string>()
    resolvedUserRows.forEach((row) => {
        const normalized = normalizeCommunityMentionHandle(row.username)
        if (normalized) resolvedHandleSet.add(normalized)
    })
    resolvedFansubRows.forEach((row) => {
        const normalized = normalizeCommunityMentionHandle(row.slug)
        if (normalized) resolvedHandleSet.add(normalized)
    })
    exactMentionedMangaRows.forEach((row) => {
        const normalized = normalizeCommunityMentionHandle(row.slug)
        if (normalized) resolvedHandleSet.add(normalized)
    })

    const chapterMentionSlugs = uniq(
        normalizedHandles
            .filter((handle) => !resolvedHandleSet.has(handle))
            .map((handle) => extractMangaSlugFromChapterHandle(handle))
            .filter(Boolean),
        (slug) => slug,
    )

    if (chapterMentionSlugs.length > 0) {
        const chapterMentionMangaRows = Array.from(
            (await loadMangaLiteBySlugs(chapterMentionSlugs, signal)).values(),
        ) as MentionMangaRow[]
        chapterMentionMangaRows.forEach((row) => {
            mentionedMangasBySlug.set(row.slug, {
                id: row.id,
                title: row.title,
                slug: row.slug,
                coverImage: row.cover_image_url || undefined,
            })
        })
    }

    const mentionedMangas: RelatedManga[] = Array.from(mentionedMangasBySlug.values()).map((row) => ({
        id: row.id,
        title: row.title,
        slug: row.slug,
        coverImage: row.coverImage,
    }))

    return {
        relatedFansubs: mergeCommunityRelatedFansubs(relatedFansubs),
        mentionedMangas: mergeCommunityRelatedMangas(mentionedMangas),
        mentionedUsers: mergeCommunityRelatedUsers(mentionedUsers),
    }
}
