import { AvatarFrame } from '@components/common/AvatarFrame'
import { cn } from '@/lib/utils'
import { resolveAssetMediaType, resolveStoreAssetUrl } from '@/services/assetUrlService'
import type { ShopGrant } from '@/services/shopService'
import { useNearViewport } from './shopLive'
import { useShopViewer } from './shopViewer'
import { txa } from '@/i18n/activeLocale'

/*
 * Background scene: a still frame when idle (poster; for a posterless mp4 a video paused on the first frame,
 * preload='metadata', connecting when near the screen). When live the video plays from the start with a
 * small profile overlay (avatar + name) showing how the background looks on a profile.
 */

// First frame for a posterless video: a media fragment pauses the browser on that frame.
const FIRST_FRAME = '#t=0.1'

export function ShopBackgroundStage({ grant, cover, live, playSession, overlay = true, className }: {
  grant: ShopGrant | undefined
  cover?: string | null
  live: boolean
  playSession: number
  overlay?: boolean
  className?: string
}) {
  const viewer = useShopViewer()
  const [nearRef, near] = useNearViewport<HTMLDivElement>()
  const media = resolveStoreAssetUrl(grant?.assetUrl) ?? resolveStoreAssetUrl(grant?.posterUrl) ?? resolveStoreAssetUrl(cover)
  const poster = resolveStoreAssetUrl(grant?.posterUrl)
  const isVideo = resolveAssetMediaType(media) === 'video'

  return (
    <div ref={nearRef} className={cn('absolute inset-0 overflow-hidden bg-muted/40', className)} data-shop-stage='background'>
      {poster ? (
        <img src={poster} alt='' loading='lazy' decoding='async' className='absolute inset-0 size-full object-cover' data-shop-idle-layer='background' />
      ) : media && isVideo ? (
        near && (
          <video
            src={`${media}${FIRST_FRAME}`}
            preload='metadata'
            muted
            playsInline
            tabIndex={-1}
            aria-hidden
            className='absolute inset-0 size-full object-cover'
            data-shop-idle-layer='background'
          />
        )
      ) : media ? (
        <img src={media} alt='' loading='lazy' decoding='async' className='absolute inset-0 size-full object-cover' data-shop-idle-layer='background' />
      ) : null}

      {live && media && (
        <div className='absolute inset-0 animate-in fade-in duration-300' data-shop-live-layer='background'>
          {isVideo ? (
            <video
              key={`${media}-${playSession}`}
              src={media}
              preload='metadata'
              autoPlay
              loop
              muted
              playsInline
              tabIndex={-1}
              aria-hidden
              className='absolute inset-0 size-full object-cover'
            />
          ) : (
            <img key={playSession} src={media} alt='' className='shop-live-kenburns absolute inset-0 size-full object-cover' />
          )}
          {overlay && (
            <span className='absolute bottom-2.5 left-2.5 flex max-w-[70%] items-center gap-2 rounded-full bg-black/55 py-1 pl-1 pr-3 text-white shadow-lg backdrop-blur-md animate-in slide-in-from-bottom-2 fade-in duration-300'>
              <AvatarFrame src={viewer.avatar} alt={viewer.name} frameType='default' size={26} hoverPlayback='never' disableStoreLookup />
              <span className='min-w-0 leading-tight'>
                <span className='block truncate text-[12px] font-extrabold'>{viewer.name}</span>
                <span className='block truncate text-[10px] text-white/65'>{txa('profilinde böyle durur')}</span>
              </span>
            </span>
          )}
        </div>
      )}
    </div>
  )
}
