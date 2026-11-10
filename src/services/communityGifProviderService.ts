import type { CommunityGifSelection } from '@types'
import { withServiceTimeout } from './apiResilience'
import { createScopedLogger } from './logger'
import { createRequestContext, toRequestContextLogContext } from './requestContext'
import { toUserFacingErrorMessage } from './userFacingError'

const TENOR_API_KEY = import.meta.env.VITE_TENOR_API_KEY as string | undefined
const TENOR_CLIENT_KEY = (import.meta.env.VITE_TENOR_CLIENT_KEY as string | undefined) || 'bsgmanga-web'
const TENOR_SEARCH_URL = 'https://tenor.googleapis.com/v2/search'
const communityGifLogger = createScopedLogger('communityGifProviderService')

type TenorSearchResponse = {
  results?: Array<{
    id: string
    content_description?: string
    media_formats?: {
      gif?: {
        url?: string
        dims?: [number, number]
      }
      tinygif?: {
        url?: string
        dims?: [number, number]
      }
      mediumgif?: {
        url?: string
        dims?: [number, number]
      }
    }
  }>
}

export function isCommunityGifProviderConfigured() {
  return Boolean(TENOR_API_KEY)
}

export async function searchCommunityGifProvider(query: string, limit = 12): Promise<CommunityGifSelection[]> {
  const normalizedQuery = query.trim()
  if (!normalizedQuery || !TENOR_API_KEY) return []

  const requestContext = createRequestContext('communityGifProviderService', 'searchCommunityGifProvider', {
    query: normalizedQuery,
    limit,
  })

  try {
    const url = new URL(TENOR_SEARCH_URL)
    url.searchParams.set('key', TENOR_API_KEY)
    url.searchParams.set('client_key', TENOR_CLIENT_KEY)
    url.searchParams.set('q', normalizedQuery)
    url.searchParams.set('limit', String(Math.min(Math.max(limit, 1), 24)))
    url.searchParams.set('media_filter', 'minimal')
    url.searchParams.set('contentfilter', 'medium')

    const response = await withServiceTimeout(
      (signal) => fetch(url, { signal }),
      { label: 'communityGifProviderService.search' },
    )
    if (!response.ok) {
      throw new Error(`GIF arama saglayicisi ${response.status} dondu.`)
    }

    const payload = await response.json() as TenorSearchResponse
    const results: CommunityGifSelection[] = []

    for (const item of payload.results || []) {
        const media = item.media_formats?.gif || item.media_formats?.mediumgif || item.media_formats?.tinygif
        const preview = item.media_formats?.tinygif || item.media_formats?.mediumgif || item.media_formats?.gif
        if (!media?.url || !preview?.url) continue
        results.push({
          provider: 'tenor' as const,
          providerAssetId: item.id,
          originalUrl: media.url,
          previewUrl: preview.url,
          width: Number(media.dims?.[0] || preview.dims?.[0] || 0),
          height: Number(media.dims?.[1] || preview.dims?.[1] || 0),
          altText: item.content_description || undefined,
        })
    }

    return results
  } catch (error) {
    communityGifLogger.warn({
      event: requestContext.event,
      message: toUserFacingErrorMessage(error, 'GIF onerileri su anda getirilemedi.'),
      context: toRequestContextLogContext(requestContext),
      error,
    })
    return []
  }
}
