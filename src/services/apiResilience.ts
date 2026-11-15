import { txa } from '@/i18n/activeLocale'
type AbortableQuery<T> = T & {
  abortSignal?: (signal: AbortSignal) => T
}

export const DEFAULT_API_TIMEOUT_MS = 10_000
const DEFAULT_MAX_ATTEMPTS = 3
const RETRY_BASE_DELAY_MS = 300
const RETRY_MAX_DELAY_MS = 4_000
const RETRY_AFTER_MAX_MS = 10_000

type ApiTimeoutError = Error & {
  code: 'REQUEST_TIMEOUT'
  timeoutMs: number
}

interface ServiceTimeoutOptions {
  label: string
  timeoutMs?: number
  signal?: AbortSignal
}

interface RetryOptions {
  label: string
  maxAttempts?: number
  /** Optional per-attempt delay ceilings; the actual wait is still jittered inside [0, ceiling]. */
  delaysMs?: number[]
  shouldRetry?: (error: unknown, attempt: number) => boolean
}

function createTimeoutError(label: string, timeoutMs: number): ApiTimeoutError {
  const error = new Error(txa('{v1} zaman asimina ugradi.', { v1: label })) as ApiTimeoutError
  error.code = 'REQUEST_TIMEOUT'
  error.timeoutMs = timeoutMs
  return error
}

function createAbortError() {
  if (typeof DOMException !== 'undefined') {
    return new DOMException('Istek iptal edildi.', 'AbortError')
  }

  const error = new Error('Istek iptal edildi.')
  ;(error as Error & { name: string }).name = 'AbortError'
  return error
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

export function isAbortLikeError(error: unknown) {
  if (!error || typeof error !== 'object') return false
  const typed = error as { name?: string; code?: string | number; message?: string }
  const code = typeof typed.code === 'string' ? typed.code : String(typed.code || '')
  const message = (typed.message || '').toLowerCase()

  return typed.name === 'AbortError'
    || code === 'ABORT_ERR'
    || code === '20'
    || message.includes('aborted')
}

/**
 * Full-jitter exponential backoff: a random wait in [0, min(cap, base * 2^(attempt-1))].
 * Randomising the whole window keeps clients from retrying in lockstep during an incident.
 */
export function computeBackoffDelayMs(attempt: number, random: () => number = Math.random) {
  const ceiling = Math.min(RETRY_MAX_DELAY_MS, RETRY_BASE_DELAY_MS * 2 ** Math.max(0, attempt - 1))
  return Math.floor(random() * (ceiling + 1))
}

/** Reads a server supplied Retry-After hint (429/503) from the error, capped at 10 s. */
export function readRetryAfterMs(error: unknown): number | null {
  if (!error || typeof error !== 'object') return null
  const typed = error as {
    status?: number
    retryAfterMs?: unknown
    retryAfter?: unknown
    headers?: { get?: (name: string) => string | null } | Record<string, unknown>
  }
  if (typed.status !== undefined && typed.status !== 429 && typed.status !== 503) return null

  let ms: number | null = null
  if (typeof typed.retryAfterMs === 'number') {
    ms = typed.retryAfterMs
  } else {
    let raw: unknown = typed.retryAfter
    const headers = typed.headers
    if (raw === undefined && headers) {
      raw = typeof (headers as { get?: unknown }).get === 'function'
        ? (headers as { get: (name: string) => string | null }).get('retry-after')
        : (headers as Record<string, unknown>)['retry-after'] ?? (headers as Record<string, unknown>)['Retry-After']
    }
    const seconds = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : Number.NaN
    if (Number.isFinite(seconds)) ms = seconds * 1000
  }
  if (ms === null || !Number.isFinite(ms) || ms < 0) return null
  return Math.min(RETRY_AFTER_MAX_MS, ms)
}

export function isRetryableApiError(error: unknown) {
  if (!error || typeof error !== 'object') return false

  const typed = error as {
    code?: string | number
    status?: number
    message?: string
    details?: string
    name?: string
  }

  const code = typeof typed.code === 'string' ? typed.code : String(typed.code || '')
  const status = typeof typed.status === 'number' ? typed.status : null
  const message = (typed.message || '').toLowerCase()
  const details = (typed.details || '').toLowerCase()

  if (code === 'REQUEST_TIMEOUT' || isAbortLikeError(error)) return true
  if (status !== null && (status === 408 || status === 425 || status === 429 || status >= 500)) return true

  return message.includes('timeout')
    || message.includes('temporarily unavailable')
    || message.includes('network')
    || message.includes('fetch failed')
    || message.includes('rate limit')
    || details.includes('retry')
}

export function withAbortSignal<T>(query: T, signal?: AbortSignal) {
  if (!signal || !query || typeof query !== 'object') return query
  const typed = query as AbortableQuery<T>
  if (typeof typed.abortSignal === 'function') {
    return typed.abortSignal(signal)
  }
  return query
}

export async function withServiceTimeout<T>(
  operation: (signal: AbortSignal) => PromiseLike<T> | T,
  options: ServiceTimeoutOptions,
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_API_TIMEOUT_MS
  const controller = new AbortController()
  let timerId: ReturnType<typeof setTimeout> | null = null
  let externalAbortCleanup = () => {}

  const timeoutPromise = new Promise<never>((_, reject) => {
    timerId = setTimeout(() => {
      controller.abort()
      reject(createTimeoutError(options.label, timeoutMs))
    }, timeoutMs)
  })

  const externalAbortPromise = options.signal
    ? new Promise<never>((_, reject) => {
      const externalSignal = options.signal!
      if (externalSignal.aborted) {
        controller.abort(externalSignal.reason)
        reject(createAbortError())
        return
      }

      const handleAbort = () => {
        controller.abort(externalSignal.reason)
        reject(createAbortError())
      }

      externalSignal.addEventListener('abort', handleAbort, { once: true })
      externalAbortCleanup = () => {
        externalSignal.removeEventListener('abort', handleAbort)
      }
    })
    : null

  try {
    return await Promise.race([
      Promise.resolve(operation(controller.signal)).catch((error) => {
        if (isAbortLikeError(error)) {
          if (options.signal?.aborted) {
            throw error
          }
          throw createTimeoutError(options.label, timeoutMs)
        }
        throw error
      }),
      timeoutPromise,
      ...(externalAbortPromise ? [externalAbortPromise] : []),
    ])
  } finally {
    if (timerId) {
      clearTimeout(timerId)
    }
    externalAbortCleanup()
  }
}

export async function runWithRetry<T>(
  operation: (attempt: number) => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? (options.delaysMs?.length ? options.delaysMs.length + 1 : DEFAULT_MAX_ATTEMPTS)
  const delayCeilingsMs = options.delaysMs
  const shouldRetry = options.shouldRetry ?? ((error: unknown) => isRetryableApiError(error))

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation(attempt)
    } catch (error) {
      const canRetry = attempt < maxAttempts && shouldRetry(error, attempt)
      if (!canRetry) {
        throw error
      }

      const retryAfterMs = readRetryAfterMs(error)
      if (retryAfterMs !== null) {
        await sleep(retryAfterMs)
      } else if (delayCeilingsMs?.length) {
        const ceiling = delayCeilingsMs[Math.min(attempt - 1, delayCeilingsMs.length - 1)] ?? 0
        await sleep(Math.floor(Math.random() * (ceiling + 1)))
      } else {
        await sleep(computeBackoffDelayMs(attempt))
      }
    }
  }

  throw createTimeoutError(options.label, DEFAULT_API_TIMEOUT_MS)
}
