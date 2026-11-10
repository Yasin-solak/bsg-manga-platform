/**
 * Thin layer tying the layout engine to the component.
 *
 * Responsibility: gathering measures (viewport + page ratios) and calling the engine.
 * Decision logic is NOT HERE: the engine must stay pure to be testable.
 *
 * Page ratios: `chapters.pages` carries only a URL list today, with no size
 * info, so they are measured from the first loaded images. Writing sizes in the upload flow
 * comes in a separate phase (plan Section 10); then the right layout builds on the first frame
 * without waiting for measurement.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  resolveReaderV2Layout,
  type ReaderV2FitMode,
  type ReaderV2Layout,
  type ReaderV2ModePreference,
} from '@/pages/reader/readerV2LayoutEngine'

interface UseReaderV2LayoutArgs {
  pageCount: number
  modePreference: ReaderV2ModePreference
  fitMode: ReaderV2FitMode
  seamless: boolean
}

interface UseReaderV2LayoutResult {
  layout: ReaderV2Layout
  /** Reports a ratio as images load; the first few pages are enough. */
  reportPageAspect: (index: number, width: number, height: number) => void
}

/** The first few pages are enough for the decision; waiting for all is needless delay. */
const ASPECT_SAMPLE_SIZE = 3

export function useReaderV2Layout({
  pageCount,
  modePreference,
  fitMode,
  seamless,
}: UseReaderV2LayoutArgs): UseReaderV2LayoutResult {
  const [pageAspects, setPageAspects] = useState<number[]>([])
  const [viewport, setViewport] = useState(() => ({
    width: typeof window === 'undefined' ? 1280 : window.innerWidth,
    height: typeof window === 'undefined' ? 800 : window.innerHeight,
  }))

  useEffect(() => {
    if (typeof window === 'undefined') return
    const onResize = () => setViewport({ width: window.innerWidth, height: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Measurements must reset on chapter change; otherwise the wrong mode is picked
  // with the previous chapter's ratios.
  useEffect(() => {
    setPageAspects([])
  }, [pageCount])

  const reportPageAspect = useCallback((index: number, width: number, height: number) => {
    if (index >= ASPECT_SAMPLE_SIZE) return
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return
    setPageAspects((previous) => {
      if (previous.length >= ASPECT_SAMPLE_SIZE) return previous
      return [...previous, height / width]
    })
  }, [])

  const layout = useMemo(
    () => resolveReaderV2Layout({ pageAspects, viewport, modePreference, fitMode, seamless }),
    [fitMode, modePreference, pageAspects, seamless, viewport],
  )

  return { layout, reportPageAspect }
}
