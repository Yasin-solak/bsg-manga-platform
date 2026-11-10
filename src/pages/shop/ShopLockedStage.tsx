import { LockSimple } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { resolveStoreAssetUrl } from '@/services/assetUrlService'
import type { ShopCard } from '@/services/shopService'
import { ShopCountdown } from './ShopCountdown'
import { RARITY_META, TYPE_LABEL } from './shopFormat'
import { txa } from '@/i18n/activeLocale'

/*
 * Locked / coming soon scene: the product as a silhouette (a dark look if there is a cover) and a countdown.
 * Live it does not reveal the product, only hints: type, rarity and a light shimmer.
 */

const SILHOUETTE: Record<ShopCard['type'], string> = {
  frame: 'aspect-square h-[58%] rounded-full',
  profile_effect: 'aspect-[450/880] h-[80%] rounded-[14px]',
  background: 'aspect-[16/9] h-[62%] rounded-[14px]',
  bundle: 'aspect-[16/9] h-[62%] rounded-[14px]',
  premium: 'aspect-[16/9] h-[62%] rounded-[14px]',
}

export function ShopLockedStage({ card, live, className }: { card: ShopCard, live: boolean, className?: string }) {
  const rarity = RARITY_META[card.rarity]
  const cover = resolveStoreAssetUrl(card.cover)
  return (
    <div
      className={cn('absolute inset-0 flex items-center justify-center overflow-hidden bg-[repeating-linear-gradient(135deg,color-mix(in_oklch,var(--foreground)_5%,transparent)_0_10px,transparent_10px_20px)]', className)}
      style={{ backgroundColor: 'var(--card)' }}
      data-shop-stage='locked'
    >
      <span aria-hidden className={cn('absolute inset-0 transition-opacity duration-500', live ? 'opacity-100' : 'opacity-40')} style={{ background: `radial-gradient(circle at 50% 50%, ${rarity.glow}, transparent 65%)` }} />
      <span className={cn('relative overflow-hidden', SILHOUETTE[card.type])}>
        {cover ? (
          <img src={cover} alt='' loading='lazy' className='absolute inset-0 size-full object-cover [filter:brightness(0)_blur(2px)] opacity-80' />
        ) : (
          <span className='absolute inset-0 bg-foreground/[0.08] ring-1 ring-foreground/10' />
        )}
        {live && <span aria-hidden className='shop-live-sweep absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/25 to-transparent' data-shop-live-layer='locked' />}
      </span>
      <span className='absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center text-muted-foreground'>
        <LockSimple weight='duotone' size={28} />
      </span>
      <span className='absolute inset-x-2.5 bottom-2.5 flex items-center justify-between gap-2 text-[11px] font-bold'>
        <span className={cn('truncate rounded-full bg-black/55 px-2 py-0.5 backdrop-blur transition-opacity duration-300', live ? 'opacity-100' : 'opacity-0')} style={{ color: 'white' }}>
          {txa('İpucu:')} {TYPE_LABEL[card.type]} · <span className={rarity.ink}>{rarity.label}</span>
        </span>
        {card.availableFrom && (
          <span className='flex-none rounded-full bg-black/60 px-2 py-0.5 text-white backdrop-blur'>
            <ShopCountdown target={card.availableFrom} compact />
          </span>
        )}
      </span>
    </div>
  )
}
