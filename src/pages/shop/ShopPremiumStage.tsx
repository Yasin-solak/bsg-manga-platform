import { Crown } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { ShopPremiumName } from './ShopPremiumName'
import { useShopViewer } from './shopViewer'
import { txa } from '@/i18n/activeLocale'

/*
 * Premium card scene: the reader's plain name and duration when idle. When live the same name rotates through
 * premium name effects and a premium badge appears; the reader sees how they would look with premium.
 */

export function ShopPremiumStage({ days, live, className }: {
  days: number | null
  live: boolean
  className?: string
}) {
  const viewer = useShopViewer()
  return (
    <div className={cn('absolute inset-0 overflow-hidden bg-[radial-gradient(circle_at_20%_20%,rgba(245,185,66,0.28),transparent_55%),radial-gradient(circle_at_85%_90%,rgba(139,92,246,0.3),transparent_55%),linear-gradient(135deg,#140f1f,#0a0710)]', className)} data-shop-stage='premium'>
      <Crown weight='duotone' aria-hidden size={180} className={cn('absolute -right-6 -top-8 text-amber-300/15 transition-transform duration-500', live && 'rotate-12 scale-110')} />
      <div className='absolute inset-0 flex flex-col justify-center gap-1.5 px-5 text-white'>
        <span className='text-[10.5px] font-extrabold uppercase tracking-[0.14em] text-amber-300/90'>{live ? txa('Premium ile adın') : txa('Premium üyelik')}</span>
        {live ? (
          <span className='text-[26px] font-black leading-tight sm:text-[30px]' data-shop-live-layer='premium'>
            <ShopPremiumName name={viewer.name} cycle />
          </span>
        ) : (
          <span className='truncate text-[26px] font-black leading-tight text-white/85 sm:text-[30px]' data-shop-idle-layer='premium'>{viewer.name}</span>
        )}
        <span className='text-[12px] text-white/60'>{days ? txa('{v1} gün · erken erişim, isim efekti, özel arka plan', { v1: days }) : txa('Erken erişim, isim efekti, özel arka plan')}</span>
      </div>
    </div>
  )
}
