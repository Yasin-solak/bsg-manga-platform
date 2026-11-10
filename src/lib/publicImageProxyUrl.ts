const VIDEO_PATH_PATTERN = /\.(mp4|webm|ogg|mov)(?:$|[?#])/i
const IMAGE_WIDTH_BUCKETS = [48, 64, 96, 128, 160, 192, 240, 320, 480, 640, 768, 960, 1100, 1200, 1400] as const
const IMAGE_QUALITY_BUCKETS = [40, 48, 56, 64, 72, 78, 84, 90] as const
const ALLOWED_LOCAL_PREFIXES = ['/fansub/', '/covers/', '/backgrounds/'] as const

function normalizeBaseUrl(value: unknown): URL | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().replace(/\/+$/g, '')
  if (!trimmed || !/^https?:\/\//i.test(trimmed)) return null
  try {
    return new URL(trimmed)
  } catch {
    return null
  }
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, Math.round(value)))
}

function normalizeToBucket(value: number, buckets: readonly number[]) {
  const clamped = clamp(value, buckets[0], buckets[buckets.length - 1])
  return buckets.find((bucket) => clamped <= bucket) ?? buckets[buckets.length - 1]
}

function buildAllowedOrigins() {
  const origins = new Set<string>()
  if (typeof window !== 'undefined' && window.location?.origin) {
    origins.add(window.location.origin)
  }

  ;[
    import.meta.env.VITE_AVATAR_PUBLIC_BASE_URL,
    import.meta.env.VITE_STORE_ASSET_PUBLIC_BASE_URL,
    import.meta.env.VITE_MANGA_COVER_PUBLIC_BASE_URL,
    import.meta.env.VITE_CHAPTER_PAGE_PUBLIC_BASE_URL,
  ].forEach((value) => {
    const normalized = normalizeBaseUrl(value)
    if (normalized) origins.add(normalized.origin)
  })

  return origins
}

function isAllowedProxySource(value: string) {
  if (/^data:image\//i.test(value)) return true
  if (/^blob:/i.test(value)) return true
  if (value.startsWith('/')) {
    if (value.startsWith('//') || value.startsWith('/\\')) return false
    return ALLOWED_LOCAL_PREFIXES.some((prefix) => value.startsWith(prefix))
  }

  try {
    const requestOrigin = typeof window !== 'undefined' ? window.location?.origin ?? '' : ''
    const sourceUrl = requestOrigin
      ? new URL(value, requestOrigin)
      : new URL(value)
    const allowedOrigins = buildAllowedOrigins()
    if (!allowedOrigins.has(sourceUrl.origin)) return false
    if (requestOrigin && sourceUrl.origin === requestOrigin && sourceUrl.pathname === '/api/public-image') return false
    if (requestOrigin && sourceUrl.origin === requestOrigin) {
      return ALLOWED_LOCAL_PREFIXES.some((prefix) => sourceUrl.pathname.startsWith(prefix))
    }
    return true
  } catch {
    return false
  }
}

export function buildPublicImageProxyUrl(
  value?: string | null,
  width = 160,
  quality = 72,
): string | undefined {
  if (!value) return undefined

  const trimmed = value.trim()
  if (!trimmed) return undefined
  if (/^data:image\//i.test(trimmed) || /^blob:/i.test(trimmed)) return trimmed
  if (VIDEO_PATH_PATTERN.test(trimmed)) return undefined
  if (!isAllowedProxySource(trimmed)) return undefined

  const params = new URLSearchParams({
    src: trimmed,
    w: String(normalizeToBucket(width, IMAGE_WIDTH_BUCKETS)),
    q: String(normalizeToBucket(quality, IMAGE_QUALITY_BUCKETS)),
  })

  return `/api/public-image?${params.toString()}`
}
