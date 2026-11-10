import { AvatarFrame } from '@components/common/AvatarFrame'
import { resolveFramePosterUrl } from '@/components/cosmetics/frameVisualUrls'
import type { StoreItem } from '@/data/storeProducts'
import { cn } from '@/lib/utils'
import { resolveStoreAssetUrl } from '@/services/assetUrlService'
import type { ShopGrant } from '@/services/shopService'
import { useStageSize } from './shopLive'
import { useShopViewer } from './shopViewer'

/*
 * Frame scene (like a Discord avatar decoration): a frame poster around a default avatar when idle;
 * when live the poster vanishes and the frame plays with the reader's OWN avatar. playSession changes on each
 * entry so the animation starts over. The bundle scene uses the same part (ShopFrameAvatar).
 */

// Default avatar under the frame when idle (a neutral silhouette like Discord's default avatar).
const PLACEHOLDER_AVATAR = `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#2c2f36"/><circle cx="32" cy="25" r="11" fill="#6b707b"/><path d="M12 58c2-12 10-18 20-18s18 6 20 18z" fill="#6b707b"/></svg>')}`

function frameItem(grant: ShopGrant): StoreItem {
  return {
    id: grant.id,
    identifier: grant.identifier,
    name: grant.name,
    description: '',
    price: 0,
    currency: 'Coin',
    type: 'frame',
    frameType: grant.identifier,
    customAssetUrl: grant.assetUrl ?? undefined,
    posterAssetUrl: grant.posterUrl ?? undefined,
  }
}

/** Cerceveli avatar: bosta varsayilan avatar + poster, canliyken okurun avatari + animasyon. */
export function ShopFrameAvatar({ grant, live, playSession, size, className }: {
  grant: ShopGrant
  live: boolean
  playSession: number
  size: number
  className?: string
}) {
  const viewer = useShopViewer()
  const poster = resolveFramePosterUrl(frameItem(grant))
  const overlay = resolveStoreAssetUrl(grant.assetUrl)
  const box = Math.round(size * 1.45)

  return (
    <span className={cn('relative flex flex-none items-center justify-center', className)} style={{ width: box, height: box }}>
      {!live && (poster ? (
        <span className='absolute inset-0 flex items-center justify-center' data-shop-idle-layer='frame'>
          <img src={PLACEHOLDER_AVATAR} alt='' className='absolute rounded-full' style={{ width: size, height: size }} />
          <img
            src={poster}
            alt=''
            loading='lazy'
            decoding='async'
            draggable={false}
            className='relative size-full object-contain drop-shadow-[0_14px_30px_rgba(0,0,0,0.6)]'
          />
        </span>
      ) : (
        <span className='absolute inset-0 flex items-center justify-center' data-shop-idle-layer='frame'>
          {/* Yerlesik cercevelerin (cadilar bayrami, noel) bosta gorseli yok; durgun gorsel 'always' ile yuklenir. */}
          <AvatarFrame src={PLACEHOLDER_AVATAR} alt='' frameType={grant.identifier} size={size} customOverlayUrl={overlay} disableStoreLookup hoverPlayback='always' />
        </span>
      ))}
      {live && (
        <div className='absolute inset-0 flex items-center justify-center animate-in fade-in zoom-in-95 duration-300' data-shop-live-layer='frame'>
          <AvatarFrame
            key={`${grant.id}-${playSession}`}
            src={viewer.avatar}
            alt={viewer.name}
            frameType={grant.identifier}
            size={size}
            animated
            customOverlayUrl={overlay}
            posterOverlayUrl={poster}
            disableStoreLookup
            hoverPlayback='always'
          />
        </div>
      )}
    </span>
  )
}

export function ShopFrameStage({ grant, live, playSession, scale = 0.5, className }: {
  grant: ShopGrant
  live: boolean
  playSession: number
  scale?: number
  className?: string
}) {
  const [stageRef, stageSize] = useStageSize<HTMLDivElement>(180)
  const size = Math.max(44, Math.round(stageSize * scale))

  return (
    <div ref={stageRef} className={cn('absolute inset-0 flex items-center justify-center', className)} data-shop-stage='frame'>
      <span aria-hidden className='absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,color-mix(in_oklch,var(--foreground)_7%,transparent),transparent_60%)]' />
      <ShopFrameAvatar grant={grant} live={live} playSession={playSession} size={size} />
    </div>
  )
}
