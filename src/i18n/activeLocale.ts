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
 */
let enDictionary: Record<string, string> = {}
/* Panelden girilen Ingilizce metinler (i18n_text_overrides); sozlugun onune gecer. */
let enOverrides: Record<string, string> = {}

export function setEnOverrides(overrides: Record<string, string>) {
  enOverrides = overrides
}

export function setEnDictionary(dictionary: Record<string, string>) {
  enDictionary = dictionary
}

export async function loadEnDictionary() {
  const { enText } = await import('./messages/enText')
  enDictionary = enText
  const { loadEnOverrides } = await import('./enOverrides')
  await loadEnOverrides()
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
