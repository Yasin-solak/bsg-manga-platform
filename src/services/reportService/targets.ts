import { supabase } from '../supabase'
import { getAdminReportUserTarget } from '../userService/adminDirectory'
import { buildPublicChapterPath, buildPublicMangaPath } from '@/lib/routes'
import { getE2EAdminReportContext } from '@/testing/adminReportsE2e'
import { avatarFromUserId, getUserMini, toSingle } from './shared'
import type {
    ChapterContentContextRow,
    MangaCommentContextRow,
    MangaContentContextRow,
    MangaListCommentContextRow,
    Report,
    ReportTargetContext,
    UserReportContextRow,
} from './types'
import { txa } from '@/i18n/activeLocale'

async function buildMangaCommentContext(row: MangaCommentContextRow): Promise<ReportTargetContext> {
    const owner = await getUserMini(row.user_id)
    const manga = toSingle(row.manga)
    const chapter = toSingle(row.chapter)

    const chapterNumber = Number(chapter?.chapter_number || 0)
    const hasChapter = Number.isFinite(chapterNumber) && chapterNumber > 0
    const publicUrl = hasChapter
        ? buildPublicChapterPath({
            mangaId: row.manga_id,
            mangaSlug: manga?.slug || undefined,
            mangaTitle: manga?.title || undefined,
            chapterNumber,
        })
        : buildPublicMangaPath({
            id: row.manga_id,
            slug: manga?.slug || undefined,
            title: manga?.title || undefined,
        })

    const chapterLabel = hasChapter ? txa('{v1}. bölüm', { v1: chapterNumber ?? '' }) : null
    const locationPath = chapterLabel
        ? txa('Manga › {v1} › {v2} yorumu', { v1: manga?.title || txa('Bilinmeyen manga'), v2: chapterLabel })
        : txa('Manga › {v1} › Yorum', { v1: manga?.title || txa('Bilinmeyen manga') })

    return {
        targetType: 'manga_comment',
        targetId: row.id,
        targetTitle: txa('Manga yorumu'),
        targetPreview: row.content || undefined,
        targetIsActive: row.is_active !== false,
        ownerId: row.user_id,
        ownerUsername: owner?.username || undefined,
        ownerAvatarUrl: owner?.avatar_url || avatarFromUserId(row.user_id),
        parentId: row.manga_id,
        parentTitle: manga?.title || txa('Bilinmeyen manga'),
        publicUrl,
        locationPath,
        adminSection: 'mangas',
    }
}

async function buildMangaListCommentContext(row: MangaListCommentContextRow): Promise<ReportTargetContext> {
    const owner = await getUserMini(row.author_id)
    const list = toSingle(row.list)

    return {
        targetType: 'manga_list_comment',
        targetId: row.id,
        targetTitle: txa('Manga listesi yorumu'),
        targetPreview: row.body || undefined,
        targetIsActive: row.is_active !== false,
        ownerId: row.author_id,
        ownerUsername: owner?.username || undefined,
        ownerAvatarUrl: owner?.avatar_url || avatarFromUserId(row.author_id),
        parentId: row.list_id,
        parentTitle: list?.title || txa('Basliksiz liste'),
        publicUrl: `/listeler/${row.list_id}`,
        locationPath: txa('Listeler › Liste yorumu'),
        adminSection: 'lists',
    }
}

function buildMangaContentContext(row: MangaContentContextRow): ReportTargetContext {
    const publicUrl = buildPublicMangaPath({
        id: row.id,
        slug: row.slug || undefined,
        title: row.title || undefined,
    })
    return {
        targetType: 'manga',
        targetId: row.id,
        targetTitle: row.title || txa('Adsız manga'),
        targetPreview: row.description || undefined,
        targetIsActive: row.is_active !== false,
        // The owner is a fansub, not one user; no owner is left for the ban action.
        ownerId: undefined,
        parentId: row.fansub_id || undefined,
        publicUrl,
        locationPath: txa('Manga › Seri'),
        adminSection: 'mangas',
    }
}

