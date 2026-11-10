const ALLOWED_LOCAL_PREFIXES = [
  '/fansub/',
  '/covers/',
  '/backgrounds/',
]
const IMAGE_WIDTH_BUCKETS = [48, 64, 96, 128, 160, 192, 240, 320, 480, 640, 768, 960, 1100, 1200, 1400]
const IMAGE_QUALITY_BUCKETS = [40, 48, 56, 64, 72, 78, 84, 90]
const TRANSFORM_RATE_LIMIT_WINDOW_SECONDS = 60
const TRANSFORM_RATE_LIMIT_LONG_WINDOW_SECONDS = 10 * 60
const TRANSFORM_RATE_LIMIT_MAX_PER_IP = 240
const TRANSFORM_RATE_LIMIT_LONG_MAX_PER_IP = 1600
const MISSING_IMAGE_PLACEHOLDER_SVG = [
  '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1" viewBox="0 0 1 1">',
  '<rect width="1" height="1" fill="transparent"/>',
  '</svg>',
].join('')

const VIDEO_PATH_PATTERN = /\.(mp4|webm|ogg|mov)(?:$|[?#])/i

function applySecurityHeaders(headers) {
  headers.set('x-content-type-options', 'nosniff')
  headers.set('referrer-policy', 'strict-origin-when-cross-origin')
  return headers
}

function normalizeBaseUrl(value) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().replace(/\/+$/g, '')
  if (!trimmed || !/^https?:\/\//i.test(trimmed)) return null
  try {
    return new URL(trimmed)
  } catch {
    return null
  }
}

function clamp(value, min, max) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return min
  return Math.min(max, Math.max(min, Math.round(parsed)))
}

function normalizeToBucket(value, buckets) {
  const clamped = clamp(value, buckets[0], buckets[buckets.length - 1])
  return buckets.find((bucket) => clamped <= bucket) ?? buckets[buckets.length - 1]
}

function sanitizeKeySegment(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9:_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 160)
}

function getWindowStart(now, windowSeconds) {
  return Math.floor(now / (windowSeconds * 1000)) * windowSeconds
}

function resolveClientIp(request) {
  const forwardedIp = request.headers.get('cf-connecting-ip')
    || request.headers.get('x-forwarded-for')
    || request.headers.get('x-real-ip')
  if (!forwardedIp) return 'unknown-ip'
  return forwardedIp.split(',')[0].trim() || 'unknown-ip'
}

function getRateLimitNamespace(env) {
  if (!env || typeof env !== 'object') return null
  if (!env.UPLOAD_GUARD_KV || typeof env.UPLOAD_GUARD_KV.get !== 'function') return null
  return env.UPLOAD_GUARD_KV
}

function parseStoredCounter(rawValue) {
  if (!rawValue) return { count: 0 }

  try {
    const parsed = JSON.parse(rawValue)
    const count = Number(parsed?.count)
    return {
      count: Number.isFinite(count) && count > 0 ? count : 0,
    }
  } catch {
    return { count: 0 }
  }
}

async function readCounter(namespace, key) {
  const rawValue = await namespace.get(key)
  return parseStoredCounter(rawValue)
}

async function writeCounter(namespace, key, count, windowSeconds) {
  await namespace.put(
    key,
    JSON.stringify({ count, updatedAt: Date.now() }),
    {
      expirationTtl: windowSeconds + 60,
    },
  )
}

function buildCounterKey(scope, target, windowStart, windowSeconds) {
  return [
    'public-image-rate-limit',
    sanitizeKeySegment(scope),
    sanitizeKeySegment(target),
    `w${windowSeconds}`,
    `t${windowStart}`,
  ].join(':')
}

function getRetryAfterSeconds(windowStart, windowSeconds, now) {
  return Math.max(
    1,
    Math.ceil(((windowStart + windowSeconds) * 1000 - now) / 1000),
  )
}

function buildCanonicalRequestUrl(requestUrl, rawSource, width, quality) {
  const canonicalUrl = new URL(requestUrl)
  canonicalUrl.search = ''
  canonicalUrl.searchParams.set('src', rawSource.trim())
  canonicalUrl.searchParams.set('w', String(width))
  canonicalUrl.searchParams.set('q', String(quality))
  return canonicalUrl
}

function isCanonicalRequestUrl(requestUrl, canonicalUrl) {
  return requestUrl.pathname === canonicalUrl.pathname && requestUrl.search === canonicalUrl.search
}

async function assertTransformRateLimit(context) {
  const namespace = getRateLimitNamespace(context.env)
  if (!namespace) return null

  const clientIp = resolveClientIp(context.request)
  if (!clientIp || clientIp === 'unknown-ip') return null

  const now = Date.now()
  const windows = [
    {
      windowSeconds: TRANSFORM_RATE_LIMIT_WINDOW_SECONDS,
      maxPerIp: TRANSFORM_RATE_LIMIT_MAX_PER_IP,
    },
    {
      windowSeconds: TRANSFORM_RATE_LIMIT_LONG_WINDOW_SECONDS,
      maxPerIp: TRANSFORM_RATE_LIMIT_LONG_MAX_PER_IP,
    },
  ]

  const snapshots = []
  for (const window of windows) {
    const windowStart = getWindowStart(now, window.windowSeconds)
    const key = buildCounterKey('ip', clientIp, windowStart, window.windowSeconds)
    const counter = await readCounter(namespace, key)
    if (counter.count >= window.maxPerIp) {
      return new Response('Too Many Requests', {
        status: 429,
        headers: {
          'Retry-After': String(getRetryAfterSeconds(windowStart, window.windowSeconds, now)),
          'Cache-Control': 'private, no-store',
        },
      })
    }

    snapshots.push({
      key,
      nextCount: counter.count + 1,
      windowSeconds: window.windowSeconds,
    })
  }

  for (const snapshot of snapshots) {
    // Why: this endpoint is public; a high ceiling with a two-window counter curbs the cost of spam transforms.
    await writeCounter(namespace, snapshot.key, snapshot.nextCount, snapshot.windowSeconds)
  }

  return null
}

