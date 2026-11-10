import { supabase } from '../supabase'
import { fetchAdminListComputedViewPage } from './overview'
import { findAdminUserIdsByUsername } from '../userService/adminDirectory'
import {
    adminMangaListDetailInFlight,
    cloneAdminMangaListDetail,
    mapDbCommentRow,
    mapDbItemRow,
    mapDbListRow,
    normalizeSearchValue,
    readAdminMangaListDetailCache,
    toErrorText,
    writeAdminMangaListDetailCache,
} from './shared'
import type {
    AdminMangaListDetail,
    AdminMangaListItemRow,
    AdminMangaListPageResult,
    AdminMangaListSort,
    AdminMangaListView,
    AdminMangaListVisibilityFilter,
    DbCommentRow,
    DbListItemRow,
    DbListRow,
} from './types'

export async function listAdminMangaListsPage(params: {
    page?: number
    limit?: number
    search?: string
    visibility?: AdminMangaListVisibilityFilter
    sort?: AdminMangaListSort
    view?: AdminMangaListView
} = {}): Promise<AdminMangaListPageResult> {
    const page = Number.isFinite(params.page) ? Math.max(1, Number(params.page)) : 1
    const limit = Number.isFinite(params.limit) ? Math.min(Math.max(1, Number(params.limit)), 50) : 20
    const from = (page - 1) * limit
    const to = from + limit - 1
    const visibility = params.visibility || 'all'
    const sort = params.sort || 'newest'
    const search = normalizeSearchValue(params.search)
    const view = params.view || 'all'

    // View presets apply to the SERVER query; filtering on the client would make
    // pagination and the total a lie.
    //
    // `empty` is an anti-join, `moderation` an EXISTS; PostgREST can express
    // neither, so page-scoped ids come from a server function
    // (only that page's ids go over the wire).
    const computedPage = view === 'empty' || view === 'moderation'
        ? await fetchAdminListComputedViewPage({
            view,
            search,
            visibility,
            limit,
            offset: from,
        })
        : null

    if (computedPage && computedPage.ids.length === 0) {
        return { data: [], count: computedPage.total }
    }

    let query = supabase
        .from('user_manga_lists')
        .select(
            `
            id,
            owner_id,
            title,
            description,
            is_public,
            cover_manga_id,
            items_count,
            ratings_count,
            rating_avg,
            comments_count,
            created_at,
            updated_at,
            owner:owner_id (
                id,
                username,
                avatar_url
            ),
            cover_manga:cover_manga_id (
                id,
                title,
                slug,
                cover_image_url
            )
        `,
            { count: 'exact' },
        )
    if (computedPage) {
        // Pagination was done in the server function; only those ids are fetched here.
        query = query.in('id', computedPage.ids)
    } else {
        query = query.range(from, to)
    }

    if (view === 'without-cover') query = query.is('cover_manga_id', null)
    if (view === 'private') query = query.eq('is_public', false)

    if (visibility === 'public') {
        query = query.eq('is_public', true)
    } else if (visibility === 'private') {
        query = query.eq('is_public', false)
    }

    if (search.length > 0) {
        const ownerIds = await findAdminUserIdsByUsername(search, 40)

        if (ownerIds.length > 0) {
            query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%,owner_id.in.(${ownerIds.join(',')})`)
        } else {
            query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`)
        }
    }

    if (sort === 'updated') {
        query = query.order('updated_at', { ascending: false })
    } else if (sort === 'top_rated') {
        query = query
            .order('rating_avg', { ascending: false })
            .order('ratings_count', { ascending: false })
            .order('created_at', { ascending: false })
    } else if (sort === 'most_commented') {
        query = query.order('comments_count', { ascending: false }).order('created_at', { ascending: false })
    } else {
        query = query.order('created_at', { ascending: false })
    }

    const { data, error, count } = await query
    if (error) {
        console.error('[adminMangaListService] listAdminMangaListsPage error', error)
        throw new Error(toErrorText(error, 'Manga listeleri yuklenemedi.'))
    }

    const mapped = ((data || []) as DbListRow[]).map(mapDbListRow)

    if (computedPage) {
        // Sunucu sirasi korunmali: `.in()` siralamayi garanti etmiyor.
        const order = new Map(computedPage.ids.map((id, index) => [id, index]))
        mapped.sort((left, right) => (order.get(left.id) ?? 0) - (order.get(right.id) ?? 0))
        return { data: mapped, count: computedPage.total }
    }

    return {
        data: mapped,
        count: Number(count || 0),
    }
}

