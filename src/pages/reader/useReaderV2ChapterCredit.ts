/**
 * Closing credit v2 data layer.
 *
 * NO new RPC: uses the existing three (boost snapshot + effective credit config +
 * supporter preview). Unlike v1 it requests the supporter list by the fansub's own
 * `maxSupporterCount` setting; v1 was limited to two.
 *
 * Credit data belongs to chapter end, so it is fetched when the chapter end sequence first
 * appears (`active`), not at reading start; on short chapters too no request fires
 * before reaching the bottom of the screen.
 */

import { useEffect, useState } from 'react'
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
import { createScopedLogger } from '@/services/logger'

const readerV2CreditLogger = createScopedLogger('ReaderV2ChapterCredit')

interface UseReaderV2ChapterCreditArgs {
  fansubId: string | null | undefined
  chapterId: string | null | undefined
  boostEnabled: boolean
  /** No request until chapter end is visible. */
  active: boolean
  /** Data is refetched when this changes (refresh after boost/donation). */
  refreshToken?: number
}

export interface ReaderV2ChapterCreditData {
  snapshot: FansubBoostSnapshot | null
  config: EffectivePublicFansubChapterCreditConfig | null
  supporters: FansubBoostSupporterPreview[]
  isLoading: boolean
}

export function useReaderV2ChapterCredit({
  fansubId,
  chapterId,
  boostEnabled,
  active,
  refreshToken = 0,
}: UseReaderV2ChapterCreditArgs): ReaderV2ChapterCreditData {
  const [snapshot, setSnapshot] = useState<FansubBoostSnapshot | null>(null)
  const [config, setConfig] = useState<EffectivePublicFansubChapterCreditConfig | null>(null)
  const [supporters, setSupporters] = useState<FansubBoostSupporterPreview[]>([])
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (!fansubId || !chapterId || !boostEnabled || !active) {
      setSnapshot(null)
      setConfig(null)
      setSupporters([])
      setIsLoading(false)
      return
    }

    let alive = true
    const controller = new AbortController()
    setIsLoading(true)

    void (async () => {
      try {
        const [snapshotResult, configResult] = await Promise.allSettled([
          getPublicFansubBoostSnapshot(fansubId, controller.signal),
          getEffectivePublicFansubChapterCreditConfig(fansubId, chapterId),
        ])
        if (!alive) return

        const nextSnapshot = snapshotResult.status === 'fulfilled' ? snapshotResult.value : null
        const nextConfig = configResult.status === 'fulfilled' ? configResult.value : null

        if (snapshotResult.status === 'rejected') {
          readerV2CreditLogger.error({ event: 'credit-snapshot-error', error: snapshotResult.reason })
        }
        if (configResult.status === 'rejected') {
          readerV2CreditLogger.error({ event: 'credit-config-error', error: configResult.reason })
        }

        setSnapshot(nextSnapshot)
        setConfig(nextConfig)

        if (!nextConfig?.showSupporters) {
          setSupporters([])
          return
        }

        // As many supporters as the fansub set are requested (v1 was limited to two).
        const preview = await listPublicFansubBoostSupportersPreview(
          fansubId,
          Math.max(1, nextConfig.maxSupporterCount),
          controller.signal,
        )
        if (!alive) return
        setSupporters(preview)
      } catch (error) {
        if (!alive) return
        readerV2CreditLogger.error({ event: 'credit-load-error', error })
        setSnapshot(null)
        setConfig(null)
        setSupporters([])
      } finally {
        if (alive) setIsLoading(false)
      }
    })()

    return () => {
      alive = false
      controller.abort()
    }
  }, [active, boostEnabled, chapterId, fansubId, refreshToken])

  return { snapshot, config, supporters, isLoading }
}
