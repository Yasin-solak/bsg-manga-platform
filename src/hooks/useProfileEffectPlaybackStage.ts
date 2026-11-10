import { useEffect, useState } from 'react'

import type { ProfileEffectMediaKind } from '@/data/storeProducts'

export type ProfileEffectPlaybackStage = 'asset' | 'intro' | 'intro-exit' | 'loop'

interface UseProfileEffectPlaybackStageOptions {
  active: boolean
  introUrl?: string | null
  introType?: 'image' | 'video' | null
  introKind?: ProfileEffectMediaKind | null
  introDurationMs?: number | null
  loopUrl?: string | null
}

function normalizeIntroDurationMs(kind?: ProfileEffectMediaKind | null, durationMs?: number | null) {
  if (typeof durationMs === 'number' && durationMs > 0) {
    // Video metadata duration can be slightly shorter than visible playback.
    // We already advance as soon as `ended` fires; this buffer only prevents early cuts.
    if (kind === 'video') {
      return durationMs + Math.min(900, Math.max(280, Math.round(durationMs * 0.12)))
    }

    if (kind === 'animated-image') {
      return durationMs + 80
    }

    return durationMs
  }
  if (kind === 'video') return null
  return 1200
}

const INTRO_EXIT_FADE_MS = 180

export function useProfileEffectPlaybackStage({
  active,
  introUrl,
  introType,
  introKind,
  introDurationMs,
  loopUrl,
}: UseProfileEffectPlaybackStageOptions) {
  const [stage, setStage] = useState<ProfileEffectPlaybackStage>('asset')
  const [instanceKey, setInstanceKey] = useState(0)
  const [introReadyKey, setIntroReadyKey] = useState(0)

  useEffect(() => {
    if (!active) {
      setStage('asset')
      setIntroReadyKey(0)
      setInstanceKey((current) => current + 1)
      return
    }

    const hasDedicatedIntro = Boolean(introUrl && introUrl !== loopUrl)
    if (hasDedicatedIntro) {
      setStage('intro')
      setIntroReadyKey(0)
      setInstanceKey((current) => current + 1)
      return
    }

    if (loopUrl) {
      setStage('loop')
      setIntroReadyKey(0)
      setInstanceKey((current) => current + 1)
      return
    }

    setStage('asset')
    setIntroReadyKey(0)
    setInstanceKey((current) => current + 1)
  }, [active, introUrl, loopUrl])

  useEffect(() => {
    if (stage !== 'intro') return undefined
    if (introReadyKey === 0) return undefined

    const delayMs = normalizeIntroDurationMs(introKind, introDurationMs)
    if (!delayMs) return undefined

    const timeout = window.setTimeout(() => {
      setStage(loopUrl ? 'loop' : 'asset')
      setInstanceKey((current) => current + 1)
    }, delayMs)

    return () => window.clearTimeout(timeout)
  }, [introDurationMs, introKind, introReadyKey, introType, loopUrl, stage])

  useEffect(() => {
    if (stage !== 'intro-exit') return undefined

    const timeout = window.setTimeout(() => {
      setStage(loopUrl ? 'loop' : 'asset')
      setInstanceKey((current) => current + 1)
    }, INTRO_EXIT_FADE_MS)

    return () => window.clearTimeout(timeout)
  }, [loopUrl, stage])

  const markIntroPlaybackReady = () => {
    if (stage !== 'intro') return
    setIntroReadyKey((current) => (current === 0 ? 1 : current))
  }

  const beginIntroExit = () => {
    setIntroReadyKey(0)
    setStage('intro-exit')
  }

  const handleIntroPlaybackComplete = () => {
    beginIntroExit()
  }

  const handleIntroPlaybackError = () => {
    setIntroReadyKey(0)
    setStage('asset')
    setInstanceKey((current) => current + 1)
  }

  return {
    stage,
    instanceKey,
    markIntroPlaybackReady,
    handleIntroPlaybackComplete,
    handleIntroPlaybackError,
  }
}

export default useProfileEffectPlaybackStage
