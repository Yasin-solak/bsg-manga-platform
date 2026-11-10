const RATE_LIMIT_WINDOW_SECONDS = 10 * 60
const RATE_LIMIT_BURST_WINDOW_SECONDS = 60
const UPLOAD_REPLAY_TTL_SECONDS = 45

export const UPLOAD_RATE_LIMIT_POLICIES = {
  'announcement-image': {
    maxPerUser: 30,
    maxPerIp: 60,
    message: 'Duyuru görseli yükleme sınırına ulaşıldı. Biraz sonra tekrar deneyin.',
  },
  'user-avatar': {
    maxPerUser: 12,
    maxPerIp: 30,
    message: 'Avatar yukleme limiti gecici olarak asildi. Lutfen biraz sonra tekrar deneyin.',
  },
  'draft-fansub-avatar': {
    maxPerUser: 12,
    maxPerIp: 30,
    message: 'Fansub avatar yukleme limiti gecici olarak asildi. Lutfen biraz sonra tekrar deneyin.',
  },
  'fansub-avatar': {
    maxPerUser: 18,
    maxPerIp: 36,
    message: 'Fansub avatar yukleme limiti gecici olarak asildi. Lutfen biraz sonra tekrar deneyin.',
  },
  'fansub-profile-background': {
    maxPerUser: 16,
    maxPerIp: 32,
    message: 'Fansub arka plani yukleme limiti gecici olarak asildi. Lutfen biraz sonra tekrar deneyin.',
  },
  'user-profile-background': {
    maxPerUser: 16,
    maxPerIp: 32,
    message: 'Profil arka plani yukleme limiti gecici olarak asildi. Lutfen biraz sonra tekrar deneyin.',
  },
  'manga-cover': {
    maxPerUser: 24,
    maxPerIp: 48,
    message: 'Manga kapagi yukleme limiti gecici olarak asildi. Lutfen biraz sonra tekrar deneyin.',
  },
  'store-asset': {
    maxPerUser: 48,
    maxPerIp: 80,
    message: 'Store asset yukleme limiti gecici olarak asildi. Lutfen biraz sonra tekrar deneyin.',
  },
  'profile-effect-asset': {
    maxPerUser: 48,
    maxPerIp: 80,
    message: 'Profil effect asset yukleme limiti gecici olarak asildi. Lutfen biraz sonra tekrar deneyin.',
  },
  'storefront-visual': {
    maxPerUser: 30,
    maxPerIp: 60,
    message: 'Storefront gorsel yukleme limiti gecici olarak asildi. Lutfen biraz sonra tekrar deneyin.',
  },
  'chapter-page': {
    // Why: page uploads come in bulk, so a softer threshold is needed.
    maxPerUser: 360,
    maxPerIp: 600,
    message: 'Bolum sayfasi yukleme limiti gecici olarak asildi. Lutfen biraz sonra tekrar deneyin.',
  },
  'studio-reader-translate': {
    // Acik okuyucu istegi ucretli model calistirir; anonim IP patlamasi sinirlanir.
    maxPerUser: 60,
    maxPerIp: 60,
    message: 'Ek dil cevirisi sinirina ulasildi. Biraz sonra tekrar deneyin.',
  },
  'translation-raw': {
    // Translation Studio V3: chapter pages are uploaded in bulk.
    maxPerUser: 240,
    maxPerIp: 400,
    message: 'Ham sayfa yükleme sınırına ulaşıldı. Biraz sonra tekrar deneyin.',
  },
  'translation-scan': {
    // A long webtoon page splits into many tiles; the real cost limit is the daily budget.
    maxPerUser: 300,
    maxPerIp: 400,
    message: 'Otomatik tarama sınırına ulaşıldı. Biraz sonra tekrar deneyin.',
  },
  'translation-translate': {
    maxPerUser: 120,
    maxPerIp: 200,
    message: 'Otomatik çeviri sınırına ulaşıldı. Biraz sonra tekrar deneyin.',
  },
  'community-post-image': {
    maxPerUser: 24,
    maxPerIp: 60,
    message: 'Topluluk gorseli yukleme limiti gecici olarak asildi. Lutfen biraz sonra tekrar deneyin.',
  },
}

