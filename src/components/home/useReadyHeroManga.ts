import { useEffect, useState } from 'react'
import type { Manga } from '@/types'
import { optimizePublicImageUrl } from '@/lib/optimizedPublicImageUrl'
import { buildCoverPlaceholder } from '@/lib/coverPlaceholder'

// The current showcase is not removed until the next cover resolves; text and image switch together.
export function useReadyHeroManga(requested: Manga | null) {
  const [ready, setReady] = useState<Manga | null>(null)
  const source = requested
    ? optimizePublicImageUrl(requested.coverImage) || requested.coverImage || buildCoverPlaceholder(requested.title)
    : ''
  useEffect(() => {
    if (!requested) { setReady(null); return }
    let cancelled = false
    const image = new Image()
    image.fetchPriority = 'high'
    const commit = async () => {
      try { await image.decode() } catch { /* onload sonrası decode desteği zorunlu değil. */ }
      if (!cancelled) setReady({ ...requested, coverImage: image.src })
    }
    image.onload = () => { void commit() }
    image.onerror = () => {
      image.onerror = null
      image.src = buildCoverPlaceholder(requested.title)
    }
    image.src = source
    return () => { cancelled = true; image.onload = null; image.onerror = null }
  }, [requested, source])
  return ready
}
