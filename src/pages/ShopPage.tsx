import { Route, Routes, useLocation } from 'react-router-dom'
import { Navigate } from '@/i18n/router'
import { useRegisterTopBarOverride } from '@/components/layout/TopBarOverrideContext'
import { ShopCatalogView } from './shop/ShopCatalogView'
import { ShopHeader } from './shop/ShopHeader'
import { ShopHome } from './shop/ShopHome'
import { ShopMurekView } from './shop/ShopMurekView'
import { ShopPremiumView } from './shop/ShopPremiumView'
import { ShopProductModal, ShopProductRedirect } from './shop/ShopProductView'
import { ShopRail } from './shop/ShopRail'
import { ShopSeasonView } from './shop/ShopSeasonView'

/*
 * Shop v3: content + a hideable category rail on the right: showcase, catalog, season, premium;
 * product detail is a window on the same page. Old shop paths (one-cikanlar, kesfet, goz-at/*) redirect to their
 * new equivalents; links do not break.
 */

function LegacyRedirect({ to }: { to: string }) {
  const location = useLocation()
  const query = new URLSearchParams(location.search).get('q')
  const target = query ? `${to}${to.includes('?') ? '&' : '?'}q=${encodeURIComponent(query)}` : to
  return <Navigate to={target} replace />
}

const SHOP_HEADER = <ShopHeader />

export default function ShopPage() {
  useRegisterTopBarOverride('shop-navigation', SHOP_HEADER)
  return (
    <div className='min-h-screen bg-background text-foreground'>
      <div className='mx-auto flex w-full max-w-[1640px] gap-8 px-4 pb-16 pt-6 sm:px-6'>
        <div className='min-w-0 flex-1'>
          <Routes>
            <Route index element={<ShopHome />} />
            <Route path='katalog' element={<ShopCatalogView />} />
            <Route path='urun/:slug' element={<ShopProductRedirect />} />
            <Route path='sezon/:slug' element={<ShopSeasonView />} />
            <Route path='premium' element={<ShopPremiumView />} />
            <Route path='murek' element={<ShopMurekView />} />
            <Route path='one-cikanlar' element={<LegacyRedirect to='/magaza' />} />
            <Route path='kesfet' element={<LegacyRedirect to='/magaza/katalog' />} />
            <Route path='goz-at' element={<LegacyRedirect to='/magaza/katalog' />} />
            <Route path='goz-at/cerceveler' element={<LegacyRedirect to='/magaza/katalog?tur=cerceve' />} />
            <Route path='goz-at/arkaplanlar' element={<LegacyRedirect to='/magaza/katalog?tur=arka-plan' />} />
            <Route path='goz-at/profil-efektleri' element={<LegacyRedirect to='/magaza/katalog?tur=efekt' />} />
            <Route path='goz-at/paketler' element={<LegacyRedirect to='/magaza/katalog?tur=paket' />} />
            <Route path='*' element={<Navigate to='/magaza' replace />} />
          </Routes>
        </div>
        <ShopRail />
        <ShopProductModal />
      </div>
    </div>
  )
}
