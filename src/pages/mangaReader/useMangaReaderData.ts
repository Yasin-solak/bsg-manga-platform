import { useCallback, useEffect, useMemo, useState } from 'react'
import type { NavigateFunction } from 'react-router-dom'
import type { Chapter, Comment, RelatedFansub, RelatedManga, RelatedUser } from '@/types'
import {
  buildLegacyPublicChapterPath,
  doesChapterRouteNeedVersionQuery,
  resolvePublicFansubKey,
} from '@/lib/routes'
import { buildChapterCreditPresentation } from '@/components/fansub/chapterCreditPresentation'
import { canRenderFansubChapterEndCredit } from '@/lib/fansubBoostCapabilityGovernance'
import {
  getPublicFansubBoostSnapshot,
  listPublicFansubBoostSupportersPreview,
  type FansubBoostSnapshot,
  type FansubBoostSupporterPreview,
} from '@/services/fansubBoostService'
import {
  getEffectivePublicFansubChapterCreditConfig,
  type EffectivePublicFansubChapterCreditConfig,
} from '@/services/fansubChapterCreditService'
import { getChapterDetails, getChaptersByMangaId, getMangaByIdentifier, trackMangaRead } from '@/services/mangaService'
import { getReaderClientKey } from '@/services/readTrackingService'
import { addReadingHistory } from '@/services/userService'
import { createScopedLogger } from '@/services/logger'
import { commentService, type CommentSortBy } from '@/services/commentService'
import { resolveCommentMentionContext } from '@/services/commentMentionService'
import {
  isChapterNotFoundError,
  shouldTrackRead,
} from '@/pages/mangaReader/readerChapterRouting'
import { txa } from '@/i18n/activeLocale'

const READ_TRACK_MIN_VISIBLE_MS = 8_000
const READ_TRACK_RETRY_MS = 1_500
const mangaReaderDataLogger = createScopedLogger('MangaReaderData')

interface UseMangaReaderDataArgs {
  chapterNumber?: string
  commentSortBy: CommentSortBy
  fansubKey?: string
  id?: string
  isBoostSystemEnabled: boolean
  locationPathname: string
  locationSearch: string
  navigate: NavigateFunction
  currentUserId?: string | null
  versionId?: string | null
}

