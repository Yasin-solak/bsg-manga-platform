import { AvatarFrame } from '@/components/common/AvatarFrame'
import type { StoreItem } from '@/data/storeProducts'
import { cn } from '@/lib/utils'

import { resolveFrameOverlayUrl, resolveFramePosterUrl } from './frameVisualUrls'

const MEDIA_STAGE_CLASS = 'absolute inset-x-0 top-7 z-10 flex h-[188px] items-center justify-center px-8'
const STAGE_BACKGROUND_CLASS = 'absolute inset-0 bg-[radial-gradient(circle_at_50%_32%,rgba(148,163,184,0.1),transparent_38%),linear-gradient(145deg,#f1f5f9_0%,#e2e8f0_64%,#dbe2ea_100%)] dark:bg-[radial-gradient(circle_at_50%_32%,rgba(148,163,184,0.12),transparent_34%),linear-gradient(145deg,#090b11_0%,#050608_64%,#020203_100%)]'

// Cercevenin durgun kapak gorseli (poster); aktifken canli avatara yer acar.
export function FrameCoverArt({
  item,
  active,
  stageClassName = MEDIA_STAGE_CLASS,
  posterClassName,
}: {
  item: StoreItem
  active: boolean
  stageClassName?: string
  posterClassName?: string
}) {
  const posterUrl = resolveFramePosterUrl(item)

  return (
    <div
      className={cn(
        'absolute inset-0 z-10 overflow-hidden transition-[opacity,transform,filter] duration-300',
        active ? 'scale-[0.985] opacity-0 blur-[1px]' : 'scale-100 opacity-100 blur-0',
      )}
      data-frame-cover='true'
      aria-hidden={active}
    >
      <div className={STAGE_BACKGROUND_CLASS} />
      <div className={stageClassName}>
        {posterUrl ? (
          <img
            src={posterUrl}
            alt=''
            className={cn('relative z-10 h-[172px] w-[172px] object-contain drop-shadow-[0_18px_40px_rgba(0,0,0,0.76)]', posterClassName)}
            style={{ clipPath: 'inset(2px 0 0 0)' }}
            loading='lazy'
            decoding='async'
            draggable={false}
          />
        ) : (
          <span className='relative z-10 h-[118px] w-[118px] rounded-full border border-white/16 bg-white/[0.06]' />
        )}
      </div>
    </div>
  )
}

// Cercevenin okurun avatariyla canli hali; playSession her degistiginde animasyon bastan oynar.
export function FrameLiveAvatar({
  item,
  active,
  playSession,
  userAvatar,
  size = 118,
  stageClassName = MEDIA_STAGE_CLASS,
}: {
  item: StoreItem
  active: boolean
  playSession: number
  userAvatar: string
  size?: number
  stageClassName?: string
}) {
  return (
    <div
      className={cn(
        'absolute inset-0 z-20 overflow-hidden transition-[opacity,transform,filter] duration-300',
        active ? 'scale-100 opacity-100 blur-0' : 'scale-[0.985] opacity-0 blur-[1px]',
      )}
      data-frame-live='true'
      aria-hidden={!active}
    >
      <div className={STAGE_BACKGROUND_CLASS} />
      <div className={stageClassName}>
        {active ? (
          <AvatarFrame
            key={`live-frame-${item.id}-${playSession}`}
            src={userAvatar}
            alt={item.name}
            frameType={item.frameType ?? 'default'}
            size={size}
            animated
            customOverlayUrl={resolveFrameOverlayUrl(item)}
            posterOverlayUrl={resolveFramePosterUrl(item)}
            hoverPlayback='always'
          />
        ) : null}
      </div>
    </div>
  )
}
