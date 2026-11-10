/**
 * Reader v2 control layer: keyboard, fullscreen, page/scroll commands.
 *
 * The SINGLE container principle applies here too: commands run on the same container by axis
 * (scrollLeft horizontally, scrollTop vertically). In v1 this logic was written
 * separately for two modes.
 */

import { useCallback, useEffect, useState, type RefObject } from 'react'
import type { ReaderV2Layout } from '@/pages/reader/readerV2LayoutEngine'

interface UseReaderV2ControlsArgs {
  containerRef: RefObject<HTMLDivElement | null>
  stageRef: RefObject<HTMLDivElement | null>
  layout: ReaderV2Layout
  onPreviousChapter: () => void
  onNextChapter: () => void
  onToggleSettings: () => void
  settingsOpen: boolean
  onCloseSettings: () => void
  onToggleAutoScroll: () => void
}

export function useReaderV2Controls({
  containerRef,
  stageRef,
  layout,
  onPreviousChapter,
  onNextChapter,
  onToggleSettings,
  settingsOpen,
  onCloseSettings,
  onToggleAutoScroll,
}: UseReaderV2ControlsArgs) {
  const [isFullscreen, setIsFullscreen] = useState(false)

  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const toggleFullscreen = useCallback(() => {
    const element = containerRef.current
    if (!element) return
    if (!document.fullscreenElement) {
      void element.requestFullscreen?.().catch(() => undefined)
      return
    }
    void document.exitFullscreen?.().catch(() => undefined)
  }, [containerRef])

  /** One screen forward/back: on the same container by axis. */
  const step = useCallback((direction: 1 | -1) => {
    const element = stageRef.current
    if (!element) return

    if (layout.axis === 'x') {
      const amount = element.clientWidth * direction
      element.scrollBy({ left: amount, behavior: 'smooth' })
      return
    }
    // Dikeyde tam ekran yerine %85: okunan satir kaybolmasin.
    element.scrollBy({ top: element.clientHeight * 0.85 * direction, behavior: 'smooth' })
  }, [layout.axis, stageRef])

  const goToStart = useCallback(() => {
    stageRef.current?.scrollTo({ top: 0, left: 0, behavior: 'smooth' })
  }, [stageRef])

  const goToEnd = useCallback(() => {
    const element = stageRef.current
    if (!element) return
    element.scrollTo({
      top: element.scrollHeight,
      left: element.scrollWidth,
      behavior: 'smooth',
    })
  }, [stageRef])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      // Shortcuts should not fire while typing in a comment/search field.
      if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) {
        return
      }

      switch (event.key) {
        case 'ArrowRight':
        case 'PageDown':
          event.preventDefault()
          step(1)
          break
        case 'ArrowLeft':
        case 'PageUp':
          event.preventDefault()
          step(-1)
          break
        case 'ArrowDown':
          if (layout.axis === 'x') return
          event.preventDefault()
          step(1)
          break
        case 'ArrowUp':
          if (layout.axis === 'x') return
          event.preventDefault()
          step(-1)
          break
        case ' ':
          event.preventDefault()
          step(event.shiftKey ? -1 : 1)
          break
        case 'Home':
          event.preventDefault()
          goToStart()
          break
        case 'End':
          event.preventDefault()
          goToEnd()
          break
        case 'f':
        case 'F':
          event.preventDefault()
          toggleFullscreen()
          break
        case 'n':
        case 'N':
          onNextChapter()
          break
        case 'p':
        case 'P':
          onPreviousChapter()
          break
        case 's':
        case 'S':
          onToggleSettings()
          break
        case 'a':
        case 'A':
          event.preventDefault()
          onToggleAutoScroll()
          break
        case 'Escape':
          if (settingsOpen) onCloseSettings()
          break
        default:
          break
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [
    goToEnd,
    goToStart,
    layout.axis,
    onCloseSettings,
    onNextChapter,
    onPreviousChapter,
    onToggleAutoScroll,
    onToggleSettings,
    settingsOpen,
    step,
    toggleFullscreen,
  ])

  return { isFullscreen, toggleFullscreen, step, goToStart, goToEnd }
}
