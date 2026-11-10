import { useEffect, useState } from 'react'

const posterCache = new Map<string, string>()
const posterInFlight = new Map<string, Promise<string | undefined>>()

function buildStorageStillUrl(url?: string) {
  if (!url) return undefined

  try {
    const parsed = new URL(url)
    if (!parsed.pathname.includes('/storage/v1/object/public/')) return url

    parsed.searchParams.set('format', 'png')
    if (!parsed.searchParams.has('width')) parsed.searchParams.set('width', '640')
    return parsed.toString()
  } catch {
    return url
  }
}

function canRasterizeInlinePoster(url: string, fallbackUrl?: string) {
  if (typeof window === 'undefined') return false
  if (fallbackUrl && fallbackUrl !== url) return false

  try {
    const resolved = new URL(url, window.location.origin)
    return resolved.origin === window.location.origin
  } catch {
    return false
  }
}

export function useAvatarFrameIdleAssetPoster(url?: string) {
  const fallbackUrl = buildStorageStillUrl(url)
  const [posterUrl, setPosterUrl] = useState<string | undefined>(() => {
    if (!url) return undefined
    return posterCache.get(url) || fallbackUrl
  })

  useEffect(() => {
    if (!url) {
      setPosterUrl(undefined)
      return
    }

    const cached = posterCache.get(url)
    if (cached) {
      setPosterUrl(cached)
      return
    }

    const nextPosterUrl = fallbackUrl || url
    setPosterUrl(nextPosterUrl)

    // When Cloudflare R2 dev/public origins differ, this rasterize request hits CORS.
    // Rather than retrying fetches we use and cache the fallback poster directly.
    if (
      typeof window === 'undefined'
      || typeof createImageBitmap !== 'function'
      || !canRasterizeInlinePoster(url, fallbackUrl)
    ) {
      if (nextPosterUrl) posterCache.set(url, nextPosterUrl)
      return
    }

    let active = true

    void (async () => {
      try {
        let inFlight = posterInFlight.get(url)
        if (!inFlight) {
          inFlight = (async () => {
            const response = await fetch(url, { mode: 'cors' })
            if (!response.ok) throw new Error(`Poster fetch basarisiz: ${response.status}`)

            const blob = await response.blob()
            const bitmap = await createImageBitmap(blob)

            try {
              const canvas = document.createElement('canvas')
              canvas.width = bitmap.width
              canvas.height = bitmap.height

              const context = canvas.getContext('2d', { alpha: true })
              if (!context) throw new Error('Poster canvas context olusturulamadi.')

              context.clearRect(0, 0, canvas.width, canvas.height)
              context.drawImage(bitmap, 0, 0)

              const dataUrl = canvas.toDataURL('image/png')
              posterCache.set(url, dataUrl)
              return dataUrl
            } finally {
              bitmap.close()
              posterInFlight.delete(url)
            }
          })()
          posterInFlight.set(url, inFlight)
        }

        const resolvedPosterUrl = await inFlight
        if (resolvedPosterUrl && active) setPosterUrl(resolvedPosterUrl)
      } catch {
        posterInFlight.delete(url)
        if (nextPosterUrl) posterCache.set(url, nextPosterUrl)
        if (active) setPosterUrl(nextPosterUrl)
      }
    })()

    return () => {
      active = false
    }
  }, [fallbackUrl, url])

  return posterUrl
}
