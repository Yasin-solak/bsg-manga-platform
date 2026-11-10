import { useMemo } from 'react'
import { ProfileEffectSequenceLayers } from '@/components/profileEffects/ProfileEffectSequenceLayers'
import { cn } from '@/lib/utils'
import { resolveStoreAssetUrl } from '@/services/assetUrlService'
import { resolveProfileEffectManifest } from '@/services/profileEffectManifest'
import type { ShopCard, ShopGrant } from '@/services/shopService'
import { ShopFrameAvatar } from './ShopFrameStage'
import { findGrant } from './shopCardLayout'
import { useShopEffectAssets, useStageSize } from './shopLive'

/*
 * Bundle scene (like a Discord bundle card): bundle pieces as one group in the center; frames
 * with an avatar (the second small, behind), a profile effect beside it on a mini profile card (fits the card fully,
 * not cropped). Posters when idle; when live frames play with the reader's avatar, the effect sequence from the start.
 */

function EffectCard({ effect, live, playSession }: { effect: ShopGrant, live: boolean, playSession: number }) {
  const assets = useShopEffectAssets(effect.id, live)
  const manifest = useMemo(() => resolveProfileEffectManifest(assets), [assets])
  const poster = resolveStoreAssetUrl(effect.posterUrl ?? assets?.posterAssetUrl ?? effect.assetUrl) ?? null
  return (
    <div className='relative aspect-[450/880] h-[88%] flex-none overflow-hidden rounded-[10px] shadow-[0_20px_44px_-24px_rgba(0,0,0,0.9)] ring-1 ring-white/10'>
      {live ? (
        <div className='absolute inset-0'>
          <ProfileEffectSequenceLayers key={`${effect.id}-${playSession}`} active={Boolean(manifest)} manifest={manifest} posterAssetUrl={poster} />
        </div>
      ) : (
        <div className='absolute inset-0'>
          <ProfileEffectSequenceLayers active={false} posterAssetUrl={poster} />
        </div>
      )}
    </div>
  )
}

function Composition({ frames, effect, live, playSession, size }: { frames: ShopGrant[], effect: ShopGrant | undefined, live: boolean, playSession: number, size: number }) {
  const [first, second] = frames
  return (
    <div className='absolute inset-0 flex items-center justify-center gap-[5%] px-[5%]'>
      {(first || second) && (
        <div className='flex items-center'>
          {second && <ShopFrameAvatar grant={second} live={live} playSession={playSession} size={Math.round(size * 0.66)} className='-mr-[10%] translate-y-[14%] opacity-90' />}
          {first && <ShopFrameAvatar grant={first} live={live} playSession={playSession} size={size} className='relative z-[1]' />}
        </div>
      )}
      {effect && <EffectCard effect={effect} live={live} playSession={playSession} />}
    </div>
  )
}

export function ShopBundleStage({ card, live, playSession, className }: {
  card: ShopCard
  live: boolean
  playSession: number
  className?: string
}) {
  const frames = card.grants.filter((grant) => grant.type === 'frame').slice(0, 2)
  const effect = findGrant(card, 'profile_effect')
  const [stageRef, stageSize] = useStageSize<HTMLDivElement>(160)
  const size = Math.max(40, Math.round(stageSize * 0.5))

  return (
    <div ref={stageRef} className={cn('absolute inset-0 overflow-hidden', className)} data-shop-stage='bundle'>
      {!live && (
        <div className='absolute inset-0' data-shop-idle-layer='bundle'>
          <Composition frames={frames} effect={effect} live={false} playSession={0} size={size} />
        </div>
      )}
      {live && (
        <div className='absolute inset-0 animate-in fade-in duration-300' data-shop-live-layer='bundle'>
          <Composition frames={frames} effect={effect} live playSession={playSession} size={size} />
        </div>
      )}
    </div>
  )
}
