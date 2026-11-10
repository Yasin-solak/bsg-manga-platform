import { useEffect, useState } from 'react'
import { studioAccessToken } from '@/services/studioAuth'
import { rawPageUrl } from '@/services/translationStudioService'

/**
 * Raw pages are in private R2; <img src> cannot carry an auth header. The image is fetched with
 * authorization, converted to a blob URL and released when the component unmounts.
 */
export function useRawThumbnail(pageId: string | null): string | null {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!pageId) {
      setUrl(null)
      return undefined
    }
    const controller = new AbortController()
    let objectUrl: string | null = null
    void (async () => {
      const token = await studioAccessToken().catch(() => null)
      if (!token || controller.signal.aborted) return
      const response = await fetch(rawPageUrl(pageId), {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      }).catch(() => null)
      if (!response?.ok || controller.signal.aborted) return
      objectUrl = URL.createObjectURL(await response.blob())
      if (controller.signal.aborted) URL.revokeObjectURL(objectUrl)
      else setUrl(objectUrl)
      // Kesilen istek ya da bozuk gorsel: onizleme bos kalir, akis etkilenmez.
    })().catch(() => {})
    return () => {
      controller.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [pageId])

  return url
}
