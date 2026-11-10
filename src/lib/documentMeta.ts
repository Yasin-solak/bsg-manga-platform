import { DEFAULT_LOCALE, LOCALE_TAG, LOCALES, localeFromPathname, localizePathname, toCanonicalPathname, type Locale } from '@/i18n/localizedRoutes'
import { matchPath } from 'react-router-dom'
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
import { EXPLORE_PATH, ONBOARDING_PATH } from '@/lib/routes'
import { lookupEn, txa } from '@/i18n/activeLocale'

export const SITE_NAME = 'BSG Manga'
export const DEFAULT_DESCRIPTION = 'BSG Manga uzerinde manga, webtoon, fansub ve topluluk akislarini tek yerde kesfet.'
export const DEFAULT_IMAGE = '/logo.png'
export const DEFAULT_SITE_ORIGIN = 'https://bsgmanga.pages.dev'

export type DocumentMeta = {
  title: string
  description: string
  robots?: string
  type?: 'website' | 'article'
}

export type ResolvedDocumentMeta = {
  title: string
  description: string
  robots: string
  type: 'website' | 'article'
  canonicalUrl: string
  imageUrl: string
  /** The page's language and its address in each language (hreflang). */
  lang: Locale
  alternates: Record<Locale, string>
}

type ResolveDocumentMetaStateOptions = {
  pathname: string
  search?: string
  siteOrigin?: string
}

export function resolveSiteOrigin(siteOrigin?: string) {
  if (!siteOrigin) {
    return DEFAULT_SITE_ORIGIN
  }

  try {
    return new URL(siteOrigin).origin
  } catch {
    return DEFAULT_SITE_ORIGIN
  }
}

export function resolveDocumentMeta(pathname: string): DocumentMeta {
  if (pathname === '/') {
    return {
      title: `${SITE_NAME} | Manga ve Webtoon Platformu`,
      description: txa('Takip akisi, fansub vitrinleri, topluluk ve manga okuma deneyimi tek yerde.'),
    }
  }

  if (pathname === EXPLORE_PATH) {
    return {
      title: `Kesfet | ${SITE_NAME}`,
      description: txa('Yeni mangalari, yukselen serileri ve one cikan yayinlari kesfet.'),
    }
  }

  if (pathname === '/fansublar') {
    return {
      title: `Fansublar | ${SITE_NAME}`,
      description: txa('Fansub ekiplerini, yayin akisini ve topluluk odakli vitrinlerini incele.'),
    }
  }

  if (pathname === '/fansub-tier') {
    return {
      title: `Takviye Rehberi | ${SITE_NAME}`,
      description: txa('Fansub takviye seviyelerini, acilan avantajlari ve supporter yuzeylerini gor.'),
    }
  }

  if (matchPath('/fansub/:id', pathname)) {
    return {
      title: `Fansub Detayi | ${SITE_NAME}`,
      description: txa('Fansub vitrini, duyurular, manga listesi ve takviye detaylari bu sayfada.'),
    }
  }

  if (pathname === '/topluluk') {
    return {
      title: `Topluluk | ${SITE_NAME}`,
      description: txa('Guncel gonderiler, tartismalar, anketler ve topluluk akislarini takip et.'),
    }
  }

  if (matchPath('/bildirimler', pathname)) {
    return {
      title: txa('Bildirimler | {v1}', { v1: SITE_NAME }),
      description: txa('Yeni bölümler, topluluk etkileşimleri ve hesap bildirimlerin.'),
      robots: 'noindex,nofollow',
    }
  }

  if (matchPath('/bildirimler/ayarlar', pathname)) {
    return {
      title: txa('Bildirim ayarları | {v1}', { v1: SITE_NAME }),
      description: txa('Bildirim türlerini ve bu cihazın sessiz saatlerini yönet.'),
      robots: 'noindex,nofollow',
    }
  }

  if (pathname === '/yayin-takvimi') {
    return {
      title: `Yayin Takvimi | ${SITE_NAME}`,
      description: txa('Planli bolum yayinlarini ve yaklasan takvim kayitlarini takip et.'),
    }
  }

  if (pathname === '/listeler') {
    return {
      title: `Listeler | ${SITE_NAME}`,
      description: txa('Kullanici manga listelerini ve koleksiyon akisini kesfet.'),
    }
  }

  if (matchPath('/listeler/:id', pathname)) {
    return {
      title: `Liste Detayi | ${SITE_NAME}`,
      description: txa('Secili manga listesinin icerigini ve topluluk etkilesimini incele.'),
    }
  }

  if (pathname.startsWith('/magaza')) {
    return {
      title: `Magaza | ${SITE_NAME}`,
      description: txa('Cerceve, arka plan, premium ve diger kozmetik urunleri kesfet.'),
    }
  }

  if (matchPath('/profil/:username', pathname)) {
    return {
      title: `Profil | ${SITE_NAME}`,
      description: txa('Kullanici profili, rozetler, takip bilgileri ve topluluk etkinligi burada.'),
    }
  }

  if (
    matchPath('/manga/:id/chapter/:chapterNumber', pathname)
    || matchPath('/manga/:id/bolum/:chapterNumber', pathname)
    || matchPath('/manga/:id/bolum/:chapterNumber/:fansubKey', pathname)
  ) {
    return {
      title: `${txa('Bolum Okuyucu')} | ${SITE_NAME}`,
      description: txa('Secili manganin bolumunu kesintisiz okuyucu deneyimi ile ac.'),
      type: 'article',
    }
  }

  if (matchPath('/manga/:id', pathname)) {
    return {
      title: `Manga Detayi | ${SITE_NAME}`,
      description: txa('Manga kapagi, bolum listesi, yorumlar ve iliskili fansub bilgileri burada.'),
    }
  }

  if (pathname === POLICY_HUB_PATH) {
    return {
      title: `Kurallar ve Politikalar | ${SITE_NAME}`,
      description: txa('Platform kurallarini, gizlilik ve kullanim politikalarini tek yerde gor.'),
    }
  }

  if (pathname === HELP_CENTER_PATH) {
    return {
      title: `Yardim Merkezi | ${SITE_NAME}`,
      description: txa('Sik sorulan akislara, yardim basliklarina ve kullanim rehberlerine ulas.'),
    }
  }

  if (pathname === FAQ_PATH) {
    return {
      title: `SSS | ${SITE_NAME}`,
      description: txa('Sik sorulan sorular ve hizli cevaplar burada.'),
    }
  }

  if (pathname === CONTACT_PATH) {
    return {
      title: `Iletisim | ${SITE_NAME}`,
      description: txa('Platform ile iletisime gecmek ve destek kanallarini gormek icin kullan.'),
    }
  }

  if (
    [
      TERMS_PATH,
      PRIVACY_PATH,
      KVKK_PATH,
      COMMUNITY_RULES_PATH,
      FANSUB_RULES_PATH,
      STORE_RULES_PATH,
      REFUND_POLICY_PATH,
      ENFORCEMENT_POLICY_PATH,
      COPYRIGHT_POLICY_PATH,
      DMCA_PATH,
    ].includes(pathname)
  ) {
    return {
      title: `Politika Belgesi | ${SITE_NAME}`,
      description: txa('Bu sayfada secili yasal metin, politika veya bildirim akisi yer alir.'),
      type: 'article',
    }
  }

  if (
    pathname === '/giris'
    || pathname === ONBOARDING_PATH
    || pathname.startsWith('/admin')
    || pathname.includes('/yonet')
    || pathname.startsWith('/test')
  ) {
    return {
      title: `${SITE_NAME} | Uygulama`,
      description: DEFAULT_DESCRIPTION,
      robots: 'noindex,nofollow',
    }
  }

  return {
    title: `${SITE_NAME} | Manga ve Webtoon Platformu`,
    description: DEFAULT_DESCRIPTION,
  }
}

