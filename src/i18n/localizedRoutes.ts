import {
  COMMUNITY_RULES_PATH,
  CONTACT_PATH,
  COPYRIGHT_POLICY_PATH,
  DMCA_PATH,
  ENFORCEMENT_POLICY_PATH,
  FANSUB_RULES_PATH,
  FAQ_PATH,
  HELP_CENTER_PATH,
  KVKK_PATH,
  POLICY_HUB_PATH,
  PRIVACY_PATH,
  REFUND_POLICY_PATH,
  STORE_RULES_PATH,
  TERMS_PATH,
} from '@/lib/policyRoutes'

/*
  Localized addresses. English is the default language and has no prefix, with
  translated path words (`/manga/<slug>/chapter/5`). Turkish lives under `/tr`
  (`/tr/manga/<slug>/bolum/5`). Inside the app every route and link stays on the
  canonical path, which uses the Turkish words: App converts the real address to
  it with this table, and i18n/router converts links back. Parameters (series,
  fansub and user slugs) are never translated; matching is pattern based, so a
  series with "bolum" in its name is safe.
*/

export type Locale = 'tr' | 'en'

export const LOCALES: readonly Locale[] = ['tr', 'en'] as const
export const DEFAULT_LOCALE: Locale = 'en'
export const LOCALE_PREFIX: Record<Locale, string> = { tr: '/tr', en: '' }
/** <html lang> and hreflang values. */
export const LOCALE_TAG: Record<Locale, string> = { tr: 'tr', en: 'en' }

const slug = (path: string) => path.replace(/^\//, '')

/**
 * [Turkish pattern, English pattern]. Ordered from specific to general (first match wins).
 * `:name` is a parameter, a trailing `*` carries the remaining path as is.
 */
const ROUTE_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['', ''],
  ['kesfet', 'explore'],
  ['ayarlar', 'settings'],
  ['bildirimler/ayarlar', 'notifications/settings'],
  ['bildirimler', 'notifications'],
  ['dogum-tarihi', 'birth-date'],
  ['kutuphane', 'library'],
  ['sans', 'lucky'],
  ['oyunlar/gunun-kapagi', 'games/daily-cover'],
  ['oyunlar/panel-avi', 'games/panel-hunt'],
  ['oyunlar/murek-kosusu', 'games/murek-run'],
  ['oyunlar/kapak-esle', 'games/cover-match'],
  ['oyunlar', 'games'],
  ['fansublar', 'fansubs'],
  ['fansub-tier', 'fansub-tiers'],
  ['fansub/:id/yonet', 'fansub/:id/manage'],
  ['fansub/:id/studyo/*', 'fansub/:id/studio/*'],
  ['fansub/:id/manga/ekle', 'fansub/:id/manga/new'],
  ['fansub/:id/bolum/ekle', 'fansub/:id/chapter/new'],
  ['fansub/:id', 'fansub/:id'],
  ['duyurular/:id', 'announcements/:id'],
  ['duyurular', 'announcements'],
  ['topluluk', 'community'],
  ['yayin-takvimi', 'release-schedule'],
  ['listeler/:id', 'lists/:id'],
  ['listeler', 'lists'],
  ['magaza/*', 'shop/*'],
  ['magaza', 'shop'],
  ['profil/:username', 'profile/:username'],
  ['hos-geldin', 'welcome'],
  ['manga/:id/bolum/:chapterNumber/:fansubKey', 'manga/:id/chapter/:chapterNumber/:fansubKey'],
  ['manga/:id/bolum/:chapterNumber', 'manga/:id/chapter/:chapterNumber'],
  ['manga/:id', 'manga/:id'],
  ['oku/:mangaKey/:chapterNumber/:fansubKey', 'read/:mangaKey/:chapterNumber/:fansubKey'],
  ['oku/:mangaKey/:chapterNumber', 'read/:mangaKey/:chapterNumber'],
  [slug(POLICY_HUB_PATH), 'policies'],
  [slug(HELP_CENTER_PATH), 'help'],
  [slug(FAQ_PATH), 'faq'],
  [slug(CONTACT_PATH), 'contact'],
  [slug(TERMS_PATH), 'terms'],
  [slug(PRIVACY_PATH), 'privacy'],
  [slug(KVKK_PATH), 'kvkk'],
  [slug(COMMUNITY_RULES_PATH), 'community-rules'],
  [slug(FANSUB_RULES_PATH), 'fansub-rules'],
  [slug(STORE_RULES_PATH), 'store-rules'],
  [slug(REFUND_POLICY_PATH), 'refunds'],
  [slug(ENFORCEMENT_POLICY_PATH), 'enforcement'],
  [slug(COPYRIGHT_POLICY_PATH), 'copyright'],
  [slug(DMCA_PATH), 'dmca'],
  ['giris', 'login'],
]

