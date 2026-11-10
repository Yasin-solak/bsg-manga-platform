/**
 * Reader v2 auto reading layer.
 *
 * SINGLE container principle: two different behaviors run on the same container by layout axis.
 * - Strip (axis y): continuous scrolling, px/second. Decision logic is in the pure engine
 * SHARED with v1 (readerAutoScrollEngine), not copied.
 * - Page (axis x): timed page turning (readerV2AutoAdvanceEngine),
 * because the horizontal container uses snap and scrolling pixel by pixel fights
 * snap. v1 had NO auto reading in horizontal mode.
 *
 * Critical detail (v1's 60 px/s bug): position accumulates as a FRACTION on the JS side and is
 * NOT read back from `element.scrollTop` each frame. The browser rounds scrollTop to whole pixels,
 * so reading back loses sub-pixel per-frame progress and low speeds do not move at all.
 * Reading back happens only to detect manual scrolling, when outside the
 * tolerance.
 */

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { computeAutoScrollFrame } from '@/pages/mangaReader/readerAutoScrollEngine'
import {
  computeReaderV2PageAdvance,
  resolveReaderV2AutoScrollHold,
  resolveReaderV2ManualScroll,
  shouldStopReaderV2PageAdvance,
} from '@/pages/reader/readerV2AutoAdvanceEngine'
import type { ReaderV2Layout } from '@/pages/reader/readerV2LayoutEngine'

interface UseReaderV2AutoScrollArgs {
  stageRef: RefObject<HTMLDivElement | null>
  layout: ReaderV2Layout
  /** Serit modu hizi (px/saniye). */
  speed: number
  /** Sayfa modu cevirme araligi (saniye). */
  advanceSeconds: number
  /** Sayfa modunda ilerleme komutu (snap'e saygili). */
  onAdvance: () => void
  /** Auto reading should not turn on with no content. */
  enabled: boolean
  /** Auto reading turns off when this changes (chapter transition). */
  resetKey: string
}

