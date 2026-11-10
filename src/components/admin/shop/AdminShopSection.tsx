import { useCallback, useState } from 'react'
import { ExternalLink, RefreshCw } from 'lucide-react'
import { useSearchParams } from '@/i18n/router'
import { CalendarBlank, ChartPieSlice, Crown, MagicWand, Package, Receipt, SealPercent, Sparkle, SquaresFour, Storefront } from '@phosphor-icons/react'
import { AdminSectionHeader } from '@/components/admin/shared/AdminSectionHeader'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { shopAdmin } from '@/services/shopAdminService'
import { useShopQuery } from '@/pages/shop/useShopQuery'
import { ShopAdminDiscounts } from './ShopAdminDiscounts'
import { ShopAdminEconomy } from './ShopAdminEconomy'
import { ShopAdminMerch } from './ShopAdminMerch'
import { ShopAdminNameEffects } from './ShopAdminNameEffects'
import { ShopAdminOrders } from './ShopAdminOrders'
import { ShopAdminOverview } from './ShopAdminOverview'
import { ShopAdminPremiumPerks } from './ShopAdminPremiumPerks'
import { ShopAdminProducts } from './ShopAdminProducts'
import { ShopAdminSchedule } from './ShopAdminSchedule'
import { SHOP_DESK_TABS, type ShopAdminTab } from './shopAdminFormat'
import { txa } from '@/i18n/activeLocale'

/*
 * Shop Control (shop v3 management): overview, products, seasons and campaigns, discounts,
 * bundles, showcase calendar, coin economy, Premium perks, orders, name effects. Replaces the old shop management and Studio.
 */


const TABS: Array<{ id: ShopAdminTab, label: string, icon: typeof Storefront }> = [
  { id: 'overview', get label() { return txa('Genel bakış') }, icon: SquaresFour },
  { id: 'products', get label() { return txa('Ürünler') }, icon: Storefront },
  { id: 'merch', get label() { return txa('Kampanyalar') }, icon: Sparkle },
  { id: 'discounts', get label() { return txa('İndirimler') }, icon: SealPercent },
  { id: 'bundles', get label() { return txa('Paketler') }, icon: Package },
  { id: 'schedule', get label() { return txa('Takvim') }, icon: CalendarBlank },
  { id: 'economy', get label() { return txa('Ekonomi') }, icon: ChartPieSlice },
  { id: 'premium', get label() { return txa('Premium') }, icon: Crown },
  { id: 'orders', get label() { return txa('Siparişler') }, icon: Receipt },
  { id: 'name-effects', get label() { return txa('İsim efektleri') }, icon: MagicWand },
]

export default function AdminShopSection() {
  const [params, setParams] = useSearchParams()
  const requested = params.get('sekme') as ShopAdminTab | null
  const tab: ShopAdminTab = TABS.some((entry) => entry.id === requested) ? requested as ShopAdminTab : 'overview'
  const merch = useShopQuery('shop-admin-merch', shopAdmin.merch)
  const [openProductId, setOpenProductId] = useState<string | null>(null)

  const go = useCallback((next: ShopAdminTab) => {
    const nextParams = new URLSearchParams(params)
    nextParams.set('sekme', next)
    setParams(nextParams, { replace: true })
  }, [params, setParams])

  const clearOpened = useCallback(() => setOpenProductId(null), [])
  // Refresh: reloads summary/showcase data and the open desk's list.
  const [revision, setRevision] = useState(0)
  const refresh = () => {
    merch.reload()
    setRevision((value) => value + 1)
  }
  const deskTab = SHOP_DESK_TABS.includes(tab)

  return (
    <section className={cn('flex flex-col gap-4', deskTab && 'xl:min-h-0 xl:flex-1')} data-testid='admin-shop-section'>
      <AdminSectionHeader
        title={txa('Mağaza')}
        description={txa('Ürünler, sezon ve kampanyalar, indirimler, coin ekonomisi, Premium ve siparişler.')}
        actions={(
          <span className='flex items-center gap-2'>
            <Button asChild variant='outline' size='sm' className='h-9 gap-1.5 rounded-full px-3.5'>
              <a href='/magaza' target='_blank' rel='noreferrer'><ExternalLink className='size-3.5' />{txa('Mağazayı aç')}</a>
            </Button>
            <Button variant='outline' size='sm' className='h-9 gap-1.5 rounded-full px-3.5' disabled={merch.loading} onClick={refresh}><RefreshCw className={cn('size-3.5', merch.loading && 'animate-spin')} />{txa('Yenile')}</Button>
          </span>
        )}
      />

      <nav aria-label={txa('Mağaza bölümleri')}>
        <div className='flex w-fit max-w-full flex-wrap gap-0.5 rounded-xl bg-muted/60 p-1' role='tablist'>
          {TABS.map((entry) => (
            <button
              key={entry.id}
              type='button'
              role='tab'
              aria-selected={tab === entry.id}
              onClick={() => go(entry.id)}
              data-testid={`admin-shop-tab-${entry.id}`}
              className={cn(
                'inline-flex flex-none items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors',
                tab === entry.id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <entry.icon weight={tab === entry.id ? 'fill' : 'regular'} size={14} className={tab === entry.id ? 'text-primary' : undefined} />
              {entry.label}
            </button>
          ))}
        </div>
      </nav>

      {merch.error && <p role='alert' className='rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-[13px] text-destructive'>{merch.error}</p>}

      {tab === 'overview' && <ShopAdminOverview onNavigate={go} onOpenProduct={(id) => { setOpenProductId(id); go('products') }} />}
      {(tab === 'products' || tab === 'bundles') && (
        <ShopAdminProducts
          key={tab}
          mode={tab === 'bundles' ? 'bundle' : 'all'}
          seasons={merch.data?.seasons ?? []}
          settings={merch.data?.settings ?? null}
          openProductId={openProductId}
          onOpenedProduct={clearOpened}
          revision={revision}
        />
      )}
      {merch.data && tab === 'merch' && <ShopAdminMerch merch={merch.data} onChanged={merch.reload} />}
      {merch.data && tab === 'discounts' && <ShopAdminDiscounts merch={merch.data} onChanged={merch.reload} />}
      {merch.data && tab === 'schedule' && <ShopAdminSchedule merch={merch.data} onChanged={merch.reload} />}
      {merch.data && tab === 'economy' && <ShopAdminEconomy merch={merch.data} onChanged={merch.reload} />}
      {tab === 'orders' && <ShopAdminOrders revision={revision} />}
      {tab === 'premium' && <ShopAdminPremiumPerks />}
      {tab === 'name-effects' && <ShopAdminNameEffects />}
      {!merch.data && merch.loading && ['merch', 'discounts', 'schedule', 'economy'].includes(tab) && <div className='h-72 animate-pulse rounded-[18px] bg-muted/40' />}
    </section>
  )
}
