import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import type { NavigateFunction } from 'react-router-dom'
import type { Chapter } from '@/types'
import { buildLegacyPublicChapterPath, buildPublicMangaPath, doesChapterRouteNeedVersionQuery } from '@/lib/routes'
import {
  READER_ZOOM_LEVELS,
  type ReaderImageFitMode,
} from '@/services/readerPreferencesService'
import type { useReaderPreferences } from '@/hooks/useReaderPreferences'
import {
  buildReaderZoomStyle,
  readerImageFitModeLabel,
} from '@/pages/mangaReader/readerDisplayPresentation'
import { computeAutoScrollFrame } from '@/pages/mangaReader/readerAutoScrollEngine'
import {
  getOrderedChapterNumbers,
  groupChaptersByNumber,
  resolveAdjacentChapterVersion,
  resolvePreferredChapterVersion,
} from '@/pages/mangaReader/readerChapterRouting'
import { txa } from '@/i18n/activeLocale'

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}


interface UseReaderViewportControllerArgs {
  allChapters: Chapter[]
  chapter: Chapter | null
  chapterNumber?: string
  containerRef: RefObject<HTMLDivElement | null>
  contentRef: RefObject<HTMLDivElement | null>
  endRef: RefObject<HTMLDivElement | null>
  horizontalDetailRef: RefObject<HTMLDivElement | null>
  horizontalPageViewportRef: RefObject<HTMLDivElement | null>
  mangaId: string | null
  mangaSlug?: string
  mangaTitle?: string
  navigate: NavigateFunction
  pages: string[]
  preferences: ReturnType<typeof useReaderPreferences>['preferences']
  updatePreferences: ReturnType<typeof useReaderPreferences>['updatePreferences']
}