export async function getAdminMangaListDetail(listId: string): Promise<AdminMangaListDetail | null> {
    const normalizedListId = listId.trim()
    if (!normalizedListId) throw new Error('Liste id zorunludur.')

    const cached = readAdminMangaListDetailCache(normalizedListId)
    if (cached !== undefined) return cached

    const inFlight = adminMangaListDetailInFlight.get(normalizedListId)
    if (inFlight) return cloneAdminMangaListDetail(await inFlight)

    const request = getAdminMangaListDetailFresh(normalizedListId)
    adminMangaListDetailInFlight.set(normalizedListId, request)
    try {
        const detail = await request
        writeAdminMangaListDetailCache(normalizedListId, detail)
        return cloneAdminMangaListDetail(detail)
    } finally {
        adminMangaListDetailInFlight.delete(normalizedListId)
    }
}

export async function getAdminMangaListDetailFresh(listId: string): Promise<AdminMangaListDetail | null> {
    const normalizedListId = listId.trim()
    if (!normalizedListId) throw new Error('Liste id zorunludur.')

    const [{ data: listRow, error: listError }, { data: itemRows, error: itemError }, { data: commentRows, error: commentError }] =
        await Promise.all([
            supabase
                .from('user_manga_lists')
                .select(
                    `
                id,
                owner_id,
                title,
                description,
                is_public,
                cover_manga_id,
                items_count,
                ratings_count,
                rating_avg,
                comments_count,
                created_at,
                updated_at,
                owner:owner_id (
                    id,
                    username,
                    avatar_url
                ),
                cover_manga:cover_manga_id (
                    id,
                    title,
                    slug,
                    cover_image_url
                )
            `,
                )
                .eq('id', normalizedListId)
                .maybeSingle<DbListRow>(),
            supabase
                .from('user_manga_list_items')
                .select(
                    `
                id,
                list_id,
                manga_id,
                position,
                note,
                created_at,
                updated_at,
                manga:manga_id (
                    id,
                    title,
                    slug,
                    cover_image_url,
                    is_active,
                    is_approved
                )
            `,
                )
                .eq('list_id', normalizedListId)
                .order('position', { ascending: true }),
            supabase
                .from('user_manga_list_comments')
                .select(
                    `
                id,
                list_id,
                author_id,
                parent_id,
                body,
                is_active,
                likes_count,
                dislikes_count,
                created_at,
                updated_at,
                author:author_id (
                    id,
                    username,
                    avatar_url
                )
            `,
                )
                .eq('list_id', normalizedListId)
                .order('created_at', { ascending: false }),
        ])

    if (listError) {
        console.error('[adminMangaListService] getAdminMangaListDetail list error', listError)
        throw new Error(toErrorText(listError, 'Liste detayi yuklenemedi.'))
    }
    if (!listRow) return null

    if (itemError) {
        console.error('[adminMangaListService] getAdminMangaListDetail items error', itemError)
        throw new Error(toErrorText(itemError, 'Liste manga kayitlari yuklenemedi.'))
    }

    if (commentError) {
        console.error('[adminMangaListService] getAdminMangaListDetail comments error', commentError)
        throw new Error(toErrorText(commentError, 'Liste yorumlari yuklenemedi.'))
    }

    const summary = mapDbListRow(listRow)
    const items = ((itemRows || []) as DbListItemRow[]).map(mapDbItemRow).filter(Boolean) as AdminMangaListItemRow[]
    const comments = ((commentRows || []) as DbCommentRow[]).map(mapDbCommentRow)

    return {
        ...summary,
        items,
        comments,
    }
}
