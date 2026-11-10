import { useMemo } from 'react'
import type { Manga, Chapter, Comment } from '@/types'
import { buildPublicChapterPath, doesChapterRouteNeedVersionQuery } from '@/lib/routes'

/** Reading targets and comment count on the series page derive in one place. */
export function useMangaDetailDerived(manga: Manga | null, chapters: Chapter[], comments: Comment[], continueReadingEntry: { chapterId: string | null; chapterNumber: number } | null) {
    const totalCommentCount = useMemo(() => {
        const countAll = (items: Comment[]): number => items.reduce((acc, item) => acc + 1 + countAll(item.replies || []), 0)
        return countAll(comments)
    }, [comments])
    const continueReadingChapter = useMemo(() => {
        if (!continueReadingEntry) return null
        const byId = continueReadingEntry.chapterId
            ? chapters.find((chapter) => chapter.id === continueReadingEntry.chapterId)
            : null
        if (byId) return byId
        return chapters.find((chapter) => chapter.chapterNumber === continueReadingEntry.chapterNumber) || null
    }, [chapters, continueReadingEntry])
    const continueReadingUrl = useMemo(() => {
        if (!manga || !continueReadingEntry) return null
        const chapterNumber = continueReadingChapter?.chapterNumber || continueReadingEntry.chapterNumber
        const activeChapter = continueReadingChapter || null
        const chapterId = activeChapter?.id || continueReadingEntry.chapterId
        if (!Number.isFinite(chapterNumber) || chapterNumber <= 0) return null
        const chapterVersions = chapters.filter((entry) => entry.chapterNumber === chapterNumber)
        const fallbackTarget = chapterId ? { id: chapterId, fansub: activeChapter?.fansub } : null
        return buildPublicChapterPath({
            mangaId: manga.id,
            mangaSlug: manga.slug,
            mangaTitle: manga.title,
            chapterNumber,
            chapterId: chapterId || undefined,
            fansubId: activeChapter?.fansub?.id,
            fansubSlug: activeChapter?.fansub?.slug,
            forceVersionQuery: doesChapterRouteNeedVersionQuery(chapterVersions, fallbackTarget || activeChapter),
        })
    }, [chapters, continueReadingChapter, continueReadingEntry, manga])
    const startReadingUrl = useMemo(() => {
        if (!manga || chapters.length === 0) return null
        const latestChapter = chapters.reduce((latest, chapter) => {
            if (chapter.chapterNumber !== latest.chapterNumber) {
                return chapter.chapterNumber > latest.chapterNumber ? chapter : latest
            }

            const chapterCreatedAt = new Date(chapter.createdAt).getTime()
            const latestCreatedAt = new Date(latest.createdAt).getTime()
            return chapterCreatedAt > latestCreatedAt ? chapter : latest
        }, chapters[0])
        return buildPublicChapterPath({
            mangaId: manga.id,
            mangaSlug: manga.slug,
            mangaTitle: manga.title,
            chapterNumber: latestChapter.chapterNumber,
            chapterId: latestChapter.id,
            fansubId: latestChapter.fansub?.id,
            fansubSlug: latestChapter.fansub?.slug,
            forceVersionQuery: doesChapterRouteNeedVersionQuery(
                chapters.filter((entry) => entry.chapterNumber === latestChapter.chapterNumber),
                latestChapter,
            ),
        })
    }, [chapters, manga])

    return { totalCommentCount, continueReadingChapter, continueReadingUrl, startReadingUrl }
}
