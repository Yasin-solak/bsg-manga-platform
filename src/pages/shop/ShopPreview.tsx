import { useEffect, useState } from 'react'
import { Crown, LockSimple, Sparkle } from '@phosphor-icons/react'
import { AvatarFrame } from '@components/common/AvatarFrame'
import { ProfileEffectLayer } from '@/components/profileEffects/ProfileEffectLayer'
import type { StoreProfileEffectAssets } from '@/data/storeProducts'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'
import { resolveAssetMediaType, resolveStoreAssetUrl } from '@/services/assetUrlService'
import type { ShopCard, ShopGrant } from '@/services/shopService'
import { getStoreProfileEffectAssetMap } from '@/services/storeProfileEffectService'
import { RARITY_META } from './shopFormat'
import { txa } from '@/i18n/activeLocale'

/*
  Urun onizlemesi: cerceve okurun kendi avatariyla, arka plan gorsel / video, efekt kendi
  animasyonuyla (detayda) ya da posteriyle (kartta), paket katmanli, premium tac.
*/

function MediaFill({ src, className }: { src: string | undefined, className?: string }) {
  if (!src) return null
  return resolveAssetMediaType(src) === 'video'
    ? <video src={src} muted loop autoPlay playsInline className={cn('absolute inset-0 size-full object-cover', className)} />
    : <img src={src} alt='' loading='lazy' className={cn('absolute inset-0 size-full object-cover', className)} />
}

function FramePreview({ grant, size }: { grant: ShopGrant, size: number }) {
  const { currentUser } = useAuth()
  return (
    <AvatarFrame
      src={currentUser?.avatar}
      alt={currentUser?.username || txa('Sen')}
      frameType={grant.identifier}
      size={size}
      customOverlayUrl={resolveStoreAssetUrl(grant.assetUrl)}
      posterOverlayUrl={resolveStoreAssetUrl(grant.posterUrl)}
      disableStoreLookup
      hoverPlayback='auto'
    />
  )
}

function EffectPreview({ grant, animate }: { grant: ShopGrant, animate: boolean }) {
  const [assets, setAssets] = useState<StoreProfileEffectAssets | null>(null)
  useEffect(() => {
    if (!animate) return undefined
    let cancelled = false
    void getStoreProfileEffectAssetMap([grant.id]).then(({ data }) => {
      if (!cancelled) setAssets(data.get(grant.id) ?? null)
    })
    return () => { cancelled = true }
  }, [animate, grant.id])
  const poster = resolveStoreAssetUrl(grant.posterUrl ?? grant.assetUrl)
  return (
    <>
      <MediaFill src={poster} />
      {animate && assets && <ProfileEffectLayer assets={assets} surface='profile' className='absolute inset-0' />}
    </>
  )
}

export function ShopPreview({ card, variant = 'card', className }: {
  card: ShopCard
  variant?: 'card' | 'hero' | 'thumb'
  className?: string
}) {
  const rarity = RARITY_META[card.rarity]
  const frame = card.grants.find((grant) => grant.type === 'frame')
  const background = card.grants.find((grant) => grant.type === 'background')
  const effect = card.grants.find((grant) => grant.type === 'profile_effect')
  const frameSize = variant === 'hero' ? 200 : variant === 'thumb' ? 44 : 108
  const cover = resolveStoreAssetUrl(card.cover)

  return (
    <div
      className={cn('relative isolate overflow-hidden', className)}
      style={{ background: `radial-gradient(circle at 50% 42%, ${rarity.glow}, transparent 70%)` }}
    >
      {card.locked ? (
        <div className='absolute inset-0 flex items-center justify-center bg-[repeating-linear-gradient(135deg,color-mix(in_oklch,var(--foreground)_5%,transparent)_0_10px,transparent_10px_20px)] text-muted-foreground'>
          <LockSimple weight='duotone' size={variant === 'hero' ? 48 : 28} />
        </div>
      ) : card.kind === 'premium' ? (
        <div className='absolute inset-0 flex items-center justify-center bg-gradient-to-br from-amber-400/25 via-violet-500/15 to-transparent'>
          <Crown weight='duotone' size={variant === 'hero' ? 120 : 64} className='text-amber-300 drop-shadow-[0_10px_30px_rgba(245,185,66,0.45)]' />
        </div>
      ) : card.kind === 'bundle' ? (
        <>
          {background ? <MediaFill src={resolveStoreAssetUrl(background.assetUrl ?? background.posterUrl)} className='opacity-60' /> : <MediaFill src={cover} className='opacity-50' />}
          <span aria-hidden className='absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent' />
          {frame && (
            <div className='absolute inset-0 flex items-center justify-center'>
              <FramePreview grant={frame} size={frameSize} />
            </div>
          )}
          {effect && variant !== 'thumb' && (
            <span className='absolute bottom-2.5 right-2.5 flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10.5px] font-bold text-white backdrop-blur'>
              <Sparkle weight='fill' size={11} className='text-violet-300' />{txa('Efekt dahil')}
            </span>
          )}
        </>
      ) : card.type === 'frame' && frame ? (
        <div className='absolute inset-0 flex items-center justify-center'>
          <FramePreview grant={frame} size={frameSize} />
        </div>
      ) : card.type === 'background' && background ? (
        <MediaFill src={resolveStoreAssetUrl(background.assetUrl ?? background.posterUrl) ?? cover} />
      ) : card.type === 'profile_effect' && effect ? (
        <EffectPreview grant={effect} animate={variant === 'hero'} />
      ) : (
        <MediaFill src={cover} />
      )}
    </div>
  )
}
