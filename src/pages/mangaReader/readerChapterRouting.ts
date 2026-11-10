import type { Chapter } from '@/types'
import { buildLegacyPublicChapterPath } from '@/lib/routes'

function getChapterSortTimestamp(chapter: Chapter) {
  const rawValue = chapter.publishAt || chapter.createdAt
  const parsed = rawValue ? Date.parse(rawValue) : Number.NaN
  return Number.isFinite(parsed) ? parsed : 0
}

export function buildChapterReaderPath(
  mangaId: string,
  chapterNumber: number,
  versionId?: string | null,
) {
  return buildLegacyPublicChapterPath({
    mangaId,
    chapterNumber,
    chapterId: versionId,
    forceVersionQuery: Boolean(versionId),
  })
}

export function sortChapterVersions(chapters: Chapter[]) {
  return [...chapters].sort((left, right) => {
    if (right.chapterNumber !== left.chapterNumber) {
      return right.chapterNumber - left.chapterNumber
    }

    const timestampDifference = getChapterSortTimestamp(right) - getChapterSortTimestamp(left)
    if (timestampDifference !== 0) return timestampDifference

    return right.id.localeCompare(left.id)
  })
}

export function groupChaptersByNumber(chapters: Chapter[]) {
  const grouped = new Map<number, Chapter[]>()

  sortChapterVersions(chapters).forEach((chapter) => {
    const versions = grouped.get(chapter.chapterNumber)
    if (versions) {
      versions.push(chapter)
      return
    }

    grouped.set(chapter.chapterNumber, [chapter])
  })

  return grouped
}

export function getOrderedChapterNumbers(chaptersByNumber: Map<number, Chapter[]>) {
  return Array.from(chaptersByNumber.keys()).sort((left, right) => right - left)
}

export function resolvePreferredChapterVersion(
  versions: Chapter[] | undefined,
  currentChapter?: Chapter | null,
) {
  if (!versions?.length) return null

  const currentFansubId = currentChapter?.fansub?.id || null
  if (currentFansubId) {
    const matchingFansubVersion = versions.find((chapter) => chapter.fansub?.id === currentFansubId)
    if (matchingFansubVersion) return matchingFansubVersion
  }

  return versions[0]
}

export function resolveAdjacentChapterVersion(
  chaptersByNumber: Map<number, Chapter[]>,
  currentChapterNumber: number,
  direction: 'previous' | 'next',
  currentChapter?: Chapter | null,
) {
  const orderedChapterNumbers = getOrderedChapterNumbers(chaptersByNumber)
  const currentIndex = orderedChapterNumbers.indexOf(currentChapterNumber)
  if (currentIndex === -1) return null

  const targetIndex = direction === 'next' ? currentIndex - 1 : currentIndex + 1
  const targetChapterNumber = orderedChapterNumbers[targetIndex]
  if (typeof targetChapterNumber !== 'number') return null

  const targetChapter = resolvePreferredChapterVersion(
    chaptersByNumber.get(targetChapterNumber),
    currentChapter,
  )

  if (!targetChapter) return null

  return {
    chapter: targetChapter,
    chapterNumber: targetChapterNumber,
  }
}

export function isChapterNotFoundError(error: unknown) {
  if (!error || typeof error !== 'object') return false
  const target = error as { message?: string; code?: string; details?: string }
  const message = (target.message || '').toLowerCase()
  const details = (target.details || '').toLowerCase()
  return target.code === 'PGRST116' || message.includes('not found') || details.includes('0 rows')
}

export function shouldTrackRead(mangaId: string, chapterId?: string, versionId?: string | null) {
  const key = `read-track:${mangaId}:${chapterId || 'none'}:${versionId || 'default'}`
  const now = Date.now()

  try {
    const previous = Number(sessionStorage.getItem(key) || '0')
    if (Number.isFinite(previous) && now - previous < 300_000) return false
    sessionStorage.setItem(key, String(now))
  } catch {
    /* sessionStorage erisimi zorunlu degil */
  }

  return true
}
