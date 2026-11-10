import { withAbortSignal, withServiceTimeout } from '../apiResilience'
import { createScopedLogger } from '../logger'
import { createRequestContext, toRequestContextLogContext } from '../requestContext'
import { supabase } from '../supabase'
import {
    LIST_DESCRIPTION_MAX_LENGTH,
    LIST_TITLE_MAX_LENGTH,
    LIST_TITLE_MIN_LENGTH,
    invalidateAdminMangaListDetailCache,
    toErrorText,
} from './shared'

const adminMangaListMutationsLogger = createScopedLogger('adminMangaListService/mutations')

export async function updateAdminMangaList(input: {
    listId: string
    title: string
    description: string
    isPublic: boolean
}) {
    const requestContext = createRequestContext('adminMangaListService/mutations', 'updateAdminMangaList', {
        listId: input.listId,
    })
    const normalizedTitle = input.title.trim()
    if (normalizedTitle.length < LIST_TITLE_MIN_LENGTH || normalizedTitle.length > LIST_TITLE_MAX_LENGTH) {
        throw new Error(`Liste basligi ${LIST_TITLE_MIN_LENGTH}-${LIST_TITLE_MAX_LENGTH} karakter arasinda olmalidir.`)
    }

    const normalizedDescription = input.description.trim()
    if (normalizedDescription.length > LIST_DESCRIPTION_MAX_LENGTH) {
        throw new Error(`Aciklama en fazla ${LIST_DESCRIPTION_MAX_LENGTH} karakter olabilir.`)
    }

    const { error } = await withServiceTimeout(
        (signal) => withAbortSignal(
            supabase
                .from('user_manga_lists')
                .update({
                    title: normalizedTitle,
                    description: normalizedDescription.slice(0, LIST_DESCRIPTION_MAX_LENGTH),
                    is_public: input.isPublic,
                })
                .eq('id', input.listId),
            signal,
        ),
        { label: 'adminMangaListService.updateAdminMangaList' },
    )

    if (error) {
        adminMangaListMutationsLogger.error({
            event: requestContext.event,
            message: toErrorText(error, 'Liste guncellenemedi.'),
            context: toRequestContextLogContext(requestContext),
            error,
        })
        throw new Error(toErrorText(error, 'Liste guncellenemedi.'))
    }

    invalidateAdminMangaListDetailCache(input.listId)
}

export async function setAdminMangaListVisibility(listId: string, isPublic: boolean) {
    const requestContext = createRequestContext('adminMangaListService/mutations', 'setAdminMangaListVisibility', {
        listId,
        isPublic,
    })
    const { error } = await withServiceTimeout(
        (signal) => withAbortSignal(
            supabase.from('user_manga_lists').update({ is_public: isPublic }).eq('id', listId),
            signal,
        ),
        { label: 'adminMangaListService.setAdminMangaListVisibility' },
    )

    if (error) {
        adminMangaListMutationsLogger.error({
            event: requestContext.event,
            message: toErrorText(error, 'Liste gorunurlugu guncellenemedi.'),
            context: toRequestContextLogContext(requestContext),
            error,
        })
        throw new Error(toErrorText(error, 'Liste gorunurlugu guncellenemedi.'))
    }

    invalidateAdminMangaListDetailCache(listId)
}

export async function deleteAdminMangaList(listId: string) {
    const requestContext = createRequestContext('adminMangaListService/mutations', 'deleteAdminMangaList', {
        listId,
    })
    const { error } = await withServiceTimeout(
        (signal) => withAbortSignal(
            supabase.from('user_manga_lists').delete().eq('id', listId),
            signal,
        ),
        { label: 'adminMangaListService.deleteAdminMangaList' },
    )

    if (error) {
        adminMangaListMutationsLogger.error({
            event: requestContext.event,
            message: toErrorText(error, 'Liste silinemedi.'),
            context: toRequestContextLogContext(requestContext),
            error,
        })
        throw new Error(toErrorText(error, 'Liste silinemedi.'))
    }

    invalidateAdminMangaListDetailCache(listId)
}

export async function setAdminMangaListCommentActive(commentId: string, isActive: boolean) {
    const requestContext = createRequestContext('adminMangaListService/mutations', 'setAdminMangaListCommentActive', {
        commentId,
        isActive,
    })
    const { error } = await withServiceTimeout(
        (signal) => withAbortSignal(
            supabase
                .from('user_manga_list_comments')
                .update({ is_active: isActive })
                .eq('id', commentId),
            signal,
        ),
        { label: 'adminMangaListService.setAdminMangaListCommentActive' },
    )

    if (error) {
        adminMangaListMutationsLogger.error({
            event: requestContext.event,
            message: toErrorText(error, 'Yorum durumu guncellenemedi.'),
            context: toRequestContextLogContext(requestContext),
            error,
        })
        throw new Error(toErrorText(error, 'Yorum durumu guncellenemedi.'))
    }
}

export async function deleteAdminMangaListComment(commentId: string) {
    const requestContext = createRequestContext('adminMangaListService/mutations', 'deleteAdminMangaListComment', {
        commentId,
    })
    const { error } = await withServiceTimeout(
        (signal) => withAbortSignal(
            supabase.from('user_manga_list_comments').delete().eq('id', commentId),
            signal,
        ),
        { label: 'adminMangaListService.deleteAdminMangaListComment' },
    )

    if (error) {
        adminMangaListMutationsLogger.error({
            event: requestContext.event,
            message: toErrorText(error, 'Yorum silinemedi.'),
            context: toRequestContextLogContext(requestContext),
            error,
        })
        throw new Error(toErrorText(error, 'Yorum silinemedi.'))
    }
}
