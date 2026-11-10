/**
 * Runtime flags Reader v2 needs.
 *
 * Flags are read from the LIVE source and changes are listened to; no static assumption
 * is made. Default off: if a flag has not arrived the support strip does not show at chapter end,
 * then opens; the reverse (showing then removing) is a worse
 * experience.
 */

import { useEffect, useState } from 'react'
import { getRuntimeFeatureFlags, listenFeatureFlagUpdates } from '@/services/featureFlagService'

const READER_V2_FLAG_KEYS = [
  'boost.system',
  'economy.fansub_donations',
  'reader.comments',
  'moderation.reports',
] as const

export interface ReaderV2FeatureFlags {
  boostEnabled: boolean
  donationsEnabled: boolean
  commentsEnabled: boolean
  reportsEnabled: boolean
}

const DEFAULT_FLAGS: ReaderV2FeatureFlags = {
  boostEnabled: false,
  donationsEnabled: false,
  commentsEnabled: false,
  reportsEnabled: false,
}

export function useReaderV2FeatureFlags(): ReaderV2FeatureFlags {
  const [flags, setFlags] = useState<ReaderV2FeatureFlags>(DEFAULT_FLAGS)

  useEffect(() => {
    let cancelled = false

    const load = async (forceRefresh = false) => {
      const resolved = await getRuntimeFeatureFlags([...READER_V2_FLAG_KEYS], false, forceRefresh)
      if (cancelled) return
      setFlags({
        boostEnabled: resolved['boost.system'] === true,
        donationsEnabled: resolved['economy.fansub_donations'] === true,
        commentsEnabled: resolved['reader.comments'] === true,
        reportsEnabled: resolved['moderation.reports'] === true,
      })
    }

    void load()
    const unsubscribe = listenFeatureFlagUpdates((payload) => {
      if (!READER_V2_FLAG_KEYS.includes(payload.key as (typeof READER_V2_FLAG_KEYS)[number])) return
      void load(true)
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  return flags
}