export function useMangaReaderData({
  chapterNumber,
  commentSortBy,
  fansubKey,
  id,
  isBoostSystemEnabled,
  locationPathname,
  locationSearch,
  navigate,
  currentUserId,
  versionId,
}: UseMangaReaderDataArgs) {
  const [chapter, setChapter] = useState<Chapter | null>(null)
  const [mangaRouteState, setMangaRouteState] = useState<{ id: string; slug?: string; title?: string } | null>(null)
  const [pages, setPages] = useState<string[]>([])
  const [allChapters, setAllChapters] = useState<Chapter[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [comments, setComments] = useState<Comment[]>([])
  const [commentsLoading, setCommentsLoading] = useState(false)
  const [resolvedMentionedUsers, setResolvedMentionedUsers] = useState<RelatedUser[]>([])
  const [resolvedRelatedFansubs, setResolvedRelatedFansubs] = useState<RelatedFansub[]>([])
  const [resolvedMentionedMangas, setResolvedMentionedMangas] = useState<RelatedManga[]>([])
  const [chapterCreditSnapshot, setChapterCreditSnapshot] = useState<FansubBoostSnapshot | null>(null)
  const [chapterCreditConfig, setChapterCreditConfig] = useState<EffectivePublicFansubChapterCreditConfig | null>(null)
  const [chapterCreditSupporters, setChapterCreditSupporters] = useState<FansubBoostSupporterPreview[]>([])
  const [chapterCreditLoading, setChapterCreditLoading] = useState(false)

  const resolveCommentMentions = useCallback(async (rows: Comment[], signal?: AbortSignal) => {
    try {
      const resolved = await resolveCommentMentionContext(rows, signal)
      if (signal?.aborted) return
      setResolvedMentionedUsers(resolved.mentionedUsers)
      setResolvedRelatedFansubs(resolved.relatedFansubs)
      setResolvedMentionedMangas(resolved.mentionedMangas)
    } catch (error) {
      if (signal?.aborted) return
      mangaReaderDataLogger.error({ event: 'resolve-comment-mentions-error', error })
      setResolvedMentionedUsers([])
      setResolvedRelatedFansubs([])
      setResolvedMentionedMangas([])
    }
  }, [])

  useEffect(() => {
    if (!id || !chapterNumber) return

    let alive = true
    const controller = new AbortController()
    let trackTimeout: number | null = null
    let retryTimeout: number | null = null
    let cancelTrack: (() => void) | null = null
    let removeListeners: (() => void) | null = null

    setLoading(true)
    setNotFound(false)

    async function load() {
      try {
        const mangaIdentifier = id!
        const parsedChapterNumber = Number(chapterNumber)
        const mangaData = await getMangaByIdentifier(mangaIdentifier, controller.signal)
        if (!alive) return

        const allChaps = await getChaptersByMangaId(mangaData.id, controller.signal)
        if (!alive) return

        const requestedVersionId = (() => {
          if (versionId) return versionId
          if (!fansubKey) return undefined
          const normalizedFansubKey = fansubKey.trim()
          if (!normalizedFansubKey) return undefined
          const matchedVersion = allChaps.find((candidate) => (
            candidate.chapterNumber === parsedChapterNumber
            && resolvePublicFansubKey({
              id: candidate.fansub?.id,
              slug: candidate.fansub?.slug,
            }) === normalizedFansubKey
          ))
          return matchedVersion?.id
        })()

        const chapterDetailsPromise = (async () => {
          try {
            return await getChapterDetails(mangaData.id, parsedChapterNumber, requestedVersionId)
          } catch (error) {
            if (!requestedVersionId || !isChapterNotFoundError(error)) throw error
            return getChapterDetails(mangaData.id, parsedChapterNumber)
          }
        })()

        const chapterData = await chapterDetailsPromise
        if (!alive) return

        setMangaRouteState({ id: mangaData.id, slug: mangaData.slug, title: mangaData.title })
        setChapter(chapterData)
        setPages(chapterData.pages || [])
        setAllChapters(allChaps)

        const chapterVersions = allChaps.filter((candidate) => candidate.chapterNumber === chapterData.chapterNumber)
        const canonicalPath = buildLegacyPublicChapterPath({
          mangaId: mangaData.id,
          mangaSlug: mangaData.slug,
          mangaTitle: mangaData.title,
          chapterNumber: parsedChapterNumber,
          chapterId: chapterData.id,
          fansubId: chapterData.fansub?.id,
          fansubSlug: chapterData.fansub?.slug,
          forceVersionQuery: doesChapterRouteNeedVersionQuery(chapterVersions, chapterData),
        })

        if (`${locationPathname}${locationSearch}` !== canonicalPath) {
          navigate(canonicalPath, { replace: true })
        }

        const clientKey = getReaderClientKey()
        const loadedAt = Date.now()
        let cancelled = false
        cancelTrack = () => {
          cancelled = true
        }

        const attempt = () => {
          if (!alive || cancelled) return
          if (document.visibilityState !== 'visible') {
            retryTimeout = window.setTimeout(attempt, READ_TRACK_RETRY_MS)
            return
          }

          const elapsed = Date.now() - loadedAt
          if (elapsed < READ_TRACK_MIN_VISIBLE_MS) {
            retryTimeout = window.setTimeout(attempt, READ_TRACK_MIN_VISIBLE_MS - elapsed)
            return
          }

          if (!shouldTrackRead(mangaData.id, chapterData.id, chapterData.id)) return
          void trackMangaRead(mangaData.id, chapterData.id, parsedChapterNumber, clientKey)
          if (currentUserId && chapterData.id) {
            void addReadingHistory(currentUserId, mangaData.id, chapterData.id, parsedChapterNumber)
          }
        }

        const onVisible = () => {
          if (document.visibilityState === 'visible') attempt()
        }

        removeListeners?.()
        document.addEventListener('visibilitychange', onVisible)
        window.addEventListener('focus', onVisible)
        removeListeners = () => {
          document.removeEventListener('visibilitychange', onVisible)
          window.removeEventListener('focus', onVisible)
        }
        trackTimeout = window.setTimeout(attempt, READ_TRACK_MIN_VISIBLE_MS)
      } catch (error) {
        if (alive && isChapterNotFoundError(error)) setNotFound(true)
      } finally {
        if (alive) setLoading(false)
      }
    }

    void load()

    return () => {
      alive = false
      controller.abort()
      cancelTrack?.()
      if (trackTimeout) clearTimeout(trackTimeout)
      if (retryTimeout) clearTimeout(retryTimeout)
      removeListeners?.()
    }
  }, [chapterNumber, currentUserId, fansubKey, id, locationPathname, locationSearch, navigate, versionId])

  const mangaId = mangaRouteState?.id || null

  useEffect(() => {
    if (!mangaId || !chapter?.id) {
      setComments([])
      setCommentsLoading(false)
      setResolvedMentionedUsers([])
      setResolvedRelatedFansubs([])
      setResolvedMentionedMangas([])
      return
    }

    let alive = true
    const controller = new AbortController()
    setCommentsLoading(true)

    void (async () => {
      try {
        const rows = await commentService.getComments(mangaId, {
          chapterId: chapter.id,
          sortBy: commentSortBy,
          signal: controller.signal,
        })
        if (!alive) return
        setComments(rows as unknown as Comment[])
        await resolveCommentMentions(rows as unknown as Comment[], controller.signal)
      } catch (error) {
        if (!alive) return
        mangaReaderDataLogger.error({ event: 'chapter-comments-load-error', error })
        setComments([])
        setResolvedMentionedUsers([])
        setResolvedRelatedFansubs([])
        setResolvedMentionedMangas([])
      } finally {
        if (alive) setCommentsLoading(false)
      }
    })()

    return () => {
      alive = false
      controller.abort()
    }
  }, [chapter?.id, commentSortBy, mangaId, resolveCommentMentions])

  useEffect(() => {
    const fansubId = chapter?.fansub?.id
    const chapterId = chapter?.id
    if (!fansubId || !chapterId || !isBoostSystemEnabled) {
      setChapterCreditSnapshot(null)
      setChapterCreditConfig(null)
      setChapterCreditSupporters([])
      setChapterCreditLoading(false)
      return
    }

    let alive = true
    const controller = new AbortController()
    setChapterCreditSnapshot(null)
    setChapterCreditSupporters([])
    setChapterCreditLoading(true)

    void (async () => {
      try {
        const [snapshotResult, configResult] = await Promise.allSettled([
          getPublicFansubBoostSnapshot(fansubId, controller.signal),
          getEffectivePublicFansubChapterCreditConfig(fansubId, chapterId),
        ])
        if (!alive) return

        const snapshot = snapshotResult.status === 'fulfilled' ? snapshotResult.value : null
        const config = configResult.status === 'fulfilled' ? configResult.value : null

        if (snapshotResult.status === 'rejected') {
          mangaReaderDataLogger.error({ event: 'chapter-credit-snapshot-enrichment-error', error: snapshotResult.reason })
        }
        if (configResult.status === 'rejected') {
          mangaReaderDataLogger.error({ event: 'chapter-credit-config-error', error: configResult.reason })
        }

        setChapterCreditSnapshot(snapshot)
        setChapterCreditConfig(config)

        if (!config?.showSupporters) return

        const preview = await listPublicFansubBoostSupportersPreview(
          fansubId,
          Math.max(2, config.maxSupporterCount),
          controller.signal,
        )
        if (!alive) return

        setChapterCreditSupporters(
          preview.filter((supporter) => supporter.rewardCapabilities?.canAppearInCreditPage === true),
        )
      } catch (error) {
        if (!alive) return
        mangaReaderDataLogger.error({ event: 'chapter-credit-snapshot-error', error })
        setChapterCreditSnapshot(null)
        setChapterCreditConfig(null)
        setChapterCreditSupporters([])
      } finally {
        if (alive) setChapterCreditLoading(false)
      }
    })()

    return () => {
      alive = false
      controller.abort()
    }
  }, [chapter?.fansub?.id, chapter?.id, isBoostSystemEnabled])

  const chapterCreditPresentation = useMemo(() => {
    if (!chapter?.fansub || !chapterCreditConfig) return null
    if (!canRenderFansubChapterEndCredit(chapterCreditSnapshot?.capabilities, chapterCreditSnapshot ? 'resolved' : 'unknown')) {
      return null
    }

    return buildChapterCreditPresentation({
      fansub: {
        ...chapter.fansub,
        hasDiscoverBadge: chapterCreditSnapshot?.capabilities.hasDiscoverBadge === true,
        hasGoldFrame: chapterCreditSnapshot?.capabilities.hasGoldFrame === true,
      },
      config: chapterCreditConfig,
      snapshot: chapterCreditSnapshot,
      supporters: chapterCreditSupporters,
      badgeLabel: txa('Bölüm {number} sonu', { number: chapter.chapterNumber }),
      eyebrowLabel: txa('Kapanış şeridi'),
    })
  }, [chapter?.chapterNumber, chapter?.fansub, chapterCreditConfig, chapterCreditSnapshot, chapterCreditSupporters])

  return {
    allChapters,
    chapter,
    chapterCreditLoading,
    chapterCreditPresentation,
    comments,
    commentsLoading,
    loading,
    mangaId,
    mangaSlug: mangaRouteState?.slug,
    mangaTitle: mangaRouteState?.title,
    notFound,
    pages,
    resolvedMentionedMangas,
    resolvedMentionedUsers,
    resolvedRelatedFansubs,
    resolveCommentMentions,
    setComments,
  }
}
