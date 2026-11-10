import { useCallback } from 'react'
import { useLocation, type To } from 'react-router-dom'
import { useNavigate } from '@/i18n/router'
/*
 * Product detail is not a separate page: it opens as a window over the current shop page.
 * The address changes only with ?urun=<slug> (shareable, the back button closes the window).
 */

export const SHOP_PRODUCT_PARAM = 'urun'

export function useShopProductLink() {
  const location = useLocation()
  return useCallback((slug: string): To => {
    const params = new URLSearchParams(location.search)
    params.set(SHOP_PRODUCT_PARAM, slug)
    return { pathname: location.pathname, search: `?${params.toString()}` }
  }, [location.pathname, location.search])
}

export function useCloseShopProduct() {
  const location = useLocation()
  const navigate = useNavigate()
  return useCallback(() => {
    const params = new URLSearchParams(location.search)
    params.delete(SHOP_PRODUCT_PARAM)
    const search = params.toString()
    navigate({ pathname: location.pathname, search: search ? `?${search}` : '' })
  }, [location.pathname, location.search, navigate])
}

/** Eski /magaza/urun/:slug adresleri (bildirimler, paylasilan baglantilar) vitrinde pencereyle acilir. */
export function shopProductFallbackHref(slug: string) {
  return `/magaza?${SHOP_PRODUCT_PARAM}=${encodeURIComponent(slug)}`
}