async function buildChapterContentContext(row: ChapterContentContextRow): Promise<ReportTargetContext> {
    const manga = toSingle(row.manga)
    const chapterNumber = Number(row.chapter_number || 0)
    const hasChapter = Number.isFinite(chapterNumber) && chapterNumber > 0
    const publicUrl = hasChapter
        ? buildPublicChapterPath({
            mangaId: row.manga_id,
            mangaSlug: manga?.slug || undefined,
            mangaTitle: manga?.title || undefined,
            chapterNumber,
        })
        : buildPublicMangaPath({ id: row.manga_id, slug: manga?.slug || undefined, title: manga?.title || undefined })

    const chapterLabel = hasChapter ? txa('{v1}. bölüm', { v1: chapterNumber ?? '' }) : txa('Bölüm')
    return {
        targetType: 'chapter',
        targetId: row.id,
        targetTitle: `${manga?.title || txa('Adsız manga')} · ${chapterLabel}`,
        targetPreview: row.title || undefined,
        targetIsActive: row.is_active !== false,
        ownerId: undefined,
        parentId: row.manga_id,
        parentTitle: manga?.title || txa('Adsız manga'),
        publicUrl,
        locationPath: txa('Manga › {v1} › {v2}', { v1: manga?.title || txa('Bilinmeyen manga'), v2: chapterLabel }),
        adminSection: 'mangas',
    }
}

function buildUserReportContext(row: UserReportContextRow): ReportTargetContext {
    const username = row.username || 'bilinmeyen-kullanici'
    return {
        targetType: 'user',
        targetId: row.id,
        targetTitle: txa('@{v1} profili', { v1: username }),
        targetPreview: row.bio || txa('Kullanıcı biyografi eklememiş.'),
        targetIsActive: row.is_active !== false && row.is_banned !== true,
        ownerId: row.id,
        ownerUsername: row.username || undefined,
        ownerAvatarUrl: row.avatar_url || avatarFromUserId(row.id),
        publicUrl: row.username ? `/profil/${encodeURIComponent(row.username)}` : undefined,
        locationPath: txa('Kullanıcı › Profil'),
        adminSection: 'users',
    }
}

async function getReportTargetDetails(
    report: Report,
): Promise<{ content: unknown; context: ReportTargetContext | null; error: unknown }> {
    if (report.target_type === 'manga_comment') {
        const { data, error } = await supabase
            .from('manga_comments')
            .select(
                `
        id,
        content,
        is_active,
        user_id,
        manga_id,
        chapter_id,
        manga:manga_id (
          id,
          title,
          slug
        ),
        chapter:chapter_id (
          id,
          title,
          chapter_number
        )
      `,
            )
            .eq('id', report.target_id)
            .single<MangaCommentContextRow>()

        if (error || !data) return { content: null, context: null, error }
        return {
            content: data,
            context: await buildMangaCommentContext(data),
            error: null,
        }
    }

    if (report.target_type === 'manga') {
        const { data, error } = await supabase
            .from('mangas')
            .select('id, title, slug, description, is_active, fansub_id')
            .eq('id', report.target_id)
            .single<MangaContentContextRow>()

        if (error || !data) return { content: null, context: null, error }
        return {
            content: data,
            context: buildMangaContentContext(data),
            error: null,
        }
    }

    if (report.target_type === 'chapter') {
        const { data, error } = await supabase
            .from('chapters')
            .select(
                `
        id,
        chapter_number,
        title,
        is_active,
        manga_id,
        fansub_id,
        manga:manga_id (
          id,
          title,
          slug
        )
      `,
            )
            .eq('id', report.target_id)
            .single<ChapterContentContextRow>()

        if (error || !data) return { content: null, context: null, error }
        return {
            content: data,
            context: await buildChapterContentContext(data),
            error: null,
        }
    }

    if (report.target_type === 'user') {
        const data = await getAdminReportUserTarget(report.target_id)
        const error = data ? null : new Error(txa('Kullanici hedef baglami bulunamadi.'))

        if (error || !data) return { content: null, context: null, error }
        return {
            content: data,
            context: buildUserReportContext(data),
            error: null,
        }
    }

    const { data, error } = await supabase
        .from('user_manga_list_comments')
        .select(
            `
      id,
      body,
      is_active,
      author_id,
      list_id,
      list:list_id (
        id,
        title
      )
    `,
        )
        .eq('id', report.target_id)
        .single<MangaListCommentContextRow>()

    if (error || !data) return { content: null, context: null, error }
    return {
        content: data,
        context: await buildMangaListCommentContext(data),
        error: null,
    }
}

export async function getReportDetails(report: Report) {
    const e2eContext = getE2EAdminReportContext(report)
    if (e2eContext) return e2eContext

    const { content, context, error } = await getReportTargetDetails(report)
    return { content, context, error }
}
