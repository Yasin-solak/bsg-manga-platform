import { memo, useState } from 'react'
import { Check, Sparkles } from 'lucide-react'

import { FrameCoverArt, FrameLiveAvatar } from '@/components/cosmetics/FrameVisuals'
import type { StoreItem } from '@/data/storeProducts'
import { cn } from '@/lib/utils'
import type { ResolvedInventoryItem } from '@/services/inventoryResolver'
import type { FrameType } from '@components/common/AvatarFrame'
import { resolveProfileFrameTitle } from './profileFrameDisplay'
import { KNOWN_PROFILE_FRAME_TYPES } from './helpers'
import { txa } from '@/i18n/activeLocale'

type ProfileEditFrameCardProps = {
  avatarUrl: string
  disabled?: boolean
  frameId: string
  item?: ResolvedInventoryItem
  onSelect: () => void
  selected: boolean
}

function resolveFrameType(frameId: string): FrameType {
  return KNOWN_PROFILE_FRAME_TYPES.includes(frameId as (typeof KNOWN_PROFILE_FRAME_TYPES)[number])
    ? (frameId as FrameType)
    : 'default'
}

function buildFrameStoreItem(frameId: string, item?: ResolvedInventoryItem): StoreItem {
  const title = resolveProfileFrameTitle(frameId, item)

  return {
    id: frameId,
    identifier: item?.identifier || frameId,
    name: title,
    description: item?.customAssetUrl ? txa('Özel avatar çerçevesi') : txa('Avatar çerçevesi'),
    price: 0,
    currency: 'Coin',
    type: 'frame',
    frameType: resolveFrameType(frameId),
    customAssetUrl: item?.customAssetUrl,
    posterAssetUrl: item?.posterAssetUrl,
  }
}

/**
 * Same anatomy as the shop frame card: a cover image when idle, a live frame preview with the
 * user's avatar on hover, name + action band below.
 * The surface follows the theme: light on light, cinematic dark on dark.
 */
function ProfileEditFrameCardComponent({
  avatarUrl,
  disabled,
  frameId,
  item,
  onSelect,
  selected,
}: ProfileEditFrameCardProps) {
  const [active, setActive] = useState(false)
  const [playSession, setPlaySession] = useState(0)
  const title = resolveProfileFrameTitle(frameId, item)
  const frameItem = buildFrameStoreItem(frameId, item)
  const isLive = active || selected

  const activate = () => {
    setActive((wasActive) => {
      if (!wasActive) setPlaySession((current) => current + 1)
      return true
    })
  }

  return (
    <button
      type="button"
      aria-label={txa('{v1} çerçevesini seç', { v1: title })}
      aria-pressed={selected}
      disabled={disabled}
      onClick={onSelect}
      onMouseEnter={activate}
      onMouseLeave={() => setActive(false)}
      onFocus={activate}
      onBlur={() => setActive(false)}
      data-active={isLive ? 'true' : 'false'}
      className={cn(
        'group relative isolate aspect-square w-full overflow-hidden rounded-[22px] border bg-slate-100 dark:bg-[#050608] text-left outline-none transition-[border-color,box-shadow,transform] duration-300',
        'border-slate-200 dark:border-white/[0.08] shadow-[0_28px_86px_-58px_rgba(148,163,184,0.38)]',
        'hover:border-primary/30 hover:shadow-[0_34px_94px_-62px_hsl(var(--primary)/0.5)]',
        'focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'disabled:cursor-not-allowed disabled:opacity-70 [content-visibility:auto] [contain-intrinsic-size:220px]',
        selected && 'border-primary/55 shadow-[0_0_0_1px_hsl(var(--primary)/0.4),0_34px_94px_-62px_hsl(var(--primary)/0.6)]',
      )}
    >
      <FrameCoverArt
        item={frameItem}
        active={isLive}
        stageClassName="absolute inset-x-0 top-4 z-10 flex h-[58%] items-center justify-center px-5"
        posterClassName="h-[82%] w-auto max-w-[82%]"
      />
      <FrameLiveAvatar
        item={frameItem}
        active={isLive}
        playSession={playSession}
        userAvatar={avatarUrl}
        size={92}
        stageClassName="absolute inset-x-0 top-4 z-10 flex h-[58%] items-center justify-center px-5"
      />

      {selected ? (
        <span className="absolute left-2.5 top-2.5 z-40 inline-flex items-center gap-1 rounded-full border border-primary/50 bg-primary px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] text-primary-foreground shadow-[0_10px_26px_hsl(var(--primary)/0.4)]">
          <Check className="size-3" />
          {txa('Aktif')}
        </span>
      ) : null}
      {item?.customAssetUrl ? (
        <span className="absolute right-2.5 top-2.5 z-40 grid size-7 place-items-center rounded-full border border-white/15 bg-black/45 text-primary backdrop-blur">
          <Sparkles className="size-3.5" />
        </span>
      ) : null}

      <div className="absolute inset-x-0 bottom-0 z-30 flex min-h-[88px] flex-col items-center justify-end px-3 pb-2.5 pt-9 text-center bg-[linear-gradient(0deg,rgba(241,245,249,0.98)_0%,rgba(241,245,249,0.9)_44%,rgba(241,245,249,0.5)_74%,transparent_100%)] dark:bg-[linear-gradient(0deg,rgba(2,3,5,0.98)_0%,rgba(2,3,5,0.9)_44%,rgba(2,3,5,0.5)_74%,transparent_100%)]">
        <span className="pointer-events-none absolute inset-x-7 bottom-1.5 h-px rounded-full bg-gradient-to-r from-transparent via-slate-400/30 dark:via-slate-200/30 to-transparent opacity-55" />
        <h4 className="max-w-full truncate text-[14px] font-black leading-5 text-slate-900 dark:text-white dark:[text-shadow:0_2px_18px_rgba(0,0,0,0.72)]">
          {title}
        </h4>
        <div className="relative mt-1 flex h-7 w-full items-center justify-center">
          <span
            className={cn(
              'absolute inset-x-0 top-1/2 -translate-y-1/2 truncate text-[11px] font-bold text-slate-600 dark:text-white/55 transition-[opacity,transform] duration-200',
              active && !selected ? '-translate-y-[64%] opacity-0' : 'opacity-100',
              selected && 'text-primary dark:text-primary',
            )}
            aria-hidden={active && !selected}
          >
            {selected ? txa('Kullanılıyor') : item?.customAssetUrl ? txa('Özel çerçeve') : txa('Kayıtlı seçenek')}
          </span>
          <span
            className={cn(
              'absolute inset-x-0 top-1/2 flex -translate-y-1/2 items-center justify-center transition-[opacity,transform] duration-200',
              active && !selected ? 'opacity-100' : 'pointer-events-none translate-y-[-36%] opacity-0',
            )}
            aria-hidden={!active || selected}
          >
            <span className="inline-flex h-7 min-w-[96px] items-center justify-center rounded-[11px] border border-slate-300/70 bg-[linear-gradient(135deg,rgba(241,245,249,0.98),rgba(226,232,240,0.98))] px-3 text-[12px] font-black text-slate-900 shadow-[0_16px_42px_-24px_rgba(148,163,184,0.62)] backdrop-blur-md dark:border-slate-100/20 dark:bg-[linear-gradient(135deg,rgba(36,43,55,0.98),rgba(12,15,21,0.98))] dark:text-white">
              {txa('Kullan')}
            </span>
          </span>
        </div>
      </div>
    </button>
  )
}

const ProfileEditFrameCard = memo(ProfileEditFrameCardComponent)

export default ProfileEditFrameCard