type Pattern = string[]
const split = (path: string) => path.split('/').filter(Boolean)
const PAIRS = ROUTE_PAIRS.map(([tr, en]) => [split(tr), split(en)] as const)

function match(pattern: Pattern, segments: string[]): Record<string, string> | null {
  const params: Record<string, string> = {}
  for (let index = 0; index < pattern.length; index += 1) {
    const part = pattern[index]
    if (part === '*') {
      params['*'] = segments.slice(index).join('/')
      return params
    }
    const value = segments[index]
    if (value === undefined) return null
    if (part.startsWith(':')) params[part.slice(1)] = value
    else if (part !== value) return null
  }
  return segments.length === pattern.length ? params : null
}

function build(pattern: Pattern, params: Record<string, string>) {
  const out = pattern.map((part) => (part === '*' ? params['*'] : part.startsWith(':') ? params[part.slice(1)] : part)).filter((part) => part !== '')
  return `/${out.join('/')}`
}

function translate(pathname: string, from: 0 | 1, to: 0 | 1): string | null {
  const segments = split(pathname)
  for (const pair of PAIRS) {
    const params = match(pair[from] as Pattern, segments)
    if (params) return build(pair[to] as Pattern, params)
  }
  return null
}

function splitTarget(target: string) {
  const hashIndex = target.indexOf('#')
  const beforeHash = hashIndex >= 0 ? target.slice(0, hashIndex) : target
  const hash = hashIndex >= 0 ? target.slice(hashIndex) : ''
  const searchIndex = beforeHash.indexOf('?')
  return {
    pathname: searchIndex >= 0 ? beforeHash.slice(0, searchIndex) : beforeHash,
    search: searchIndex >= 0 ? beforeHash.slice(searchIndex) : '',
    hash,
  }
}

/** Language of an address: `/tr` or `/tr/...` is Turkish, everything else English. */
export function localeFromPathname(pathname: string): Locale {
  return pathname === '/tr' || pathname.startsWith('/tr/') ? 'tr' : 'en'
}

/** Real address -> canonical app path. */
export function toCanonicalPathname(pathname: string): string {
  if (localeFromPathname(pathname) === 'tr') return pathname.slice(3) || '/'
  return translate(pathname, 1, 0) ?? pathname
}

/** Canonical path -> address in the given language. Unknown paths (admin etc.) only get the prefix. */
export function localizePathname(canonicalPathname: string, locale: Locale): string {
  if (!canonicalPathname.startsWith('/')) return canonicalPathname
  if (locale === 'tr') return canonicalPathname === '/' ? '/tr' : `/tr${canonicalPathname}`
  return translate(canonicalPathname, 0, 1) ?? canonicalPathname
}

/** Translates a canonical `/path?search#hash` target to the given language; external links are untouched. */
export function localizeHref(target: string, locale: Locale): string {
  if (!target.startsWith('/') || target.startsWith('//')) return target
  const parts = splitTarget(target)
  return `${localizePathname(parts.pathname || '/', locale)}${parts.search}${parts.hash}`
}

/**
 * New address for links from before English became the default, or null when the
 * address is current. Old `/en/...` drops the prefix; old unprefixed Turkish
 * addresses (`/kesfet`) keep showing Turkish under `/tr`.
 */
export function legacyPathnameRedirect(pathname: string): string | null {
  if (pathname === '/en' || pathname.startsWith('/en/')) {
    const rest = pathname.slice(3) || '/'
    return translate(rest, 0, 1) ?? rest
  }
  if (localeFromPathname(pathname) === 'tr' || translate(pathname, 1, 0) !== null) return null
  const english = translate(pathname, 0, 1)
  return english !== null && english !== pathname ? `/tr${pathname}` : null
}

/** The same page in the other language (language switch and hreflang). */
export function alternateHref(currentPathname: string, search: string, hash: string, locale: Locale): string {
  return `${localizePathname(toCanonicalPathname(currentPathname), locale)}${search}${hash}`
}
