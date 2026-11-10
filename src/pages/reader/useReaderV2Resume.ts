/**
 * React binding of "Continue from your page".
 *
 * Decision logic is in the pure engine (readerV2ResumeEngine); here measures are only
 * taken, records written and a one-time restore applied.
 *
 * Page positions are measured from the REAL DOM (not an estimated percent):
 * image tops/heights in strip mode, screen width in page mode.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  pickReaderV2Position,
  resolveReaderV2PositionFromScroll,
  resolveReaderV2ScrollFromPosition,
  shouldRestoreReaderV2Position,
  type ReaderV2PageMetric,
  type ReaderV2ReadingPosition,
} from '@/pages/reader/readerV2ResumeEngine'
import { getRemoteReadingPosition, saveRemoteReadingPosition } from '@/services/userService'
import {
  clearStoredReaderV2Position,
  readStoredReaderV2Position,
  writeStoredReaderV2Position,
} from '@/pages/reader/readerV2PositionStorage'
import { txa } from '@/i18n/activeLocale'

/** The position is written at this frequency; writing on every scroll frame is needless. */
const POSITION_WRITE_THROTTLE_MS = 1_000

interface UseReaderV2ResumeArgs {
  stageRef: React.RefObject<HTMLDivElement | null>
  axis: 'x' | 'y'
  chapterId: string | null | undefined
  pageCount: number
  /** Cross-device sync only for signed-in readers. */
  currentUserId?: string | null
  mangaId?: string | null
}

