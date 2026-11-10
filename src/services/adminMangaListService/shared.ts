import type {
    AdminMangaListCommentRow,
    AdminMangaListDetail,
    AdminMangaListItemRow,
    AdminMangaListSummary,
    DbCommentRow,
    DbListItemRow,
    DbListRow,
} from './types'

export const LIST_TITLE_MIN_LENGTH = 3
export const LIST_TITLE_MAX_LENGTH = 56
export const LIST_DESCRIPTION_MAX_LENGTH = 1200
export const ADMIN_MANGA_LIST_DETAIL_CACHE_TTL_MS = 45_000

export const adminMangaListDetailCache = new Map<
    string,
    { value: AdminMangaListDetail | null; expiresAt: number }
>()
export const adminMangaListDetailInFlight = new Map<string, Promise<AdminMangaListDetail | null>>()

export function toSingle<T>(value: T | T[] | null | undefined): T | null {
    if (!value) return null
    if (Array.isArray(value)) return value[0] ?? null
    return value
}

export function toErrorText(error: unknown, fallback: string) {
    if (error instanceof Error && error.message.trim()) return error.message
    if (typeof error === 'object' && error !== null && 'message' in error) {
        const message = (error as { message?: unknown }).message
        if (typeof message === 'string' && message.trim()) return message
    }
    return fallback
}

export function mapDbListRow(row: DbListRow): AdminMangaListSummary {
    const owner = toSingle(row.owner)
    const cover = toSingle(row.cover_manga)
    return {
        id: row.id,
        ownerId: row.owner_id,
        ownerUsername: owner?.username || 'anonim',
        ownerAvatarUrl: owner?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${row.owner_id}`,
        title: row.title,
        description: row.description || '',
        isPublic: row.is_public === true,
        coverMangaId: row.cover_manga_id || null,
        coverMangaTitle: cover?.title || null,
        coverMangaSlug: cover?.slug || null,
        coverImageUrl: cover?.cover_image_url || null,
        itemsCount: Number(row.items_count || 0),
        ratingsCount: Number(row.ratings_count || 0),
        ratingAvg: Number(row.rating_avg || 0),
        commentsCount: Number(row.comments_count || 0),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    }
}

export function mapDbItemRow(row: DbListItemRow): AdminMangaListItemRow | null {
    const manga = toSingle(row.manga)
    if (!manga?.id || !manga.title) return null

    return {
        id: row.id,
        listId: row.list_id,
        mangaId: row.manga_id,
        position: Number(row.position || 0),
        note: row.note || null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        mangaTitle: manga.title,
        mangaSlug: manga.slug || null,
        mangaCoverImageUrl: manga.cover_image_url || null,
        mangaIsActive: manga.is_active === true,
        mangaIsApproved: manga.is_approved === true,
    }
}

export function mapDbCommentRow(row: DbCommentRow): AdminMangaListCommentRow {
    const author = toSingle(row.author)
    return {
        id: row.id,
        listId: row.list_id,
        authorId: row.author_id,
        authorUsername: author?.username || 'anonim',
        authorAvatarUrl: author?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${row.author_id}`,
        parentId: row.parent_id || null,
        body: row.body,
        isActive: row.is_active === true,
        likesCount: Number(row.likes_count || 0),
        dislikesCount: Number(row.dislikes_count || 0),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    }
}

export function normalizeSearchValue(value?: string) {
    if (!value) return ''
    return value.trim().replace(/[\\%_,()]/g, ' ').replace(/\s+/g, ' ').slice(0, 64)
}

export function cloneAdminMangaListDetail(detail: AdminMangaListDetail | null): AdminMangaListDetail | null {
    if (!detail) return null
    return {
        ...detail,
        items: detail.items.map((item) => ({ ...item })),
        comments: detail.comments.map((comment) => ({ ...comment })),
    }
}

export function readAdminMangaListDetailCache(listId: string): AdminMangaListDetail | null | undefined {
    const cached = adminMangaListDetailCache.get(listId)
    if (!cached) return undefined
    if (cached.expiresAt <= Date.now()) {
        adminMangaListDetailCache.delete(listId)
        return undefined
    }
    return cloneAdminMangaListDetail(cached.value)
}

export function writeAdminMangaListDetailCache(listId: string, detail: AdminMangaListDetail | null) {
    adminMangaListDetailCache.set(listId, {
        value: cloneAdminMangaListDetail(detail),
        expiresAt: Date.now() + ADMIN_MANGA_LIST_DETAIL_CACHE_TTL_MS,
    })
}

export function invalidateAdminMangaListDetailCache(listId?: string) {
    if (!listId) {
        adminMangaListDetailCache.clear()
        adminMangaListDetailInFlight.clear()
        return
    }

    const normalizedListId = listId.trim()
    if (!normalizedListId) return
    adminMangaListDetailCache.delete(normalizedListId)
    adminMangaListDetailInFlight.delete(normalizedListId)
}
