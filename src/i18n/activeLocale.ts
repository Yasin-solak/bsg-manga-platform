import type { Locale } from './localizedRoutes'

/*
 * Active language (for helpers outside components: date/number formats, label
 * functions). LocaleProvider writes it on every render; since the language comes from the
 * address and only one address renders at a time (SSR included), one value is enough.
 */
let active: Locale = 'en'

/*
 * The English dictionary is a separate chunk that Turkish readers do not download. It loads
 * before the first render on English addresses and before switching language; SSR provides it directly.
 *
 * It comes in pieces: the core dictionary every English page needs, and one part per panel
 * (admin, fansub management, translation studio) that arrives with that panel's route. A reader
 * never downloads panel text.
 */
let enDictionary: Record<string, string> = {}
/* Panelden girilen Ingilizce metinler (i18n_text_overrides); sozlugun onune gecer. */
let enOverrides: Record<string, string> = {}

const EN_DICTIONARY_PART_LOADERS = {
  admin: () => import('./messages/enTextAdmin').then((module) => module.enTextAdmin),
  manage: () => import('./messages/enTextManage').then((module) => module.enTextManage),
  studio: () => import('./messages/enTextStudio').then((module) => module.enTextStudio),
} satisfies Record<string, () => Promise<Record<string, string>>>

export type EnDictionaryPart = keyof typeof EN_DICTIONARY_PART_LOADERS

const EN_DICTIONARY_PART_WAIT_MS = 10_000
/* Parts whose route has been opened; a later switch to English loads them with the core. */
const requestedEnParts = new Set<EnDictionaryPart>()
const loadedEnParts = new Set<EnDictionaryPart>()
/* True once English text has been asked for (English address, language switch, admin text screen). */
let enDictionaryWanted = false
let enCoreLoaded = false

export function setEnOverrides(overrides: Record<string, string>) {
  enOverrides = overrides
}

export function setEnDictionary(dictionary: Record<string, string>) {
  enDictionary = dictionary
}

/* Core and parts never share a key (i18n-dictionary-parts contract), so merge order is free. */
function mergeIntoEnDictionary(texts: Record<string, string>) {
  enDictionary = { ...enDictionary, ...texts }
}

async function loadEnDictionaryPart(part: EnDictionaryPart) {
  if (loadedEnParts.has(part)) return
  const texts = await EN_DICTIONARY_PART_LOADERS[part]()
  if (loadedEnParts.has(part)) return
  mergeIntoEnDictionary(texts)
  loadedEnParts.add(part)
}

export async function loadEnDictionary() {
  enDictionaryWanted = true
  const [{ enText }] = await Promise.all([
    import('./messages/enText'),
    ...[...requestedEnParts].map((part) => loadEnDictionaryPart(part)),
  ])
  if (!enCoreLoaded) {
    mergeIntoEnDictionary(enText)
    enCoreLoaded = true
  }
  const { loadEnOverrides } = await import('./enOverrides')
  await loadEnOverrides()
}

/**
 * Called by a panel route before its page module loads. Remembers the part, and when English is
 * in use waits for it (bounded: a hung request must not keep the panel from opening).
 */
export async function ensureEnDictionaryPart(part: EnDictionaryPart) {
  requestedEnParts.add(part)
  if (!enDictionaryWanted) return
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      loadEnDictionaryPart(part),
      new Promise<void>((resolve) => { timeoutId = setTimeout(resolve, EN_DICTIONARY_PART_WAIT_MS) }),
    ])
  } finally {
    clearTimeout(timeoutId)
  }
}

/** Core plus every part: for screens that look up any text (the admin translations screen). */
export async function loadFullEnDictionary() {
  for (const part of Object.keys(EN_DICTIONARY_PART_LOADERS) as EnDictionaryPart[]) requestedEnParts.add(part)
  await loadEnDictionary()
}

/** Only the dictionary in code: ignores panel entries (for the admin screen). */
export function lookupEnDictionary(text: string) {
  return enDictionary[text] ?? text
}

/** English for a text; the text itself if it is not in the dictionary. */
export function lookupEn(text: string) {
  return enOverrides[text] ?? enDictionary[text] ?? text
}

export function setActiveLocale(locale: Locale) {
  active = locale
}

export function getActiveLocale(): Locale {
  return active
}

/** BCP 47 tag for Intl / toLocaleString. */
export function intlLocale(locale: Locale = active) {
  return locale === 'en' ? 'en-US' : 'tr-TR'
}

/** Text translation outside components (same dictionary as tx). */
export function txa(text: string, vars?: Record<string, string | number>) {
  const template = active === 'en' ? lookupEn(text) : text
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole))
}