export function useReaderViewportController({
  allChapters,
  chapter,
  chapterNumber,
  containerRef,
  contentRef,
  endRef,
  horizontalDetailRef,
  horizontalPageViewportRef,
  mangaId,
  mangaSlug,
  mangaTitle,
  navigate,
  pages,
  preferences,
  updatePreferences,
}: UseReaderViewportControllerArgs) {
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [scrollProgress, setScrollProgress] = useState(0)
  const [hideBars, setHideBars] = useState(false)
  const [autoScroll, setAutoScroll] = useState(false)
  const [currentPageIndex, setCurrentPageIndex] = useState(0)
  const hideTimerRef = useRef<number | null>(null)

  const layoutMode = preferences.layoutMode
  const isHorizontalPagedMode = layoutMode === 'horizontal-paged'
  const zoomLevel = preferences.zoomLevel
  const autoScrollSpeed = preferences.autoScrollSpeed
  const imageFitMode = isHorizontalPagedMode ? preferences.horizontalImageFitMode : preferences.verticalImageFitMode
  const seamlessStrip = preferences.seamlessStrip
  const zoomStyle = useMemo(() => buildReaderZoomStyle(zoomLevel), [zoomLevel])

  const getActiveScrollContainer = useCallback(
    () => (isHorizontalPagedMode ? horizontalDetailRef.current : contentRef.current),
    [contentRef, horizontalDetailRef, isHorizontalPagedMode],
  )

  const updateReaderImageFitMode = useCallback((nextMode: ReaderImageFitMode) => {
    if (isHorizontalPagedMode) {
      updatePreferences({ horizontalImageFitMode: nextMode })
      return
    }
    updatePreferences({ verticalImageFitMode: nextMode })
  }, [isHorizontalPagedMode, updatePreferences])

  useEffect(() => {
    if (isHorizontalPagedMode) {
      horizontalPageViewportRef.current?.scrollTo({ top: 0, left: 0, behavior: 'auto' })
    }
    getActiveScrollContainer()?.scrollTo({ top: 0, behavior: 'auto' })
    setCurrentPageIndex(0)
    setScrollProgress(0)
    setHideBars(false)
    setAutoScroll(false)
  }, [chapterNumber, getActiveScrollContainer, horizontalPageViewportRef, isHorizontalPagedMode])

  const curNum = Number(chapterNumber || chapter?.chapterNumber || 0)
  const chaptersByNumber = useMemo(() => groupChaptersByNumber(allChapters), [allChapters])
  const orderedChapterNumbers = useMemo(() => getOrderedChapterNumbers(chaptersByNumber), [chaptersByNumber])
  const readerChapterNumber = chapter?.chapterNumber ?? curNum
  const curIdx = orderedChapterNumbers.indexOf(readerChapterNumber)
  const nextCh = useMemo(
    () => resolveAdjacentChapterVersion(chaptersByNumber, readerChapterNumber, 'next', chapter),
    [chapter, chaptersByNumber, readerChapterNumber],
  )
  const prevCh = useMemo(
    () => resolveAdjacentChapterVersion(chaptersByNumber, readerChapterNumber, 'previous', chapter),
    [chapter, chaptersByNumber, readerChapterNumber],
  )
  const sortedChapters = useMemo(
    () => orderedChapterNumbers
      .map((chapterNo) => resolvePreferredChapterVersion(chaptersByNumber.get(chapterNo), chapter))
      .filter((chapterItem): chapterItem is Chapter => Boolean(chapterItem)),
    [chapter, chaptersByNumber, orderedChapterNumbers],
  )
  const chapterProgressLabel = useMemo(
    () => curIdx === -1 ? '-' : `${orderedChapterNumbers.length - curIdx}/${orderedChapterNumbers.length}`,
    [curIdx, orderedChapterNumbers.length],
  )

  const safePageIndex = clamp(currentPageIndex, 0, Math.max(pages.length - 1, 0))
  const currentPage = pages[safePageIndex] ?? null
  const isFirstPage = safePageIndex === 0
  const isLastPage = safePageIndex >= Math.max(pages.length - 1, 0)
  const readerProgressLabel = isHorizontalPagedMode
    ? (pages.length === 0 ? txa('Sayfa yok') : txa('Sayfa {current}/{total}', { current: safePageIndex + 1, total: pages.length }))
    : chapterProgressLabel
  const readerModeLabel = isHorizontalPagedMode ? txa('Yatay sayfa') : txa('Dikey akış')
  const readerModeSummaryLabel = `${readerModeLabel} · ${readerImageFitModeLabel(imageFitMode)}`

  const goTo = useCallback((target: { chapterNumber: number; chapter?: Chapter | null }) => {
    if (!mangaId) return
    setAutoScroll(false)
    const versions = chaptersByNumber.get(target.chapterNumber) || []
    navigate(buildLegacyPublicChapterPath({
      mangaId,
      mangaSlug,
      mangaTitle,
      chapterNumber: target.chapterNumber,
      chapterId: target.chapter?.id,
      fansubId: target.chapter?.fansub?.id,
      fansubSlug: target.chapter?.fansub?.slug,
      forceVersionQuery: doesChapterRouteNeedVersionQuery(versions, target.chapter),
    }))
  }, [chaptersByNumber, mangaId, mangaSlug, mangaTitle, navigate])

  const goPrev = useCallback(() => {
    if (prevCh) goTo(prevCh)
  }, [goTo, prevCh])

  const goNext = useCallback(() => {
    if (nextCh) goTo(nextCh)
  }, [goTo, nextCh])

  const selectChapterNumber = useCallback((chapterValue: number) => {
    const selectedChapter = resolvePreferredChapterVersion(chaptersByNumber.get(chapterValue), chapter)
    if (!Number.isFinite(chapterValue) || chapterValue === readerChapterNumber || !selectedChapter) return
    goTo({ chapterNumber: chapterValue, chapter: selectedChapter })
  }, [chapter, chaptersByNumber, goTo, readerChapterNumber])

  const goToPage = useCallback((index: number) => {
    setCurrentPageIndex(clamp(index, 0, Math.max(pages.length - 1, 0)))
    horizontalPageViewportRef.current?.scrollTo({ top: 0, left: 0, behavior: 'auto' })
    getActiveScrollContainer()?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [getActiveScrollContainer, horizontalPageViewportRef, pages.length])

  const goPrevPage = useCallback(() => {
    if (pages.length === 0) return
    goToPage(safePageIndex - 1)
  }, [goToPage, pages.length, safePageIndex])

  const goNextPage = useCallback(() => {
    if (pages.length === 0) return
    goToPage(safePageIndex + 1)
  }, [goToPage, pages.length, safePageIndex])

  const canGoBackward = isHorizontalPagedMode ? (!isFirstPage || Boolean(prevCh)) : Boolean(prevCh)
  const canGoForward = isHorizontalPagedMode ? (!isLastPage || Boolean(nextCh)) : Boolean(nextCh)
  const backwardLabel = isHorizontalPagedMode ? (isFirstPage ? txa('Önceki bölüm') : txa('Önceki sayfa')) : txa('Önceki')
  const forwardLabel = isHorizontalPagedMode ? (isLastPage ? txa('Sonraki bölüm') : txa('Sonraki sayfa')) : txa('Sonraki')

  const handleBackward = useCallback(() => {
    if (!isHorizontalPagedMode) {
      goPrev()
      return
    }
    if (!isFirstPage) {
      goPrevPage()
      return
    }
    goPrev()
  }, [goPrev, goPrevPage, isFirstPage, isHorizontalPagedMode])

  const handleForward = useCallback(() => {
    if (!isHorizontalPagedMode) {
      goNext()
      return
    }
    if (!isLastPage) {
      goNextPage()
      return
    }
    goNext()
  }, [goNext, goNextPage, isHorizontalPagedMode, isLastPage])

  const keyboardHint = isHorizontalPagedMode
    ? txa('← → sayfa değiştir · F tam ekran · Home/End ilk ve son sayfa')
    : txa('← → bölüm değiştir · F tam ekran · Home/End hızlı kaydır')

  useEffect(() => {
    setCurrentPageIndex((current) => clamp(current, 0, Math.max(pages.length - 1, 0)))
  }, [pages.length])

  const toggleFs = useCallback(() => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => setIsFullscreen(false))
      return
    }
    document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => setIsFullscreen(false))
  }, [containerRef])

  const scrollToStart = useCallback(() => {
    if (isHorizontalPagedMode) {
      goToPage(0)
      return
    }
    getActiveScrollContainer()?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [getActiveScrollContainer, goToPage, isHorizontalPagedMode])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLInputElement
        || event.target instanceof HTMLTextAreaElement
        || event.target instanceof HTMLSelectElement
      ) {
        return
      }

      switch (event.key) {
        case 'ArrowLeft':
          event.preventDefault()
          handleBackward()
          break
        case 'ArrowRight':
        case ' ':
          event.preventDefault()
          handleForward()
          break
        case 'f':
        case 'F':
          event.preventDefault()
          toggleFs()
          break
        case 'Home':
          event.preventDefault()
          scrollToStart()
          break
        case 'End':
          event.preventDefault()
          if (isHorizontalPagedMode) {
            goToPage(Math.max(pages.length - 1, 0))
          } else {
            const activeContainer = getActiveScrollContainer()
            activeContainer?.scrollTo({ top: activeContainer.scrollHeight, behavior: 'smooth' })
          }
          break
        case 'Escape':
          if (isFullscreen) {
            document.exitFullscreen().then(() => setIsFullscreen(false))
          } else if (mangaId) {
            navigate(buildPublicMangaPath({ id: mangaId, slug: mangaSlug, title: mangaTitle }))
          }
          break
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [
    getActiveScrollContainer,
    goToPage,
    handleBackward,
    handleForward,
    isFullscreen,
    isHorizontalPagedMode,
    mangaId,
    mangaSlug,
    mangaTitle,
    navigate,
    pages.length,
    scrollToStart,
    toggleFs,
  ])

  useEffect(() => {
    if (isHorizontalPagedMode) {
      const progress = pages.length === 0 ? 0 : ((safePageIndex + 1) / pages.length) * 100
      setScrollProgress(clamp(progress, 0, 100))
      setHideBars(false)
      return
    }

    const element = contentRef.current
    if (!element) return

    let ticking = false
    const update = () => {
      const { scrollTop, scrollHeight, clientHeight } = element
      const isNearBottom = scrollHeight - clientHeight - scrollTop <= 12
      setScrollProgress(clamp((scrollTop / Math.max(scrollHeight - clientHeight, 1)) * 100, 0, 100))
      // Note: we do NOT stop auto scroll here. Lazy pages keep moving the bottom, and this
      // line was turning scrolling off in the first second. The stop decision belongs to the
      // rAF loop that verifies height has settled.
      if (autoScroll || showSettings || isNearBottom) {
        if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
        setHideBars(false)
        return
      }
      if (scrollTop > 30) {
        setHideBars(true)
        if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
        hideTimerRef.current = window.setTimeout(() => setHideBars(false), 300)
      } else {
        setHideBars(false)
      }
    }

    const onScroll = () => {
      if (ticking) return
      ticking = true
      requestAnimationFrame(() => {
        update()
        ticking = false
      })
    }

    element.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    update()

    return () => {
      element.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    }
  }, [autoScroll, contentRef, isHorizontalPagedMode, pages.length, safePageIndex, showSettings])

  useEffect(() => {
    if (isHorizontalPagedMode) return
    const root = contentRef.current
    const target = endRef.current
    if (!root || !target) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setAutoScroll(false)
      },
      { root, threshold: 0.98 },
    )

    observer.observe(target)
    return () => observer.disconnect()
  }, [contentRef, endRef, isHorizontalPagedMode, pages.length])

  // Hiz degisimi dongunun kendisini yeniden kurmasin diye ref uzerinden okunur;
  // aksi halde her hiz tiklamasinda rAF dongusu yikilip yeniden kuruluyordu.
  const autoScrollSpeedRef = useRef(autoScrollSpeed)
  useEffect(() => {
    autoScrollSpeedRef.current = autoScrollSpeed
  }, [autoScrollSpeed])

  useEffect(() => {
    if (isHorizontalPagedMode || !autoScroll) return
    const element = contentRef.current
    if (!element) return

    let animationId = 0
    let lastTick = performance.now()
    // Position accumulates as a FRACTION on the JS side. Reading it back from element.scrollTop each
    // frame loses sub-pixel progress per frame since the browser rounds to whole pixels,
    // and low speeds (60 px/s and below) did not move at all.
    let position = element.scrollTop
    // Settling counter watching whether content still grows: scrollHeight rises as lazy
    // pages arrive, so the bottom momentarily looks like the "end".
    let settledFrames = 0
    let lastScrollHeight = element.scrollHeight

    // Karar mantigi saf motorda (readerAutoScrollEngine): burada yalnizca
    // olcum alinir, sonuc uygulanir. Boylece davranis rAF'siz ortamda da
    // kare kare test edilebiliyor.
    const tick = (now: number) => {
      // Kullanici elle kaydirdiysa biriktirilen konumu DOM'a senkronize et.
      if (Math.abs(element.scrollTop - position) > 2) {
        position = element.scrollTop
      }

      const frame = computeAutoScrollFrame({
        scrollTop: position,
        scrollHeight: element.scrollHeight,
        clientHeight: element.clientHeight,
        speed: autoScrollSpeedRef.current,
        deltaMs: now - lastTick,
        lastScrollHeight,
        settledFrames,
      })
      lastTick = now
      settledFrames = frame.settledFrames
      lastScrollHeight = frame.lastScrollHeight

      if (frame.nextScrollTop !== null) {
        position = frame.nextScrollTop
        element.scrollTop = position
      }

      if (frame.shouldStop) {
        setAutoScroll(false)
        return
      }

      animationId = requestAnimationFrame(tick)
    }

    // Ignore accumulated time when returning to the tab.
    const handleVisibility = () => {
      if (!document.hidden) lastTick = performance.now()
    }
    document.addEventListener('visibilitychange', handleVisibility)

    animationId = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(animationId)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [autoScroll, contentRef, isHorizontalPagedMode])

  const zoomIn = useCallback(() => {
    const index = READER_ZOOM_LEVELS.indexOf(zoomLevel)
    if (index < READER_ZOOM_LEVELS.length - 1) {
      updatePreferences({ zoomLevel: READER_ZOOM_LEVELS[index + 1] })
    }
  }, [updatePreferences, zoomLevel])

  const zoomOut = useCallback(() => {
    const index = READER_ZOOM_LEVELS.indexOf(zoomLevel)
    if (index > 0) {
      updatePreferences({ zoomLevel: READER_ZOOM_LEVELS[index - 1] })
    }
  }, [updatePreferences, zoomLevel])

  return {
    autoScroll,
    autoScrollSpeed,
    backwardLabel,
    canGoBackward,
    canGoForward,
    currentPage,
    forwardLabel,
    goNextPage,
    goPrevPage,
    goToPage,
    handleBackward,
    handleForward,
    hideBars,
    imageFitMode,
    isFirstPage,
    isFullscreen,
    isHorizontalPagedMode,
    isLastPage,
    keyboardHint,
    readerChapterNumber,
    readerModeSummaryLabel,
    readerProgressLabel,
    safePageIndex,
    scrollProgress,
    scrollToStart,
    selectChapterNumber,
    setAutoScroll,
    setShowSettings,
    showSettings,
    sortedChapters,
    toggleFs,
    seamlessStrip,
    toggleSeamlessStrip: () => updatePreferences({ seamlessStrip: !seamlessStrip }),
    updateAutoScrollSpeed: (nextSpeed: number) => updatePreferences({ autoScrollSpeed: nextSpeed }),
    updateReaderImageFitMode,
    zoomIn,
    zoomLevel,
    zoomOut,
    zoomStyle,
  }
}