class UploadRateLimitError extends Error {
  constructor(message, retryAfterSeconds) {
    super(message)
    this.name = 'UploadRateLimitError'
    this.status = 429
    this.retryAfterSeconds = retryAfterSeconds
    this.headers = {
      'Retry-After': String(retryAfterSeconds),
    }
  }
}

class UploadReplayError extends Error {
  constructor(retryAfterSeconds) {
    super('Ayni yukleme istegi cok hizli tekrarlandi. Lutfen kisa bir sure bekleyin.')
    this.name = 'UploadReplayError'
    this.status = 409
    this.retryAfterSeconds = retryAfterSeconds
    this.headers = {
      'Retry-After': String(retryAfterSeconds),
    }
  }
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

function buildCounterKey(intent, scope, target, windowStart, windowSeconds) {
  return [
    'upload-rate-limit',
    sanitizeKeySegment(intent),
    sanitizeKeySegment(scope),
    sanitizeKeySegment(target),
    `w${windowSeconds}`,
    `t${windowStart}`,
  ].join(':')
}

function buildReplayKey(intent, target) {
  return [
    'upload-replay-guard',
    sanitizeKeySegment(intent),
    sanitizeKeySegment(target),
  ].join(':')
}

function resolveClientIp(request) {
  const forwardedIp = request.headers.get('cf-connecting-ip')
    || request.headers.get('x-forwarded-for')
    || request.headers.get('x-real-ip')
  if (!forwardedIp) return 'unknown-ip'
  return forwardedIp.split(',')[0].trim() || 'unknown-ip'
}

function getNamespace(env) {
  if (!env || typeof env !== 'object') return null
  if (!env.UPLOAD_GUARD_KV || typeof env.UPLOAD_GUARD_KV.get !== 'function') return null
  return env.UPLOAD_GUARD_KV
}

function parseStoredCounter(rawValue) {
  if (!rawValue) {
    return { count: 0 }
  }

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

function parseReplayState(rawValue) {
  if (!rawValue) {
    return { expiresAt: 0 }
  }

  try {
    const parsed = JSON.parse(rawValue)
    const expiresAt = Number(parsed?.expiresAt)
    return {
      expiresAt: Number.isFinite(expiresAt) && expiresAt > 0 ? expiresAt : 0,
    }
  } catch {
    return { expiresAt: 0 }
  }
}

/**
 * A KV error (daily write quota, temporary outage) skips the limiter, which is best effort.
 * Failing closed took every upload on the site down to 503 until the end of the day once the quota
 * ran out (seen in a real test: "KV put() limit exceeded for the day").
 */
async function kvSafe(label, operation) {
  try {
    return await operation()
  } catch (error) {
    console.warn(`[upload-rate-limit] ${label} atlandi: ${String(error?.message ?? error).slice(0, 160)}`)
    return undefined
  }
}

async function readCounter(namespace, key) {
  const rawValue = await kvSafe('okuma', () => namespace.get(key))
  return parseStoredCounter(rawValue ?? null)
}

async function readReplayState(namespace, key) {
  const rawValue = await kvSafe('okuma', () => namespace.get(key))
  return parseReplayState(rawValue ?? null)
}

async function writeCounter(namespace, key, count, windowSeconds) {
  await kvSafe('yazma', () => namespace.put(
    key,
    JSON.stringify({ count, updatedAt: Date.now() }),
    {
      expirationTtl: windowSeconds + 60,
    },
  ))
}

async function writeReplayState(namespace, key, ttlSeconds) {
  await kvSafe('yazma', () => namespace.put(
    key,
    JSON.stringify({ expiresAt: Date.now() + ttlSeconds * 1000 }),
    {
      expirationTtl: ttlSeconds + 15,
    },
  ))
}

function buildTargets(policy, authContext, request) {
  const targets = []
  const authUserId = authContext?.authUser?.id
  const clientIp = resolveClientIp(request)
  if (authUserId) {
    targets.push({
      scope: 'user',
      target: authUserId,
      limit: policy.maxPerUser,
    })
  }

  if (authUserId && clientIp && clientIp !== 'unknown-ip' && policy.maxPerUser) {
    targets.push({
      scope: 'user-ip',
      target: `${authUserId}:${clientIp}`,
      limit: policy.maxPerUser,
    })
  }

  if (clientIp && policy.maxPerIp) {
    targets.push({
      scope: 'ip',
      target: clientIp,
      limit: policy.maxPerIp,
    })
  }

  return targets
}

function resolveBurstLimit(limit, scope) {
  const normalizedLimit = Number(limit)
  if (!Number.isFinite(normalizedLimit) || normalizedLimit <= 0) return 0

  // Why: KV is not atomic; a short window breaks concurrent bursts earlier.
  const minimum = scope === 'user-ip' ? 3 : scope === 'user' ? 4 : 8
  const divisor = scope === 'user-ip' ? 8 : 6
  return Math.min(normalizedLimit, Math.max(minimum, Math.ceil(normalizedLimit / divisor)))
}

function getRetryAfterSeconds(windowStart, windowSeconds, now) {
  return Math.max(
    1,
    Math.ceil(((windowStart + windowSeconds) * 1000 - now) / 1000),
  )
}

export function getUploadRateLimitPolicy(intent) {
  return UPLOAD_RATE_LIMIT_POLICIES[intent] || null
}

export async function assertUploadRateLimit({ request, env, authContext, intent }) {
  const namespace = getNamespace(env)
  if (!namespace) return

  const policy = getUploadRateLimitPolicy(intent)
  if (!policy) return

  const now = Date.now()
  const targets = buildTargets(policy, authContext, request)
  if (!targets.length) return

  const snapshots = []
  const windows = [
    {
      windowSeconds: RATE_LIMIT_BURST_WINDOW_SECONDS,
      resolveLimit: (target) => resolveBurstLimit(target.limit, target.scope),
    },
    {
      windowSeconds: RATE_LIMIT_WINDOW_SECONDS,
      resolveLimit: (target) => target.limit,
    },
  ]

  for (const target of targets) {
    for (const window of windows) {
      const limit = Number(window.resolveLimit(target))
      if (!Number.isFinite(limit) || limit <= 0) continue

      const windowStart = getWindowStart(now, window.windowSeconds)
      const key = buildCounterKey(intent, target.scope, target.target, windowStart, window.windowSeconds)
      const counter = await readCounter(namespace, key)
      if (counter.count >= limit) {
        throw new UploadRateLimitError(
          policy.message,
          getRetryAfterSeconds(windowStart, window.windowSeconds, now),
        )
      }

      snapshots.push({
        key,
        windowSeconds: window.windowSeconds,
        nextCount: counter.count + 1,
      })
    }
  }

  for (const snapshot of snapshots) {
    // Why: KV has no atomic counter; the two-window setup is stricter on burst attempts.
    await writeCounter(namespace, snapshot.key, snapshot.nextCount, snapshot.windowSeconds)
  }
}

export async function assertUploadReplayGuard({ env, intent, target, ttlSeconds = UPLOAD_REPLAY_TTL_SECONDS }) {
  const namespace = getNamespace(env)
  if (!namespace) return

  const normalizedTtl = Number(ttlSeconds)
  if (!Number.isFinite(normalizedTtl) || normalizedTtl <= 0) return

  const key = buildReplayKey(intent, target)
  const replayState = await readReplayState(namespace, key)
  const retryAfterSeconds = Math.max(1, Math.ceil((replayState.expiresAt - Date.now()) / 1000))

  if (replayState.expiresAt > Date.now()) {
    throw new UploadReplayError(retryAfterSeconds)
  }
}

export async function markUploadReplayGuard({ env, intent, target, ttlSeconds = UPLOAD_REPLAY_TTL_SECONDS }) {
  const namespace = getNamespace(env)
  if (!namespace) return

  const normalizedTtl = Number(ttlSeconds)
  if (!Number.isFinite(normalizedTtl) || normalizedTtl <= 0) return

  const key = buildReplayKey(intent, target)
  await writeReplayState(namespace, key, normalizedTtl)
}
