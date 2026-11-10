import type { CacheEntry } from './types'

export const HOVER_CACHE_TTL_MS = 5 * 60 * 1000
export const FANSUB_ACTIVE_WINDOW_DAYS = 30

export function normalizeKey(value?: string) {
  return (value || '').trim().toLowerCase()
}

export function isUuid(value: string) {
  const normalized = value.trim()
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)
}

export function nowMs() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now()
  }
  return Date.now()
}

export function toDurationMs(startedAt: number) {
  return Math.max(0, nowMs() - startedAt)
}

export function parseIsoTimestamp(value?: string) {
  if (!value) return null
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) return null
  return parsed
}

export function isAbortError(error: unknown) {
  if (!error || typeof error !== 'object') return false
  const typed = error as { name?: string; code?: string; message?: string }
  const message = (typed.message || '').toLowerCase()
  return typed.name === 'AbortError' || typed.code === 'ABORT_ERR' || message.includes('aborted')
}

export function isMissingColumnError(error: unknown, table: string, column: string) {
  if (!error || typeof error !== 'object') return false
  const typed = error as { code?: string | number; message?: string; details?: string; hint?: string }
  const code = typeof typed.code === 'string' ? typed.code : String(typed.code || '')
  const message = typeof typed.message === 'string' ? typed.message.toLowerCase() : ''
  const details = typeof typed.details === 'string' ? typed.details.toLowerCase() : ''
  const hint = typeof typed.hint === 'string' ? typed.hint.toLowerCase() : ''
  const needle = `${table.toLowerCase()}.${column.toLowerCase()}`
  return code === '42703'
    && (message.includes(needle) || details.includes(needle) || hint.includes(needle) || message.includes(`column ${column.toLowerCase()}`))
}

export function withAbortSignal<T>(query: T, signal?: AbortSignal) {
  if (!signal || !query || typeof query !== 'object') return query
  const typed = query as T & { abortSignal?: (abortSignal: AbortSignal) => T }
  if (typeof typed.abortSignal === 'function') {
    return typed.abortSignal(signal)
  }
  return query
}

export function takeFirstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null
  return Array.isArray(value) ? value[0] || null : value
}

export function readCache<T>(map: Map<string, CacheEntry<T>>, key: string) {
  const cached = map.get(key)
  if (!cached) return undefined
  if (cached.expiresAt <= Date.now()) {
    map.delete(key)
    return undefined
  }
  return cached.value
}

export function readCacheEntry<T>(map: Map<string, CacheEntry<T>>, key: string) {
  return map.get(key) || null
}

export function writeCache<T>(map: Map<string, CacheEntry<T>>, key: string, value: T | null) {
  map.set(key, {
    value,
    expiresAt: Date.now() + HOVER_CACHE_TTL_MS,
  })
}

export function getUserFallbackAvatar(seed: string) {
  const safeSeed = seed.trim() || 'user'
  return `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(safeSeed)}`
}

export function getFansubFallbackAvatar(seed: string) {
  const safeSeed = seed.trim() || 'fansub'
  return `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(safeSeed)}`
}

export function getMangaFallbackCover(title: string) {
  const safeTitle = (title.trim() || 'Manga').slice(0, 48)
  const escapedTitle = safeTitle.replace(/[&<>"']/g, (char) => {
    if (char === '&') return '&amp;'
    if (char === '<') return '&lt;'
    if (char === '>') return '&gt;'
    if (char === '"') return '&quot;'
    return '&#39;'
  })
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="400" height="600" viewBox="0 0 400 600">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#1a1a2e" />
          <stop offset="100%" stop-color="#0f172a" />
        </linearGradient>
      </defs>
      <rect width="400" height="600" fill="url(#bg)" />
      <rect x="24" y="24" width="352" height="552" rx="22" fill="none" stroke="#8b5cf6" stroke-opacity="0.35" />
      <text x="200" y="300" text-anchor="middle" dominant-baseline="middle" fill="#e5e7eb" font-size="28" font-family="Arial, sans-serif">
        ${escapedTitle}
      </text>
    </svg>
  `.trim()
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}
