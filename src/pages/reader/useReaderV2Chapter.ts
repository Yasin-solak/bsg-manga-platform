/**
 * Reader v2 data layer.
 *
 * Single responsibility: producing the "chapter to read" state from route parameters.
 * Layout, scrolling and controls are NOT HERE: in v1 these boundaries mixed,
 * so each mode carried its own data/layout logic.
 *
 * Existing services are reused (no new RPCs):
 * getMangaByIdentifier / getChaptersByMangaId / getChapterDetails
 * v1's proven helpers are used for chapter version resolution.
 */

import { useEffect, useMemo, useState } from 'react'
import type { Chapter, Manga } from '@/types'
import { getChapterDetails, getChaptersByMangaId, getMangaByIdentifier } from '@/services/mangaService'
import { createScopedLogger } from '@/services/logger'
import { toUserFacingErrorMessage } from '@/services/userFacingError'
import {
  getOrderedChapterNumbers,
  groupChaptersByNumber,
  isChapterNotFoundError,
  resolveAdjacentChapterVersion,
  resolvePreferredChapterVersion,
} from '@/pages/mangaReader/readerChapterRouting'
import { txa } from '@/i18n/activeLocale'

const logger = createScopedLogger('readerV2')

export type ReaderV2Status = 'loading' | 'ready' | 'not-found' | 'error'

/** Why content is absent: the series removed, or only this chapter? */
export type ReaderV2NotFoundReason = 'manga' | 'chapter'

export interface ReaderV2AdjacentTarget {
  chapterNumber: number
  chapter: Chapter
}

/**
 * Picker row: a chapter number + ALL fansub versions of that number.
 *
 * Several teams can translate the same chapter (see the chapter ownership model).
 * The picker used to show one version per number and readers could not switch;
 * `versions` makes this choice possible.
 */
export interface ReaderV2ChapterOption extends ReaderV2AdjacentTarget {
  versions: Chapter[]
}

export interface ReaderV2State {
  status: ReaderV2Status
  errorMessage: string | null
  /** To pick the right text when `status === 'not-found'`. */
  notFoundReason: ReaderV2NotFoundReason | null
  manga: Manga | null
  chapter: Chapter | null
  /** Sayfa gorsel adresleri (cozumlenmis). */
  pages: string[]
  /** Other fansub versions of the same number. */
  versions: Chapter[]
  /** Neighbor chapter target: number + preferred version (same shape as the v1 helper). */
  previousChapter: ReaderV2AdjacentTarget | null
  nextChapter: ReaderV2AdjacentTarget | null
  /** For a progress label like "3/48". */
  chapterPosition: { index: number; total: number } | null
  /**
   * All chapters for the picker (newest to oldest). A preferred version is chosen per number,
   * so the picker tries to stay on the same fansub while reading.
   */
  chapterOptions: ReaderV2ChapterOption[]
}

interface UseReaderV2ChapterArgs {
  mangaKey: string
  chapterNumber: number | null
  fansubKey: string | null
  versionId: string | null
}

const EMPTY_STATE: ReaderV2State = {
  status: 'loading',
  errorMessage: null,
  notFoundReason: null,
  manga: null,
  chapter: null,
  pages: [],
  versions: [],
  previousChapter: null,
  nextChapter: null,
  chapterPosition: null,
  chapterOptions: [],
}

function matchesFansubKey(chapter: Chapter, fansubKey: string | null) {
  if (!fansubKey) return true
  const fansub = chapter.fansub
  if (!fansub) return false
  return fansub.slug === fansubKey || fansub.id === fansubKey
}

