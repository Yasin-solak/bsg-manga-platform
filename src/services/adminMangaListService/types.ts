export type AdminMangaListVisibilityFilter = 'all' | 'public' | 'private'
export type AdminMangaListSort = 'newest' | 'updated' | 'top_rated' | 'most_commented'

export interface AdminMangaListSummary {
    id: string
    ownerId: string
    ownerUsername: string
    ownerAvatarUrl: string
    title: string
    description: string
    isPublic: boolean
    coverMangaId: string | null
    coverMangaTitle: string | null
    coverMangaSlug: string | null
    coverImageUrl: string | null
    itemsCount: number
    ratingsCount: number
    ratingAvg: number
    commentsCount: number
    createdAt: string
    updatedAt: string
}

export interface AdminMangaListItemRow {
    id: string
    listId: string
    mangaId: string
    position: number
    note: string | null
    createdAt: string
    updatedAt: string
    mangaTitle: string
    mangaSlug: string | null
    mangaCoverImageUrl: string | null
    mangaIsActive: boolean
    mangaIsApproved: boolean
}

export interface AdminMangaListCommentRow {
    id: string
    listId: string
    authorId: string
    authorUsername: string
    authorAvatarUrl: string
    parentId: string | null
    body: string
    isActive: boolean
    likesCount: number
    dislikesCount: number
    createdAt: string
    updatedAt: string
}

export interface AdminMangaListDetail extends AdminMangaListSummary {
    items: AdminMangaListItemRow[]
    comments: AdminMangaListCommentRow[]
}

export interface AdminMangaListPageResult {
    data: AdminMangaListSummary[]
    count: number
}

export interface DbUserMiniRow {
    id: string
    username: string | null
    avatar_url: string | null
}

export interface DbMangaMiniRow {
    id: string
    title: string | null
    slug: string | null
    cover_image_url: string | null
    is_active?: boolean | null
    is_approved?: boolean | null
}

export interface DbListRow {
    id: string
    owner_id: string
    title: string
    description: string | null
    is_public: boolean
    cover_manga_id: string | null
    items_count: number | null
    ratings_count: number | null
    rating_avg: number | null
    comments_count: number | null
    created_at: string
    updated_at: string
    owner?: DbUserMiniRow | DbUserMiniRow[] | null
    cover_manga?: DbMangaMiniRow | DbMangaMiniRow[] | null
}

export interface DbListItemRow {
    id: string
    list_id: string
    manga_id: string
    position: number
    note: string | null
    created_at: string
    updated_at: string
    manga?: DbMangaMiniRow | DbMangaMiniRow[] | null
}

export interface DbCommentRow {
    id: string
    list_id: string
    author_id: string
    parent_id: string | null
    body: string
    is_active: boolean
    likes_count: number | null
    dislikes_count: number | null
    created_at: string
    updated_at: string
    author?: DbUserMiniRow | DbUserMiniRow[] | null
}

/**
 * List management view presets.
 *
 * These are not extra filters but shortcuts to the admin's real work queues. `empty` and
 * `moderation` cannot be expressed in PostgREST, so they go to a server function
 * (anti-join / EXISTS); the others are plain column conditions.
 */
export type AdminMangaListView = 'all' | 'empty' | 'without-cover' | 'private' | 'moderation'

/** Views that need a server function. */
export type AdminMangaListComputedView = 'empty' | 'moderation'

/**
 * List management summary. Calculated from ALL data, not the visible page, without
 * trusting denormalized counters.
 */
export interface AdminListControlOverview {
    generatedAt: string
    total: number
    publicLists: number
    privateLists: number
    /** A list with no items: a dead end for visitors. */
    emptyLists: number
    withoutCover: number
    owners: number
    itemsTotal: number
    commentsTotal: number
    commentsInactive: number
    commentsSpoiler: number
    /** A list with at least one hidden comment: a moderation trace. */
    listsWithInactiveComments: number
    ratingsTotal: number
    ratingAverage: number | null
    /** Number of lists whose denormalized counter disagrees with real data. */
    counterDrift: number
    newListsCurrent: number
    newListsPrevious: number
    newListsDelta: number
    newListsDeltaPercent: number | null
}