export function useReaderV2AutoScroll({
  stageRef,
  layout,
  speed,
  advanceSeconds,
  onAdvance,
  enabled,
  resetKey,
}: UseReaderV2AutoScrollArgs) {
  const [isAutoScrolling, setIsAutoScrolling] = useState(false)
  /** Auto reading waits if the page to read has not arrived; the UI shows this. */
  const [isWaitingForPage, setIsWaitingForPage] = useState(false)

  // Ayar degisimi dongunun kendisini yeniden kurmasin diye ref uzerinden
  // okunur; aksi halde her hiz tiklamasinda rAF dongusu yikilip yeniden
  // kuruluyordu (v1'de yasanmisti).
  const speedRef = useRef(speed)
  const advanceMsRef = useRef(advanceSeconds * 1000)
  const advanceCommandRef = useRef(onAdvance)
  useEffect(() => {
    speedRef.current = speed
  }, [speed])
  useEffect(() => {
    advanceMsRef.current = advanceSeconds * 1000
  }, [advanceSeconds])
  useEffect(() => {
    advanceCommandRef.current = onAdvance
  }, [onAdvance])

  // Turns off on chapter change: a new chapter should not flow without the user knowing.
  useEffect(() => {
    setIsAutoScrolling(false)
  }, [resetKey])

  useEffect(() => {
    if (!enabled) setIsAutoScrolling(false)
  }, [enabled])

  useEffect(() => {
    if (!isAutoScrolling) return
    const element = stageRef.current
    if (!element) return

    let animationId = 0
    let lastTick = performance.now()

    // Serit: kesirli konum birikimi (bkz. dosya basligi).
    let position = element.scrollTop
    let settledFrames = 0
    let lastScrollHeight = element.scrollHeight
    // Sayfa: sure birikimi + ulasilan en ileri nokta (geri kaydirma tespiti).
    let elapsedMs = 0
    let furthestLeft = element.scrollLeft
    let heldMs = 0

    /**
     * Is there an unloaded image in the region about to be read (current view + one view ahead)?
     * Distant lazy images do not count; only those about to come into view.
     */
    const hasPendingImageAhead = () => {
      const horizontal = layout.axis === 'x'
      const start = horizontal ? element.scrollLeft : element.scrollTop
      const size = horizontal ? element.clientWidth : element.clientHeight
      const end = start + size * 1.5
      const containerStart = element.getBoundingClientRect()

      return [...element.querySelectorAll('img')].some((image) => {
        if (image.complete) return false
        const rect = image.getBoundingClientRect()
        const imageStart = horizontal
          ? rect.left - containerStart.left + element.scrollLeft
          : rect.top - containerStart.top + element.scrollTop
        const imageEnd = imageStart + (horizontal ? rect.width : rect.height)
        return imageEnd > start && imageStart < end
      })
    }

    const tick = (now: number) => {
      const deltaMs = now - lastTick
      lastTick = now

      if (layout.axis === 'x') {
        // Scrolling back should stop auto in page mode too. This branch used to return early
        // and "pull back to stop" never worked horizontally.
        if (shouldStopReaderV2PageAdvance({
          position: element.scrollLeft,
          furthestPosition: furthestLeft,
          viewportSize: element.clientWidth,
        })) {
          setIsAutoScrolling(false)
          return
        }
        furthestLeft = Math.max(furthestLeft, element.scrollLeft)

        const pageHold = resolveReaderV2AutoScrollHold({
          hasPendingImage: hasPendingImageAhead(),
          heldMs,
          deltaMs,
        })
        heldMs = pageHold.heldMs
        setIsWaitingForPage(pageHold.hold)
        if (pageHold.hold) {
          animationId = requestAnimationFrame(tick)
          return
        }

        const maxScroll = element.scrollWidth - element.clientWidth
        const frame = computeReaderV2PageAdvance({
          elapsedMs,
          deltaMs,
          intervalMs: advanceMsRef.current,
          atEnd: element.scrollLeft >= maxScroll - 1,
        })
        elapsedMs = frame.elapsedMs
        if (frame.shouldAdvance) advanceCommandRef.current()
        if (frame.shouldStop) {
          setIsAutoScrolling(false)
          return
        }
        animationId = requestAnimationFrame(tick)
        return
      }

      // Elle kaydirma tepkisi: yukari -> dur, asagi -> devam (saf motorda).
      const reaction = resolveReaderV2ManualScroll({
        expectedPosition: position,
        actualPosition: element.scrollTop,
      })
      if (reaction === 'stop') {
        setIsAutoScrolling(false)
        return
      }
      if (reaction === 'resync') {
        position = element.scrollTop
      }

      // Wait on an unloaded page: since space is reserved up front we would otherwise flow over
      // empty gray boxes (slow connection + high speed).
      const stripHold = resolveReaderV2AutoScrollHold({
        hasPendingImage: hasPendingImageAhead(),
        heldMs,
        deltaMs,
      })
      heldMs = stripHold.heldMs
      setIsWaitingForPage(stripHold.hold)
      if (stripHold.hold) {
        animationId = requestAnimationFrame(tick)
        return
      }

      const frame = computeAutoScrollFrame({
        scrollTop: position,
        scrollHeight: element.scrollHeight,
        clientHeight: element.clientHeight,
        speed: speedRef.current,
        deltaMs,
        lastScrollHeight,
        settledFrames,
      })
      settledFrames = frame.settledFrames
      lastScrollHeight = frame.lastScrollHeight

      if (frame.nextScrollTop !== null) {
        position = frame.nextScrollTop
        element.scrollTop = position
      }

      if (frame.shouldStop) {
        setIsAutoScrolling(false)
        return
      }

      animationId = requestAnimationFrame(tick)
    }

    // Ignore accumulated time on returning to the tab (engines already clip;
    // this second defense keeps the first frame on return clean too).
    const handleVisibility = () => {
      if (!document.hidden) lastTick = performance.now()
    }
    document.addEventListener('visibilitychange', handleVisibility)

    animationId = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(animationId)
      document.removeEventListener('visibilitychange', handleVisibility)
      setIsWaitingForPage(false)
    }
  }, [isAutoScrolling, layout.axis, stageRef])

  const toggleAutoScroll = useCallback(() => {
    if (!enabled) return
    setIsAutoScrolling((running) => !running)
  }, [enabled])

  const stopAutoScroll = useCallback(() => setIsAutoScrolling(false), [])

  return { isAutoScrolling, isWaitingForPage, toggleAutoScroll, stopAutoScroll }
}
