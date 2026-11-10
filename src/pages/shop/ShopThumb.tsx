import { Crown, LockSimple, Package } from '@phosphor-icons/react'
import { resolveFramePosterUrl } from '@/components/cosmetics/frameVisualUrls'
import { cn } from '@/lib/utils'
import { resolveAssetMediaType, resolveStoreAssetUrl } from '@/services/assetUrlService'
import type { ShopCard } from '@/services/shopService'
import { shopCardPosterRef } from './shopCardLayout'
import { RARITY_META } from './shopFormat'

/* Small still image for lists and windows: no live layer, video on the first frame. */

export function ShopThumb({ card, className, fit = 'cover' }: { card: ShopCard, className?: string, fit?: 'cover' | 'contain' }) {
  const rarity = RARITY_META[card.rarity]
  const frame = card.grants.find((grant) => grant.type === 'frame')
  // Yerlesik cercevelerin (avatarframe1..4) posteri pakette gelir.
  const builtInPoster = frame ? resolveFramePosterUrl({ id: frame.id, name: frame.name, description: '', price: 0, currency: 'Coin', type: 'frame', frameType: frame.identifier }) : undefined
  const poster = resolveStoreAssetUrl(shopCardPosterRef(card)) ?? builtInPoster
  const background = card.grants.find((grant) => grant.type === 'background')
  const video = !poster && background ? resolveStoreAssetUrl(background.assetUrl) : undefined
  const fitClass = fit === 'contain' ? 'object-contain p-1' : 'object-cover'

  return (
    <span className={cn('relative block overflow-hidden bg-muted/50', className)} style={{ background: `radial-gradient(circle at 50% 40%, ${rarity.glow}, transparent 72%)` }} data-shop-thumb={card.type}>
      {card.locked ? (
        <span className='absolute inset-0 flex items-center justify-center text-muted-foreground'><LockSimple weight='duotone' size={18} /></span>
      ) : card.kind === 'premium' ? (
        <span className='absolute inset-0 flex items-center justify-center bg-accent'><Crown weight='duotone' size={22} className='text-foreground' /></span>
      ) : poster ? (
        <img src={poster} alt='' loading='lazy' decoding='async' className={cn('absolute inset-0 size-full', fitClass)} />
      ) : video && resolveAssetMediaType(video) === 'video' ? (
        <video src={`${video}#t=0.1`} preload='metadata' muted playsInline tabIndex={-1} aria-hidden className='absolute inset-0 size-full object-cover' />
      ) : video ? (
        <img src={video} alt='' loading='lazy' className='absolute inset-0 size-full object-cover' />
      ) : (
        <span className='absolute inset-0 flex items-center justify-center text-muted-foreground'><Package weight='duotone' size={18} /></span>
      )}
    </span>
  )
}