function buildAllowedOrigins(requestUrl, env) {
  const origins = new Set([requestUrl.origin])
  ;[
    env.VITE_AVATAR_PUBLIC_BASE_URL,
    env.VITE_STORE_ASSET_PUBLIC_BASE_URL,
    env.VITE_MANGA_COVER_PUBLIC_BASE_URL,
    env.VITE_CHAPTER_PAGE_PUBLIC_BASE_URL,
  ].forEach((value) => {
    const normalized = normalizeBaseUrl(value)
    if (normalized) origins.add(normalized.origin)
  })
  return origins
}

function isAllowedSourceUrl(sourceUrl, requestUrl, allowedOrigins) {
  if (!allowedOrigins.has(sourceUrl.origin)) return false
  if (sourceUrl.origin !== requestUrl.origin) return true
  if (sourceUrl.pathname === requestUrl.pathname) return false
  return ALLOWED_LOCAL_PREFIXES.some((prefix) => sourceUrl.pathname.startsWith(prefix))
}

function buildMissingImageFallbackResponse(request, upstreamStatus) {
  const headers = new Headers()
  headers.set('cache-control', 'public, max-age=300, s-maxage=1800, stale-while-revalidate=300')
  headers.set('content-type', 'image/svg+xml; charset=utf-8')
  headers.set('x-public-image-fallback', 'not-found')
  headers.set('x-public-image-upstream-status', String(upstreamStatus))
  applySecurityHeaders(headers)

  return new Response(
    request.method === 'HEAD' ? null : MISSING_IMAGE_PLACEHOLDER_SVG,
    {
      status: 200,
      headers,
    },
  )
}

async function handleRequest(context) {
  const requestUrl = new URL(context.request.url)
  const rawSource = requestUrl.searchParams.get('src') || ''
  if (!rawSource.trim()) {
    return new Response('Missing src', { status: 400 })
  }

  let sourceUrl
  try {
    sourceUrl = new URL(rawSource, requestUrl)
  } catch {
    return new Response('Invalid src', { status: 400 })
  }

  if (!/^https?:$/i.test(sourceUrl.protocol)) {
    return new Response('Unsupported src protocol', { status: 400 })
  }

  if (VIDEO_PATH_PATTERN.test(sourceUrl.pathname)) {
    return new Response('Video sources are not supported', { status: 415 })
  }

  const allowedOrigins = buildAllowedOrigins(requestUrl, context.env)
  if (!isAllowedSourceUrl(sourceUrl, requestUrl, allowedOrigins)) {
    return new Response('Source not allowed', { status: 403 })
  }

  const width = normalizeToBucket(requestUrl.searchParams.get('w') || 160, IMAGE_WIDTH_BUCKETS)
  const quality = normalizeToBucket(requestUrl.searchParams.get('q') || 72, IMAGE_QUALITY_BUCKETS)
  const canonicalUrl = buildCanonicalRequestUrl(requestUrl, rawSource, width, quality)

  if (!isCanonicalRequestUrl(requestUrl, canonicalUrl)) {
    return new Response(null, {
      status: 301,
      headers: applySecurityHeaders(new Headers({
        location: canonicalUrl.toString(),
        'cache-control': 'public, max-age=86400, s-maxage=86400',
      })),
    })
  }

  const rateLimitResponse = await assertTransformRateLimit(context)
  if (rateLimitResponse) return rateLimitResponse

  const upstream = await fetch(sourceUrl.toString(), {
    headers: {
      accept: 'image/avif,image/webp,image/*,*/*;q=0.8',
    },
    cf: {
      image: {
        width,
        quality,
        fit: 'scale-down',
        format: 'webp',
        metadata: 'none',
      },
    },
  })

  if (upstream.status === 404) {
    return buildMissingImageFallbackResponse(context.request, upstream.status)
  }

  if (!upstream.ok || !upstream.body) {
    return new Response('Image unavailable', {
      status: 502,
      headers: applySecurityHeaders(new Headers()),
    })
  }

  const upstreamContentType = upstream.headers.get('content-type') || ''
  if (!/^image\//i.test(upstreamContentType)) {
    return new Response('Unsupported image content type', {
      status: 415,
      headers: applySecurityHeaders(new Headers()),
    })
  }

  const headers = new Headers(upstream.headers)
  headers.set('cache-control', 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400')
  headers.delete('set-cookie')
  applySecurityHeaders(headers)

  return new Response(
    context.request.method === 'HEAD' ? null : upstream.body,
    {
      status: upstream.status,
      headers,
    },
  )
}

export const onRequestGet = handleRequest
export const onRequestHead = handleRequest

export function onRequest() {
  return new Response('Method Not Allowed', {
    status: 405,
    headers: applySecurityHeaders(new Headers({
      allow: 'GET, HEAD',
    })),
  })
}


