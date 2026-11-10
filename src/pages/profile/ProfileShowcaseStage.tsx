import { useEffect, useRef, type ReactNode } from 'react'
import { CaretDown } from '@phosphor-icons/react'
import { isVideoAssetUrl, resolveStoreAssetUrl } from '@/services/assetUrlService'
import { resolveProfileSurfaceImage } from './profileMedia'
import { ProfileShowcaseSlot } from './ProfileShowcaseSlot'
import type { ProfileSlotData } from './profileSlotData'
import type { ProfileLayout, ProfileSlotModule } from './profileLayout'
import { profileStageVars, type ProfileTheme } from '@/lib/profileTheme'
import { ProfileThemeBackdrop } from './ProfileThemeBackdrop'
import type { OwnedBackground } from './types'
import { txa } from '@/i18n/activeLocale'

/*
 * Profile showcase (prototype v3): a full-width scene. An identity card in the center (effect on top),
 * showcase modules chosen by the owner on both sides. On mobile the card on top, slots below. Background, side
 * card surfaces and buttons come from the profile theme (style + pattern + colors).
 */

function StageBackdrop({ bg, theme }: { bg: OwnedBackground | null, theme: ProfileTheme | null }) {
  const raw = bg ? resolveStoreAssetUrl(bg.background) || bg.background || '' : ''
  const url = raw ? resolveProfileSurfaceImage(raw, 1400, 70) || raw : ''
  const isImage = Boolean(url) && bg?.mediaType !== 'video' && !isVideoAssetUrl(url)
  return (
    <>
      <ProfileThemeBackdrop theme={theme} imageUrl={isImage ? url : null} />
      {/* Asagi kaydirdikca sahne sayfa zeminine soner. */}
      <div className='pointer-events-none absolute inset-0 rounded-2xl bg-background' style={{ opacity: 'calc(var(--stage-fade, 0) * 0.7)' }} aria-hidden />
    </>
  )
}

/**
 * Shared showcase scene: card in the center, slots on both sides, a "more" button below. The profile gives its own
 * selectable slots, the fansub page its fixed modules.
 */
export function ShowcaseStage({ card, left, right, onContinue, bg, theme, continueLabel, continueHint, backdrop, testId = 'profile-showcase-stage' }: {
  card: ReactNode
  /** Zeminin ustunde, icerigin altinda ek katman (or. fansub kapak duvari). */
  backdrop?: ReactNode
  left: ReactNode
  right: ReactNode
  onContinue: () => void
  bg: OwnedBackground | null
  theme: ProfileTheme | null
  continueLabel: string
  continueHint: string
  testId?: string
}) {
  const sectionRef = useRef<HTMLElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  // As you scroll down the showcase falls behind: fades, shrinks slightly, blurs and
  // slowly slides down (parallax). Off with the reduced motion preference.
  useEffect(() => {
    const section = sectionRef.current
    const content = contentRef.current
    if (!section || !content || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined
    let frame = 0
    const apply = () => {
      frame = 0
      const rect = section.getBoundingClientRect()
      const progress = Math.min(1, Math.max(0, -rect.top / Math.max(1, rect.height * 0.7)))
      content.style.opacity = String(1 - progress * 0.85)
      content.style.transform = progress ? `translateY(${Math.round(progress * 64)}px) scale(${1 - progress * 0.06})` : ''
      content.style.filter = progress > 0.02 ? `blur(${(progress * 5).toFixed(1)}px)` : ''
      section.style.setProperty('--stage-fade', progress.toFixed(3))
    }
    const onScroll = () => { if (!frame) frame = window.requestAnimationFrame(apply) }
    apply()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [])

  return (
    <section ref={sectionRef} className='relative flex min-h-[calc(100svh-5rem)] flex-col justify-center rounded-2xl border border-[var(--profile-surface-border)] lg:min-h-[calc(100svh-1.5rem)]' style={profileStageVars(theme)} data-testid={testId}>
      <StageBackdrop bg={bg} theme={theme} />
      {backdrop}
      {/* Sahne her temada koyu: kart ve yuvalar koyu tokenlarla, vurgu profil temasindan. */}
      <div ref={contentRef} className='dark relative grid origin-top items-center gap-6 will-change-[opacity,transform] px-4 pb-16 pt-8 sm:px-8 xl:grid-cols-[minmax(0,280px)_minmax(0,380px)_minmax(0,280px)] xl:justify-between xl:gap-10 xl:px-14'>
        <div className='order-2 xl:order-1'>{left}</div>
        <div className='order-1 mx-auto w-full max-w-[380px] xl:order-2'>{card}</div>
        <div className='order-3'>{right}</div>
      </div>
      <button
        type='button'
        onClick={onContinue}
        className='absolute bottom-4 left-1/2 flex -translate-x-1/2 flex-col items-center gap-0.5 bg-transparent text-white/75 hover:text-white'
        style={{ opacity: 'calc(1 - var(--stage-fade, 0) * 2.5)' }}
        data-testid='profile-continue'
      >
        <span className='text-[13px] font-bold'>{continueLabel}</span>
        <span className='hidden text-[11px] text-white/55 sm:block'>{continueHint}</span>
        <CaretDown weight='bold' size={14} className='animate-bounce' />
      </button>
    </section>
  )
}

export function ProfileShowcaseStage({ card, layout, data, canEdit, onSlotChange, onContinue, bg, theme }: {
  card: ReactNode
  layout: ProfileLayout
  data: ProfileSlotData
  canEdit: boolean
  onSlotChange: (side: 'left' | 'right', module: ProfileSlotModule) => void
  onContinue: () => void
  bg: OwnedBackground | null
  theme: ProfileTheme | null
}) {
  const slot = (side: 'left' | 'right') => (
    <ProfileShowcaseSlot
      side={side}
      module={side === 'left' ? layout.slotLeft : layout.slotRight}
      otherModule={side === 'left' ? layout.slotRight : layout.slotLeft}
      data={data}
      canEdit={canEdit}
      onChange={(module) => onSlotChange(side, module)}
    />
  )
  return (
    <ShowcaseStage
      card={card}
      left={slot('left')}
      right={slot('right')}
      onContinue={onContinue}
      bg={bg}
      theme={theme}
      continueLabel={txa('Profilin devamı')}
      continueHint={txa('Seriler · Listeler · İstatistikler')}
    />
  )
}