export function useReaderV2Resume({
  stageRef,
  axis,
  chapterId,
  pageCount,
  currentUserId,
  mangaId,
}: UseReaderV2ResumeArgs) {
  /** Page to show the user when restored (1-based). */
  const [resumedPage, setResumedPage] = useState<number | null>(null)
  /** If the position came from another device, the bar says so. */
  const [resumedFromOtherDevice, setResumedFromOtherDevice] = useState(false)
  const restoredForChapterRef = useRef<string | null>(null)
  const lastWriteRef = useRef(0)
  /** Uzak konum: null = henuz bilinmiyor, undefined disi deger = cevap geldi. */
  const [remotePosition, setRemotePosition] = useState<{ pageIndex: number; at: number } | null>(null)
  const remoteResolvedRef = useRef<string | null>(null)
  /** Last position to write to the server at exit points. */
  const pendingSyncRef = useRef<ReaderV2ReadingPosition | null>(null)
  const syncedSignatureRef = useRef<string | null>(null)

  /** Page measures: image boxes in strip mode, screen width in page mode. */
  const readPageMetrics = useCallback((): ReaderV2PageMetric[] => {
    const element = stageRef.current
    if (!element) return []

    if (axis === 'x') {
      const size = element.clientWidth
      if (size <= 0 || pageCount <= 0) return []
      // In page mode each screen is a "stop"; screen width is measured, not the image box
      // (snap works by this step).
      const viewCount = Math.max(Math.round(element.scrollWidth / size), 1)
      return Array.from({ length: viewCount }, (_, index) => ({ start: index * size, size }))
    }

    const containerTop = element.getBoundingClientRect().top
    return [...element.querySelectorAll('img')]
      .filter((image) => image.alt.startsWith(txa('Sayfa')))
      .map((image) => {
        const rect = image.getBoundingClientRect()
        return { start: rect.top - containerTop + element.scrollTop, size: rect.height }
      })
  }, [axis, pageCount, stageRef])

  /** Kaydirma sirasinda cagrilir; kisilmis sekilde konum yazar. */
  const recordPosition = useCallback(() => {
    const element = stageRef.current
    if (!element || !chapterId) return

    const now = Date.now()
    if (now - lastWriteRef.current < POSITION_WRITE_THROTTLE_MS) return

    const pages = readPageMetrics()
    const position = resolveReaderV2PositionFromScroll({
      scrollPosition: axis === 'x' ? element.scrollLeft : element.scrollTop,
      pages,
    })
    if (!position) return

    lastWriteRef.current = now
    writeStoredReaderV2Position(chapterId, position)
    // Written to the server at exit points, not on EVERY scroll.
    pendingSyncRef.current = position
  }, [axis, chapterId, readPageMetrics, stageRef])

  /** Writes the pending position to the server; does nothing if unchanged. */
  const flushRemotePosition = useCallback(() => {
    const position = pendingSyncRef.current
    if (!position || !currentUserId || !mangaId || !chapterId || pageCount <= 0) return

    const signature = `${chapterId}:${position.pageIndex}`
    if (syncedSignatureRef.current === signature) return
    syncedSignatureRef.current = signature

    void saveRemoteReadingPosition({
      userId: currentUserId,
      mangaId,
      chapterId,
      pageIndex: Math.min(position.pageIndex, pageCount - 1),
      pageCount,
    })
  }, [chapterId, currentUserId, mangaId, pageCount])

  // On chapter change the restore should be retryable.
  useEffect(() => {
    setResumedPage(null)
    setResumedFromOtherDevice(false)
    setRemotePosition(null)
    lastWriteRef.current = 0
    pendingSyncRef.current = null
    syncedSignatureRef.current = null
  }, [chapterId])

  // Remote position: ONE query per chapter (one row per manga, on a unique
  // index). Restore waits until the answer arrives, so we do not jump to the local position
  // and then jump again to the remote.
  useEffect(() => {
    if (!chapterId) return
    if (!currentUserId || !mangaId) {
      remoteResolvedRef.current = chapterId
      return
    }
    if (remoteResolvedRef.current === chapterId) return

    let cancelled = false
    void getRemoteReadingPosition(currentUserId, mangaId, chapterId).then((remote) => {
      if (cancelled) return
      remoteResolvedRef.current = chapterId
      if (remote) setRemotePosition({ pageIndex: remote.pageIndex, at: Date.parse(remote.positionAt) })
    })
    return () => {
      cancelled = true
    }
  }, [chapterId, currentUserId, mangaId])

  // Exit points: when the tab hides and on leaving. Nothing is written to the server during reading;
  // position is frequently changing data and the one bottleneck is Postgres CPU.
  useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState === 'hidden') flushRemotePosition()
    }
    document.addEventListener('visibilitychange', onHidden)
    window.addEventListener('pagehide', flushRemotePosition)
    return () => {
      document.removeEventListener('visibilitychange', onHidden)
      window.removeEventListener('pagehide', flushRemotePosition)
      // A chapter change / leaving the reader is also an exit point.
      flushRemotePosition()
    }
  }, [flushRemotePosition])

  // One-time restore: applied once pages become measurable.
  useEffect(() => {
    if (!chapterId || pageCount <= 0) return
    if (restoredForChapterRef.current === chapterId) return

    const element = stageRef.current
    if (!element) return

    // No jump before the remote answer arrives: jumping local first and then to remote a second time
    // would be a bad experience.
    if (remoteResolvedRef.current !== chapterId) return

    const stored = readStoredReaderV2Position(chapterId)
    const picked = pickReaderV2Position({
      local: stored ? { position: stored, at: stored.at } : null,
      remote: remotePosition,
    })
    if (!shouldRestoreReaderV2Position({ position: picked?.position ?? null, pageCount })) {
      restoredForChapterRef.current = chapterId
      return
    }

    const pages = readPageMetrics()
    if (pages.length === 0) return

    const position = (picked as { position: ReaderV2ReadingPosition }).position
    const target = resolveReaderV2ScrollFromPosition({ position, pages })
    if (target === null) {
      restoredForChapterRef.current = chapterId
      return
    }

    restoredForChapterRef.current = chapterId
    if (axis === 'x') element.scrollLeft = target
    else element.scrollTop = target
    // Kullanici nereye atladigini gormeli; geri alma cubugu bununla acilir.
    setResumedPage(Math.min(position.pageIndex + 1, pageCount))
    setResumedFromOtherDevice(picked?.source === 'remote')
  }, [axis, chapterId, pageCount, readPageMetrics, remotePosition, stageRef])

  const dismissResumeNotice = useCallback(() => setResumedPage(null), [])

  /** "Start over": deletes the record, returns to the top, closes the bar. */
  const restartFromBeginning = useCallback(() => {
    const element = stageRef.current
    if (element) {
      if (axis === 'x') element.scrollLeft = 0
      else element.scrollTop = 0
    }
    clearStoredReaderV2Position(chapterId)
    lastWriteRef.current = Date.now()
    // The remote record must also go back to the top; otherwise the next open would drag back to the same
    // place (despite "start over").
    pendingSyncRef.current = { pageIndex: 0, pageOffsetRatio: 0 }
    setRemotePosition(null)
    setResumedPage(null)
    setResumedFromOtherDevice(false)
  }, [axis, chapterId, stageRef])

  return {
    resumedPage,
    resumedFromOtherDevice,
    recordPosition,
    dismissResumeNotice,
    restartFromBeginning,
  }
}
