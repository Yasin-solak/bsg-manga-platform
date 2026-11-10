import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { DEFAULT_LOCALE, LOCALE_TAG, LOCALES, type Locale } from '@/i18n/localizedRoutes'
import { resolveDocumentMetaState } from '@/lib/documentMeta'
import { txa } from '@/i18n/activeLocale'

function upsertMeta(tagName: string, content: string, attribute: 'name' | 'property' = 'name') {
  let element = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${tagName}"]`)

  if (!element) {
    element = document.createElement('meta')
    element.setAttribute(attribute, tagName)
    document.head.appendChild(element)
  }

  element.setAttribute('content', content)
}

function upsertCanonical(href: string) {
  let element = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')

  if (!element) {
    element = document.createElement('link')
    element.setAttribute('rel', 'canonical')
    document.head.appendChild(element)
  }

  element.setAttribute('href', href)
}

function upsertAlternates(alternates: Record<Locale, string>) {
  const entries: Array<[string, string]> = [...LOCALES.map((locale) => [LOCALE_TAG[locale], alternates[locale]] as [string, string]), ['x-default', alternates[DEFAULT_LOCALE]]]
  for (const [hreflang, href] of entries) {
    let element = document.head.querySelector<HTMLLinkElement>(`link[rel="alternate"][hreflang="${hreflang}"]`)
    if (!element) {
      element = document.createElement('link')
      element.setAttribute('rel', 'alternate')
      element.setAttribute('hreflang', hreflang)
      document.head.appendChild(element)
    }
    element.setAttribute('href', href)
  }
}

export default function AppDocumentMeta() {
  const location = useLocation()

  useEffect(() => {
    const meta = resolveDocumentMetaState({
      pathname: location.pathname,
      search: location.search,
      siteOrigin: window.location.origin,
    })

    document.title = meta.title

    upsertMeta('description', meta.description)
    upsertMeta('robots', meta.robots)
    upsertMeta('og:title', meta.title, 'property')
    upsertMeta('og:description', meta.description, 'property')
    upsertMeta('og:type', meta.type, 'property')
    upsertMeta('og:url', meta.canonicalUrl, 'property')
    upsertMeta('og:site_name', txa('BSG Manga'), 'property')
    upsertMeta('og:image', meta.imageUrl, 'property')
    upsertMeta('twitter:card', 'summary_large_image')
    upsertMeta('twitter:title', meta.title)
    upsertMeta('twitter:description', meta.description)
    upsertMeta('twitter:image', meta.imageUrl)
    upsertCanonical(meta.canonicalUrl)
    upsertAlternates(meta.alternates)
  }, [location.pathname, location.search])

  return null
}
