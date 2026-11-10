import { buildCoverPlaceholder } from '@/lib/coverPlaceholder'
import { optimizePublicImageUrl } from '@/lib/optimizedPublicImageUrl'
import { buildPublicImageProxyUrl } from '@/lib/publicImageProxyUrl'

export function resolveProfileSurfaceImage(
  value?: string | null,
  width = 320,
  quality = 72,
) {
  if (!value) return undefined

  const trimmed = value.trim()
  if (!trimmed) return undefined

  if (/^data:image\//i.test(trimmed) || /^blob:/i.test(trimmed) || (trimmed.startsWith('/') && !trimmed.startsWith('//') && !trimmed.startsWith('/\\'))) {
    return trimmed
  }

  return (
    buildPublicImageProxyUrl(trimmed, width, quality)
    || optimizePublicImageUrl(trimmed)
  )
}

/** Cover on profile tabs: a local placeholder if there is no image. */
export function profileCover(value: string | undefined | null, title: string, width = 240) {
  return resolveProfileSurfaceImage(value, width) || buildCoverPlaceholder(title)
}