export function useReaderV2Chapter({
  mangaKey,
  chapterNumber,
  fansubKey,
  versionId,
}: UseReaderV2ChapterArgs): ReaderV2State {
  const [manga, setManga] = useState<Manga | null>(null)
  const [allChapters, setAllChapters] = useState<Chapter[]>([])
  const [chapter, setChapter] = useState<Chapter | null>(null)
  const [status, setStatus] = useState<ReaderV2Status>('loading')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [notFoundReason, setNotFoundReason] = useState<ReaderV2NotFoundReason | null>(null)

  // 1) Manga + chapter list
  useEffect(() => {
    let cancelled = false
    if (!mangaKey) {
      setStatus('not-found')
      return () => { cancelled = true }
    }

    setStatus('loading')
    setErrorMessage(null)
    setNotFoundReason(null)

    void (async () => {
      try {
        const loadedManga = await getMangaByIdentifier(mangaKey)
        if (cancelled) return
        if (!loadedManga) {
          setNotFoundReason('manga')
          setStatus('not-found')
          return
        }
        setManga(loadedManga)

        const chapters = await getChaptersByMangaId(loadedManga.id)
        if (cancelled) return
        setAllChapters(chapters)
      } catch (error) {
        if (cancelled) return
        /**
         * If an admin deactivates/deletes the series the query returns 0 rows and PostgREST throws
         * "Cannot coerce the result to a single JSON object". This RAW message should not leak
         * to the user and the state should be "absent", not "error",
         * as measured in production: the reader said "Chapter could not load. Cannot coerce...".
         */
        if (isChapterNotFoundError(error)) {
          setNotFoundReason('manga')
          setStatus('not-found')
          return
        }
        logger.warn('manga/bolum listesi yuklenemedi', { error, mangaKey })
        setErrorMessage(toUserFacingErrorMessage(error, txa('Bolum yuklenemedi.')))
        setStatus('error')
      }
    })()

    return () => { cancelled = true }
  }, [mangaKey])

  const chaptersByNumber = useMemo(() => groupChaptersByNumber(allChapters), [allChapters])
  const orderedNumbers = useMemo(() => getOrderedChapterNumbers(chaptersByNumber), [chaptersByNumber])

  // Versions of the requested number: narrowed first by fansubKey, then versionId.
  const versions = useMemo(() => {
    if (chapterNumber === null) return []
    return (chaptersByNumber.get(chapterNumber) || []).filter((item) => matchesFansubKey(item, fansubKey))
  }, [chapterNumber, chaptersByNumber, fansubKey])

  const targetChapter = useMemo(() => {
    if (versions.length === 0) return null
    if (versionId) {
      const exact = versions.find((item) => item.id === versionId)
      if (exact) return exact
    }
    return resolvePreferredChapterVersion(versions, null) ?? versions[0]
  }, [versionId, versions])

  // 2) Chapter details (pages)
  useEffect(() => {
    let cancelled = false
    if (!manga || chapterNumber === null) return () => { cancelled = true }

    if (allChapters.length > 0 && !targetChapter) {
      setNotFoundReason('chapter')
      setStatus('not-found')
      return () => { cancelled = true }
    }
    if (!targetChapter) return () => { cancelled = true }

    void (async () => {
      try {
        const detail = await getChapterDetails(manga.id, chapterNumber, targetChapter.id)
        if (cancelled) return
        if (!detail) {
          setNotFoundReason('chapter')
          setStatus('not-found')
          return
        }
        setChapter(detail)
        setStatus('ready')
      } catch (error) {
        if (cancelled) return
        if (isChapterNotFoundError(error)) {
          setNotFoundReason('chapter')
          setStatus('not-found')
          return
        }
        logger.warn('bolum detayi yuklenemedi', { error, mangaId: manga.id, chapterNumber })
        setErrorMessage(toUserFacingErrorMessage(error, txa('Bolum sayfalari yuklenemedi.')))
        setStatus('error')
      }
    })()

    return () => { cancelled = true }
  }, [allChapters.length, chapterNumber, manga, targetChapter])

  const previousChapter = useMemo(
    () => (chapterNumber === null
      ? null
      : resolveAdjacentChapterVersion(chaptersByNumber, chapterNumber, 'previous', targetChapter)),
    [chapterNumber, chaptersByNumber, targetChapter],
  )

  const nextChapter = useMemo(
    () => (chapterNumber === null
      ? null
      : resolveAdjacentChapterVersion(chaptersByNumber, chapterNumber, 'next', targetChapter)),
    [chapterNumber, chaptersByNumber, targetChapter],
  )

  const chapterPosition = useMemo(() => {
    if (chapterNumber === null || orderedNumbers.length === 0) return null
    const index = orderedNumbers.indexOf(chapterNumber)
    if (index === -1) return null
    // orderedNumbers is descending: counted in reverse for a readable order.
    return { index: orderedNumbers.length - index, total: orderedNumbers.length }
  }, [chapterNumber, orderedNumbers])

  // List for the picker: the preferred version of each number. If the read chapter has a fansub
  // it is preferred, so the picker keeps the reader on the same team.
  const chapterOptions = useMemo<ReaderV2ChapterOption[]>(() => {
    const preferredFansubId = targetChapter?.fansub?.id ?? null
    return orderedNumbers.reduce<ReaderV2ChapterOption[]>((accumulator, number) => {
      const numberVersions = chaptersByNumber.get(number) || []
      if (numberVersions.length === 0) return accumulator
      const sameFansub = preferredFansubId
        ? numberVersions.find((item) => item.fansub?.id === preferredFansubId)
        : undefined
      const preferred = sameFansub ?? resolvePreferredChapterVersion(numberVersions, null) ?? numberVersions[0]
      accumulator.push({ chapterNumber: number, chapter: preferred, versions: numberVersions })
      return accumulator
    }, [])
  }, [chaptersByNumber, orderedNumbers, targetChapter?.fansub?.id])

  if (chapterNumber === null) {
    return { ...EMPTY_STATE, status: 'not-found', manga }
  }

  return {
    status,
    errorMessage,
    notFoundReason,
    manga,
    chapter,
    pages: chapter?.pages ?? [],
    versions,
    previousChapter,
    nextChapter,
    chapterPosition,
    chapterOptions,
  }
}
