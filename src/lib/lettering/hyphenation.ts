/*
 * Hyphenation (line-end splitting). Rule: splitting a word is the last resort. Layout first
 * shrinks the text and uses the whole bubble; if a single word does not fit a line even at
 * the smallest size, it is hyphenated by the language's syllable rules.
 * - TeX hyphenation patterns (hyphen package): tr, en, es, pt, fr, de, ru, id
 * - short words are never split ("yapay" never becomes "ya-/pay")
 * - at least 3 letters stay on each side of the split
 * - words with digits, and the spot right next to an apostrophe, are not split
 * Patterns load lazily per language; no splitting in a language not yet loaded.
 */

type Hyphenator = { hyphenateSync: (text: string, options?: { hyphenChar?: string, minWordLength?: number }) => string }

const LOADERS: Record<string, () => Promise<{ default?: Hyphenator } & Partial<Hyphenator>>> = {
  tr: () => import('hyphen/tr'),
  en: () => import('hyphen/en-us'),
  es: () => import('hyphen/es'),
  pt: () => import('hyphen/pt'),
  fr: () => import('hyphen/fr'),
  de: () => import('hyphen/de-1996'),
  ru: () => import('hyphen/ru'),
  id: () => import('hyphen/id'),
}

const loaded = new Map<string, Hyphenator>()
const loading = new Map<string, Promise<void>>()

export const MIN_HYPHEN_WORD = 7
export const MIN_HYPHEN_PART = 3
const MARK = '·'

export function supportsHyphenation(lang: string) {
  return lang in LOADERS
}

/** Loads the language pattern once; returns immediately for unsupported languages (ar, ja...). */
export function ensureHyphenation(lang: string): Promise<void> {
  const loader = LOADERS[lang]
  if (!loader || loaded.has(lang)) return Promise.resolve()
  const pending = loading.get(lang)
  if (pending) return pending
  const promise = loader()
    .then((module) => {
      const hyphenator = (module.default ?? module) as Hyphenator
      if (typeof hyphenator.hyphenateSync === 'function') loaded.set(lang, hyphenator)
    })
    .catch(() => { loading.delete(lang) })
  loading.set(lang, promise)
  return promise
}

/** Pattern injection for tests and non-server use. */
export function registerHyphenator(lang: string, hyphenator: Hyphenator) {
  loaded.set(lang, hyphenator)
}

const LETTER = /\p{L}/u

/**
 * Kelime icindeki gecerli bolme noktalari (kelime basindan karakter indeksi;
 * bolme o indeksten once yapilir). Bas/sondaki noktalama sayilmaz.
 */
export function hyphenationPoints(word: string, lang: string): number[] {
  const hyphenator = loaded.get(lang)
  if (!hyphenator || /\d/.test(word)) return []
  const chars = [...word]
  let start = 0
  let end = chars.length
  while (start < end && !LETTER.test(chars[start])) start += 1
  while (end > start && !LETTER.test(chars[end - 1])) end -= 1
  const core = chars.slice(start, end).join('')
  const letters = [...core].filter((char) => LETTER.test(char)).length
  if (letters < MIN_HYPHEN_WORD) return []
  const marked = hyphenator.hyphenateSync(core, { hyphenChar: MARK, minWordLength: MIN_HYPHEN_WORD })
  const points: number[] = []
  let index = 0
  for (const char of marked) {
    if (char === MARK) { points.push(start + index); continue }
    index += 1
  }
  const isApostrophe = (char: string | undefined) => char === "'" || char === '’'
  return points.filter((point) => {
    const before = chars.slice(start, point).filter((char) => LETTER.test(char)).length
    const after = chars.slice(point, end).filter((char) => LETTER.test(char)).length
    if (before < MIN_HYPHEN_PART || after < MIN_HYPHEN_PART) return false
    return !isApostrophe(chars[point - 1]) && !isApostrophe(chars[point]) && !isApostrophe(chars[point + 1]) && !isApostrophe(chars[point - 2])
  })
}