export function resolveDocumentMetaState({
  pathname,
  search = '',
  siteOrigin,
}: ResolveDocumentMetaStateOptions): ResolvedDocumentMeta {
  // Cok dilli adres: meta Turkce kanonik yoldan cozulur, canonical gercek dildeki adrestir.
  const lang = localeFromPathname(pathname)
  const canonicalPathname = toCanonicalPathname(pathname)
  const meta = resolveDocumentMeta(canonicalPathname)
  const origin = resolveSiteOrigin(siteOrigin)

  // Metinler Turkce tanimli; Ingilizce adreste sozlukten gelir.
  const locale = localeFromPathname(pathname)
  const translate = (text: string) => (locale === 'en' ? lookupEn(text) : text)

  return {
    title: translate(meta.title),
    description: translate(meta.description),
    robots: meta.robots ?? 'index,follow',
    type: meta.type ?? 'website',
    canonicalUrl: `${origin}${pathname}${search}`,
    imageUrl: `${origin}${DEFAULT_IMAGE}`,
    lang,
    alternates: Object.fromEntries(LOCALES.map((locale) => [locale, `${origin}${localizePathname(canonicalPathname, locale)}${search}`])) as Record<Locale, string>,
  }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function renderDocumentHeadTags(meta: ResolvedDocumentMeta) {
  return [
    `<title>${escapeHtml(meta.title)}</title>`,
    `<meta name="description" content="${escapeHtml(meta.description)}" />`,
    `<meta name="robots" content="${escapeHtml(meta.robots)}" />`,
    `<meta property="og:site_name" content="${escapeHtml(SITE_NAME)}" />`,
    `<meta property="og:type" content="${escapeHtml(meta.type)}" />`,
    `<meta property="og:title" content="${escapeHtml(meta.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(meta.description)}" />`,
    `<meta property="og:url" content="${escapeHtml(meta.canonicalUrl)}" />`,
    `<meta property="og:image" content="${escapeHtml(meta.imageUrl)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeHtml(meta.title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(meta.description)}" />`,
    `<meta name="twitter:image" content="${escapeHtml(meta.imageUrl)}" />`,
    `<link rel="canonical" href="${escapeHtml(meta.canonicalUrl)}" />`,
    ...LOCALES.map((locale) => `<link rel="alternate" hreflang="${LOCALE_TAG[locale]}" href="${escapeHtml(meta.alternates[locale])}" />`),
    `<link rel="alternate" hreflang="x-default" href="${escapeHtml(meta.alternates[DEFAULT_LOCALE])}" />`,
  ].join('\n    ')
}
