/**
 * Gathering page aspect ratios.
 *
 * The sample the layout engine (useReaderV2Layout) gathers is SEPARATE work: it looks at the first
 * few pages to decide strip/page mode. This keeps EVERY page's ratio, since space
 * reservation (aspect-ratio) is per page.
 *
 * Measuring is only the fallback path: if size was written to the DB at upload, the right space
 * is reserved on the first frame with no jumping at all.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { resolveReaderV2AspectRatios } from '@/pages/reader/readerV2PreloadEngine'

interface UseReaderV2PageAspectsArgs {
  pageCount: number
  /** Bolum degisince olcumler sifirlanir. */
  resetKey: string
  /** Ratios saved at upload (index aligned); otherwise an empty array. */
  knownRatios: Array<number | null>
}

export function useReaderV2PageAspects({
  pageCount,
  resetKey,
  knownRatios,
}: UseReaderV2PageAspectsArgs) {
  const [measuredRatios, setMeasuredRatios] = useState<Array<number | null>>([])

  useEffect(() => {
    setMeasuredRatios([])
  }, [resetKey])

  const reportAspect = useCallback((index: number, width: number, height: number) => {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return
    setMeasuredRatios((previous) => {
      if (previous[index] === width / height) return previous
      const next = [...previous]
      next[index] = width / height
      return next
    })
  }, [])

  const aspectRatios = useMemo(
    () => resolveReaderV2AspectRatios({ pageCount, knownRatios, measuredRatios }),
    [knownRatios, measuredRatios, pageCount],
  )

  return { aspectRatios, reportAspect }
}
