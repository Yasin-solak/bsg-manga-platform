import { useMemo } from 'react'
import { ProfileEffectSequenceLayers } from '@/components/profileEffects/ProfileEffectSequenceLayers'
import { cn } from '@/lib/utils'
import { resolveStoreAssetUrl } from '@/services/assetUrlService'
import { resolveProfileEffectManifest } from '@/services/profileEffectManifest'
import type { ShopGrant } from '@/services/shopService'
import { useShopEffectAssets } from './shopLive'

/*
 * Profile effect scene: a card-asset poster on a skeleton profile when idle. When live the effect
 * assets (store_profile_effect_assets) load the first time and the sequence plays from the start on the skeleton profile.
 * The profile card is tall so it fits the scene fully (the whole effect is visible); with ambient on, both sides
 * fill with a blurred poster so the card is not empty.
 */

export function ShopEffectStage({ grant, cover, live, playSession, className, cardClassName, ambient = false }: {
  grant: ShopGrant
  cover?: string | null
  live: boolean
  playSession: number
  className?: string
  cardClassName?: string
  ambient?: boolean
}) {
  const assets = useShopEffectAssets(grant.id, live)
  const manifest = useMemo(() => resolveProfileEffectManifest(assets), [assets])
  const poster = resolveStoreAssetUrl(grant.posterUrl ?? assets?.posterAssetUrl ?? grant.assetUrl ?? cover) ?? null

  return (
    <div className={cn('absolute inset-0 flex items-center justify-center overflow-hidden', className)} data-shop-stage='effect'>
      {ambient && poster ? (
        <img src={poster} alt='' aria-hidden loading='lazy' decoding='async' className='absolute inset-0 size-full scale-125 object-cover opacity-45 blur-2xl' />
      ) : (
        <span aria-hidden className='absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,color-mix(in_oklch,var(--foreground)_7%,transparent),transparent_60%)]' />
      )}
      <div className={cn('relative aspect-[450/880] h-[90%] overflow-hidden rounded-[12px] shadow-[0_22px_60px_-30px_rgba(0,0,0,0.9)] ring-1 ring-white/10', cardClassName)}>
        {live ? (
          <div className='absolute inset-0' data-shop-live-layer='effect'>
            <ProfileEffectSequenceLayers key={`${grant.id}-${playSession}`} active={Boolean(manifest)} manifest={manifest} posterAssetUrl={poster} />
          </div>
        ) : (
          <div className='absolute inset-0' data-shop-idle-layer='effect'>
            <ProfileEffectSequenceLayers active={false} posterAssetUrl={poster} />
          </div>
        )}
      </div>
    </div>
  )
}
