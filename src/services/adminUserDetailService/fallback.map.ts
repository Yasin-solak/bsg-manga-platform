import type { AdminUserDetail } from '../adminUserTypes'
import {
    RECENT_READ_LIMIT,
    buildFavoriteGenres,
    buildTopChapters,
    buildTopMangas,
    type DbStoreItemMiniRow,
    getRelationOne,
    listStoreItemsForOwnedRefs,
    mapInventoryList,
    parseOwnedItems,
    parseSocialLinks,
    toAvatarUrl,
    toSafeNumber,
} from './shared'
import type { AdminUserDetailFallbackPayload } from './fallback.types'

export async function mapAdminUserDetailFallback(payload: AdminUserDetailFallbackPayload): Promise<AdminUserDetail> {
    const {
        profileRow,
        readingRows,
        badgeRows,
        mangaCommentRows,
        fansubMembershipRows,
        fansubHistoryRows,
        sentInviteRows,
        joinRequestRows,
        counts,
    } = payload

    const ownedItems = parseOwnedItems(profileRow.owned_items)
    const storeRows = await listStoreItemsForOwnedRefs(ownedItems)
    const storeById = new Map<string, DbStoreItemMiniRow>()
    const storeByTypedIdentifier = new Map<string, DbStoreItemMiniRow>()
    storeRows.forEach((row) => {
        storeById.set(row.id, row)
        storeByTypedIdentifier.set(`${row.type}:${row.identifier.toLowerCase()}`, row)
    })

    return {
        profile: {
            id: profileRow.id,
            username: profileRow.username,
            displayName: profileRow.display_name?.trim() || profileRow.username,
            avatarUrl: toAvatarUrl(profileRow.username, profileRow.avatar_url),
            bio: (profileRow.bio || '').trim(),
            level: profileRow.level || 'Yeni Uye',
            socialLinks: parseSocialLinks(profileRow.social_links),
            role: profileRow.role || 'user',
            stones: toSafeNumber(profileRow.stones),
            frameType: profileRow.frame_type || 'default',
            isBanned: profileRow.is_banned === true,
            isActive: profileRow.is_active !== false,
            createdAt: profileRow.created_at,
            updatedAt: profileRow.updated_at,
        },
        stats: {
            followers: counts.followers,
            following: counts.following,
            mangaFollows: counts.mangaFollows,
            fansubFollows: counts.fansubFollows,
            readingCount: counts.readingCount,
            mangaCommentCount: counts.mangaCommentCount,
            badgeCount: counts.badgeCount,
            estimatedReadMinutes: counts.readingCount * 5,
            fansubMembershipCount: fansubMembershipRows.length,
            fansubRoleHistoryCount: fansubHistoryRows.length,
            sentInviteCount: sentInviteRows.length,
            joinRequestCount: joinRequestRows.length,
        },
        inventory: {
            frames: mapInventoryList(ownedItems.frames, 'frame', storeById, storeByTypedIdentifier),
            backgrounds: mapInventoryList(ownedItems.backgrounds, 'background', storeById, storeByTypedIdentifier),
            patterns: mapInventoryList(ownedItems.patterns, 'pattern', storeById, storeByTypedIdentifier),
            badges: mapInventoryList(ownedItems.badges, 'badge', storeById, storeByTypedIdentifier),
            premium: mapInventoryList(ownedItems.premium, 'premium', storeById, storeByTypedIdentifier),
        },
        badges: badgeRows.map((row) => {
            const badge = getRelationOne(row.badge)
            return {
                badgeId: row.badge_id,
                name: badge?.name || row.badge_id,
                imageUrl: badge?.image_url || undefined,
                isDisplayed: row.is_displayed === true,
                displayOrder: toSafeNumber(row.display_order),
                obtainedAt: row.obtained_at,
            }
        }),
        recentReads: readingRows
            .slice(0, RECENT_READ_LIMIT)
            .map((row) => {
                const manga = getRelationOne(row.manga)
                const chapter = getRelationOne(row.chapter)
                return {
                    mangaId: row.manga_id,
                    mangaTitle: manga?.title || 'Bilinmeyen Manga',
                    mangaCoverUrl: manga?.cover_image_url || undefined,
                    chapterId: row.chapter_id || undefined,
                    chapterTitle: chapter?.title || undefined,
                    chapterNumber: (chapter?.chapter_number ?? row.chapter_number) ?? undefined,
                    readAt: row.read_at,
                }
            }),
        favoriteGenres: buildFavoriteGenres(readingRows),
        favoriteGenreMethod: 'Son 200 okuma kaydinda gecen manga turleri sayilarak ilk 5 tur hesaplanir.',
        topMangas: buildTopMangas(readingRows),
        topChapters: buildTopChapters(readingRows),
        mangaComments: mangaCommentRows.map((row) => {
            const manga = getRelationOne(row.manga)
            return {
                id: row.id,
                mangaId: row.manga_id,
                mangaTitle: manga?.title || 'Bilinmeyen Manga',
                content: row.content || '',
                likes: toSafeNumber(row.likes),
                isPinned: row.is_pinned === true,
                isActive: row.is_active !== false,
                createdAt: row.created_at,
            }
        }),
        fansubMemberships: fansubMembershipRows.map((row) => {
            const fansub = getRelationOne(row.fansub)
            return {
                fansubId: row.fansub_id,
                fansubName: fansub?.name || 'Bilinmeyen Fansub',
                fansubSlug: fansub?.slug || '-',
                fansubAvatarUrl: fansub?.avatar_url || undefined,
                fansubIsActive: fansub?.is_active !== false,
                role: row.role,
                teamTag: row.team_tag || undefined,
                joinedAt: row.created_at,
            }
        }),
        fansubMembershipHistory: fansubHistoryRows.map((row) => {
            const fansub = getRelationOne(row.fansub)
            const endedBy = getRelationOne(row.ended_by_user)
            return {
                id: row.id,
                fansubId: row.fansub_id,
                fansubName: fansub?.name || 'Bilinmeyen Fansub',
                fansubSlug: fansub?.slug || '-',
                role: row.role,
                teamTag: row.team_tag || undefined,
                joinedAt: row.joined_at,
                leftAt: row.left_at || undefined,
                leftReason: row.left_reason,
                endedByUserId: row.ended_by_user_id || undefined,
                endedByUsername: endedBy?.username || undefined,
            }
        }),
        sentFansubInvites: sentInviteRows.map((row) => {
            const fansub = getRelationOne(row.fansub)
            const invitedUser = getRelationOne(row.invited_user)
            return {
                id: row.id,
                fansubId: row.fansub_id,
                fansubName: fansub?.name || 'Bilinmeyen Fansub',
                fansubSlug: fansub?.slug || '-',
                invitedUserId: row.invited_user_id,
                invitedUsername: invitedUser?.username || 'Bilinmeyen Kullanici',
                invitedUserAvatarUrl: invitedUser?.avatar_url || undefined,
                role: row.role,
                status: row.status,
                note: row.note || undefined,
                respondedAt: row.responded_at || undefined,
                isActive: row.is_active !== false,
                createdAt: row.created_at,
            }
        }),
        joinRequests: joinRequestRows.map((row) => {
            const fansub = getRelationOne(row.fansub)
            const reviewedBy = getRelationOne(row.reviewed_by_user)
            return {
                id: row.id,
                fansubId: row.fansub_id,
                fansubName: fansub?.name || 'Bilinmeyen Fansub',
                fansubSlug: fansub?.slug || '-',
                status: row.status,
                message: row.message || undefined,
                reviewNote: row.review_note || undefined,
                reviewedByUsername: reviewedBy?.username || undefined,
                reviewedAt: row.reviewed_at || undefined,
                isActive: row.is_active !== false,
                createdAt: row.created_at,
            }
        }),
    }
}
