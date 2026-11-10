import { txa } from '@/i18n/activeLocale'
/*
 * Fansub-specific typefaces (Translation Studio V3 "Upload font").
 * Style key `custom:<font-id>`; CSS family `tl-<font-id>`. The font file is
 * served by /api/ceviri/font?id and loaded once with FontFace.
 */

const CUSTOM_PREFIX = 'custom:'
const names = new Map<string, string>()
const loading = new Map<string, Promise<void>>()

export function isCustomFontKey(key: string | undefined | null): boolean {
  return typeof key === 'string' && key.startsWith(CUSTOM_PREFIX) && key.length > CUSTOM_PREFIX.length
}

export function customFontKey(id: string) {
  return `${CUSTOM_PREFIX}${id}`
}

export function customFontId(key: string) {
  return key.slice(CUSTOM_PREFIX.length)
}

export function customFontFamily(key: string) {
  return `'tl-${customFontId(key)}', sans-serif`
}

export function registerCustomFontName(id: string, name: string) {
  names.set(id, name)
}

export function customFontName(key: string) {
  return names.get(customFontId(key)) ?? txa('Özel font')
}

/** Downloads the font once and adds it to document.fonts; on error, continues with a fallback font. */
export function ensureCustomFont(key: string): Promise<void> {
  if (!isCustomFontKey(key) || typeof document === 'undefined' || typeof FontFace === 'undefined') return Promise.resolve()
  const id = customFontId(key)
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Promise.resolve()
  const existing = loading.get(id)
  if (existing) return existing
  const face = new FontFace(`tl-${id}`, `url(/api/ceviri/font?id=${encodeURIComponent(id)})`)
  const promise = face.load()
    .then((loaded) => { document.fonts.add(loaded) })
    .catch(() => { loading.delete(id) })
  loading.set(id, promise)
  return promise
}
