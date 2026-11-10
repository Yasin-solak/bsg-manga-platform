/*
 * Old tab after a deploy: page chunks (assets/*-hash.js) are renamed by the new deploy, the old names
 * disappear from the server and the SPA fallback returns index.html instead. When an old version left open
 * moves to a new route, the chunk fails to load and the tree crashes. We recognize this error and reload once,
 * silently moving the user to the new version. Loop guard: we do not reload a second
 * time shortly after; in that case the error screen with a "site updated" message is left to the user.
 */

const RELOAD_STORAGE_KEY = 'bsg:stale-chunk-reload-at'
const RELOAD_COOLDOWN_MS = 30_000

const CHUNK_ERROR_PATTERNS = [
  /failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /importing a module script failed/i,
  /is not a valid javascript mime type/i,
  /unable to preload css/i,
  /loading (css )?chunk [\w-]+ failed/i,
]

export function isStaleChunkError(error: unknown): boolean {
  if (!error) return false
  const name = typeof error === 'object' && 'name' in error ? String((error as { name?: unknown }).name ?? '') : ''
  if (name === 'ChunkLoadError') return true
  const message = error instanceof Error
    ? error.message
    : typeof error === 'object' && 'message' in error
      ? String((error as { message?: unknown }).message ?? '')
      : String(error)
  return CHUNK_ERROR_PATTERNS.some((pattern) => pattern.test(message))
}

function readLastReloadAt(): number {
  try {
    return Number(window.sessionStorage.getItem(RELOAD_STORAGE_KEY)) || 0
  } catch {
    return 0
  }
}

/** Returns true if a reload started; false within the cooldown (loop risk). */
export function reloadForStaleChunk(now = Date.now()): boolean {
  if (typeof window === 'undefined') return false
  if (now - readLastReloadAt() < RELOAD_COOLDOWN_MS) return false
  try {
    window.sessionStorage.setItem(RELOAD_STORAGE_KEY, String(now))
  } catch {
    // Without storage no cooldown can be kept; we do not reload, to avoid a loop.
    return false
  }
  window.location.reload()
  return true
}

/** Same recovery for Vite's preload error (CSS/dependency chunk). */
export function installStaleChunkReloadHandler() {
  if (typeof window === 'undefined') return
  window.addEventListener('vite:preloadError', (event) => {
    if (reloadForStaleChunk()) event.preventDefault()
  })
}
