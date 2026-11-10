import { createContext, Fragment, useCallback, useContext, useMemo, type ReactNode } from 'react'
import { en } from './messages/en'
import { tr, type MessageKey } from './messages/tr'
import { localizeHref, type Locale } from './localizedRoutes'
import { setActiveLocale, lookupEn } from './activeLocale'

/*
 * Locale context. The language comes only from the address (`/tr` prefix): the same address always
 * shows the same language (for search engines and shared links). Texts use
 * `t('key', { variable })`; a key missing in English falls back to Turkish.
 */

type Vars = Record<string, string | number>

const DICTIONARIES: Record<Locale, Partial<Record<MessageKey, string>>> = { tr, en }

function format(template: string, vars?: Vars) {
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole))
}

export function translateMessage(locale: Locale, key: MessageKey, vars?: Vars) {
  return format(DICTIONARIES[locale][key] ?? tr[key] ?? key, vars)
}

/** Text-based translation: the Turkish text is the key; without an English match it stays Turkish. */
export function translateText(locale: Locale, text: string, vars?: Vars) {
  return format(locale === 'en' ? lookupEn(text) : text, vars)
}

interface LocaleContextValue {
  locale: Locale
  t: (key: MessageKey, vars?: Vars) => string
  /** Sayfa icerikleri: `tx('Devam et')`. */
  tx: (text: string, vars?: Vars) => string
  /** Kanonik (Turkce) uygulama yolunu gecerli dilin adresine cevirir. */
  href: (target: string) => string
}

const LocaleContext = createContext<LocaleContextValue>({
  locale: 'en',
  t: (key, vars) => translateMessage('en', key, vars),
  tx: (text, vars) => translateText('en', text, vars),
  href: (target) => target,
})

export function LocaleProvider({ locale, children }: { locale: Locale, children: ReactNode }) {
  // For helpers outside components (txa, intlLocale); written before the children render.
  setActiveLocale(locale)
  const t = useCallback((key: MessageKey, vars?: Vars) => translateMessage(locale, key, vars), [locale])
  const tx = useCallback((text: string, vars?: Vars) => translateText(locale, text, vars), [locale])
  const href = useCallback((target: string) => localizeHref(target, locale), [locale])
  const value = useMemo(() => ({ locale, t, tx, href }), [href, locale, t, tx])
  // The tree is rebuilt when the language changes, so memoized components using txa do not stay in the old language.
  return <LocaleContext.Provider value={value}><Fragment key={locale}>{children}</Fragment></LocaleContext.Provider>
}

export function useLocale() {
  return useContext(LocaleContext)
}

/** Kisa yol: `const tx = useTx()`. */
export function useTx() {
  return useContext(LocaleContext).tx
}

/** Kisa yol: `const t = useT()`. */
export function useT() {
  return useContext(LocaleContext).t
}
