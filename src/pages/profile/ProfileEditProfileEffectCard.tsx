import { memo, useState } from 'react'
import { Ban, Check } from 'lucide-react'

import { ProfileEffectSequenceLayers } from '@/components/profileEffects/ProfileEffectSequenceLayers'
import { resolveProfileEffectManifest } from '@/services/profileEffectManifest'
import { cn } from '@/lib/utils'
import { resolveStoreAssetUrl } from '@/services/assetUrlService'
import type { ProfileOwnedEffect } from './types'
import { txa } from '@/i18n/activeLocale'

type ProfileEditProfileEffectCardProps = {
  disabled?: boolean
  effect: ProfileOwnedEffect | null
  onSelect: () => void
  selected: boolean
}

function resolveEffectPoster(effect: ProfileOwnedEffect | null) {
  if (!effect) return null
  const rawUrl =
    effect.profileEffectAssets?.posterAssetUrl ||
    effect.posterAssetUrl ||
    effect.image ||
    effect.customAssetUrl ||
    ''
  return resolveStoreAssetUrl(rawUrl) || rawUrl || null
}

/**
 * SAME media anatomy as the shop profile effect card: a poster over a skeleton profile mockup
 * (when idle) and an animated effect on hover/selection
 * (ProfileEffectSequenceLayers). The surface follows the theme: light on light, dark on dark.
 */
function ProfileEditProfileEffectCardComponent({
  disabled,
  effect,
  onSelect,
  selected,
}: ProfileEditProfileEffectCardProps) {
  const [active, setActive] = useState(false)
  const title = effect?.name || txa('Efekt yok')
  const manifest = resolveProfileEffectManifest(effect?.profileEffectAssets)
  const posterAssetUrl = resolveEffectPoster(effect)
  const isLive = active || selected

  return (
    <button
      type="button"
      aria-label={txa('{v1} profil efektini seç', { v1: title })}
      aria-pressed={selected}
      disabled={disabled}
      onClick={onSelect}
      onMouseEnter={() => setActive(true)}
      onMouseLeave={() => setActive(false)}
      onFocus={() => setActive(true)}
      onBlur={() => setActive(false)}
      data-active={isLive ? 'true' : 'false'}
      className={cn(
        'group relative isolate grid aspect-square w-full place-items-center overflow-hidden rounded-[22px] border bg-slate-100 dark:bg-[#050608] text-left outline-none transition-[border-color,box-shadow,transform] duration-300',
        'border-slate-200 dark:border-[#8fd8cf]/15 shadow-[0_28px_86px_-58px_rgba(148,163,184,0.34)]',
        'hover:border-primary/35 hover:shadow-[0_34px_94px_-62px_hsl(var(--primary)/0.5)]',
        'focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'disabled:cursor-not-allowed disabled:opacity-70 [content-visibility:auto] [contain-intrinsic-size:220px]',
        selected && 'border-primary/55 shadow-[0_0_0_1px_hsl(var(--primary)/0.4),0_34px_94px_-62px_hsl(var(--primary)/0.6)]',
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(148,163,184,0.1),transparent_38%),linear-gradient(145deg,#f1f5f9_0%,#e2e8f0_62%,#dbe2ea_100%)] dark:bg-[radial-gradient(circle_at_50%_42%,rgba(148,163,184,0.12),transparent_34%),linear-gradient(145deg,#090b11_0%,#050608_62%,#020203_100%)]" />

      {effect ? (
        <div className="relative aspect-[450/880] h-[92%] max-h-[300px] overflow-hidden rounded-[18px] shadow-[0_22px_70px_-48px_rgba(0,0,0,0.95)]">
          <ProfileEffectSequenceLayers active={isLive} manifest={manifest} posterAssetUrl={posterAssetUrl} />
        </div>
      ) : (
        <div className="relative grid aspect-[450/880] h-[92%] max-h-[300px] place-items-center overflow-hidden rounded-[18px] bg-[radial-gradient(circle_at_50%_32%,rgba(148,163,184,0.12),transparent_40%),linear-gradient(145deg,#e2e8f0,#cbd5e1)] dark:bg-[radial-gradient(circle_at_50%_32%,rgba(148,163,184,0.12),transparent_40%),linear-gradient(145deg,#0b0d13,#050608)]">
          <span className="flex size-14 items-center justify-center rounded-full border border-border dark:border-white/12 bg-background/40 text-muted-foreground">
            <Ban className="size-7" />
          </span>
        </div>
      )}

      {selected ? (
        <span className="absolute left-2.5 top-2.5 z-30 inline-flex items-center gap-1 rounded-full border border-primary/50 bg-primary px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] text-primary-foreground shadow-[0_10px_26px_hsl(var(--primary)/0.4)]">
          <Check className="size-3" />
          {txa('Aktif')}
        </span>
      ) : null}

      <div className="absolute inset-x-0 bottom-0 z-20 flex min-h-[84px] flex-col items-center justify-end px-3 pb-2.5 pt-10 text-center bg-[linear-gradient(0deg,rgba(241,245,249,0.98)_0%,rgba(241,245,249,0.92)_44%,rgba(241,245,249,0.55)_70%,transparent_100%)] dark:bg-[linear-gradient(0deg,rgba(2,3,5,0.98)_0%,rgba(2,3,5,0.94)_44%,rgba(2,3,5,0.62)_70%,transparent_100%)]">
        <span className="pointer-events-none absolute inset-x-7 bottom-1.5 h-px rounded-full bg-gradient-to-r from-transparent via-slate-400/30 dark:via-slate-200/30 to-transparent opacity-55" />
        <h4 className="max-w-full truncate text-[14px] font-black leading-5 text-slate-900 dark:text-white dark:[text-shadow:0_2px_18px_rgba(0,0,0,0.72)]">
          {title}
        </h4>
        <div className="relative mt-1 flex h-7 w-full items-center justify-center">
          <span
            className={cn(
              'absolute inset-x-0 top-1/2 -translate-y-1/2 truncate text-[11px] font-bold text-slate-600 dark:text-white/55 transition-[opacity,transform] duration-200',
              active && !selected ? '-translate-y-[64%] opacity-0' : 'opacity-100',
              selected && 'text-[#0f8c7f] dark:text-[#8fd8cf]',
            )}
            aria-hidden={active && !selected}
          >
            {selected ? txa('Kullanılıyor') : effect ? (effect.themeName || txa('Profil efekti')) : txa('Efekt uygulanmaz')}
          </span>
          <span
            className={cn(
              'absolute inset-x-0 top-1/2 flex -translate-y-1/2 items-center justify-center transition-[opacity,transform] duration-200',
              active && !selected ? 'opacity-100' : 'pointer-events-none translate-y-[-36%] opacity-0',
            )}
            aria-hidden={!active || selected}
          >
            <span className="inline-flex h-7 min-w-[96px] items-center justify-center rounded-[12px] border border-slate-300/70 bg-[linear-gradient(135deg,rgba(241,245,249,0.98),rgba(226,232,240,0.98))] px-3 text-[12px] font-black text-slate-900 shadow-[0_16px_42px_-24px_rgba(148,163,184,0.62)] backdrop-blur-md dark:border-slate-100/20 dark:bg-[linear-gradient(135deg,rgba(36,43,55,0.98),rgba(12,15,21,0.98))] dark:text-white">
              {txa('Kullan')}
            </span>
          </span>
        </div>
      </div>
    </button>
  )
}

const ProfileEditProfileEffectCard = memo(ProfileEditProfileEffectCardComponent)

export default ProfileEditProfileEffectCard
