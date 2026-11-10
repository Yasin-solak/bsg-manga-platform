import type { CSSProperties } from 'react'
import { cn } from '@/lib/utils'
import { resolveStageTheme, type ProfileTheme, type ProfileThemePattern } from '@/lib/profileTheme'
import './profileTheme.css'

/*
 * Profile theme background: dark base + style layer (aurora / gradient / spotlight / mosaic) + pattern
 * + optional user background (blurred). The profile scene, lock screen and theme preview
 * use the same background. Aurora drifts gently; stops with the reduced motion preference.
 */

const PATTERN_STYLE: Record<Exclude<ProfileThemePattern, 'none'>, CSSProperties> = {
  dots: {
    backgroundImage: 'radial-gradient(rgb(255 255 255 / 0.16) 1px, transparent 1.6px)',
    backgroundSize: '18px 18px',
  },
  grid: {
    backgroundImage: 'linear-gradient(rgb(255 255 255 / 0.07) 1px, transparent 1px), linear-gradient(90deg, rgb(255 255 255 / 0.07) 1px, transparent 1px)',
    backgroundSize: '34px 34px',
    maskImage: 'radial-gradient(ellipse at 50% 30%, #000 30%, transparent 85%)',
  },
  stars: {
    backgroundImage: [
      'radial-gradient(1.4px 1.4px at 12% 18%, rgb(255 255 255 / 0.9), transparent)',
      'radial-gradient(1px 1px at 33% 72%, rgb(255 255 255 / 0.7), transparent)',
      'radial-gradient(1.8px 1.8px at 58% 32%, rgb(255 255 255 / 0.85), transparent)',
      'radial-gradient(1px 1px at 76% 64%, rgb(255 255 255 / 0.6), transparent)',
      'radial-gradient(1.3px 1.3px at 88% 14%, rgb(255 255 255 / 0.8), transparent)',
      'radial-gradient(1px 1px at 45% 90%, rgb(255 255 255 / 0.6), transparent)',
      'radial-gradient(1.6px 1.6px at 6% 56%, rgb(255 255 255 / 0.75), transparent)',
    ].join(','),
    backgroundSize: '260px 260px',
  },
  waves: {
    backgroundImage: 'repeating-radial-gradient(circle at 0% 100%, rgb(255 255 255 / 0.06) 0 2px, transparent 2px 26px)',
  },
  noise: {
    backgroundImage: `url("data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.55 0"/></filter><rect width="100%" height="100%" filter="url(#n)"/></svg>')}")`,
    opacity: 0.35,
  },
}

function StyleLayer({ theme }: { theme: ProfileTheme }) {
  const { mainColor: main, accentColor: accent } = theme
  const mid = `color-mix(in oklch, ${main} 50%, ${accent})`
  if (theme.style === 'aurora') {
    return (
      <>
        <span className='profile-aurora-blob absolute -left-[15%] -top-[25%] size-[70%] rounded-full blur-[90px]' style={{ background: main, opacity: 0.75 }} />
        <span className='profile-aurora-blob profile-aurora-blob--slow absolute -right-[18%] top-[5%] size-[65%] rounded-full blur-[100px]' style={{ background: accent, opacity: 0.7 }} />
        <span className='profile-aurora-blob profile-aurora-blob--late absolute -bottom-[35%] left-[20%] size-[70%] rounded-full blur-[110px]' style={{ background: mid, opacity: 0.55 }} />
      </>
    )
  }
  if (theme.style === 'gradient') {
    return <span className='absolute inset-0' style={{ background: `linear-gradient(155deg, ${main} 0%, ${mid} 42%, ${accent} 78%, #07080b 100%)`, opacity: 0.85 }} />
  }
  if (theme.style === 'spotlight') {
    return (
      <span
        className='absolute inset-0'
        style={{ background: `radial-gradient(ellipse 75% 60% at 50% -5%, ${main} 0%, transparent 70%), radial-gradient(ellipse 60% 45% at 50% 105%, ${accent} 0%, transparent 70%)`, opacity: 0.9 }}
      />
    )
  }
  return (
    <span
      className='absolute inset-0'
      style={{
        background: [
          `radial-gradient(at 0% 0%, ${main} 0px, transparent 55%)`,
          `radial-gradient(at 100% 0%, ${accent} 0px, transparent 50%)`,
          `radial-gradient(at 0% 100%, ${accent} 0px, transparent 50%)`,
          `radial-gradient(at 100% 100%, ${main} 0px, transparent 55%)`,
          `radial-gradient(at 50% 50%, ${mid} 0px, transparent 60%)`,
        ].join(','),
        opacity: 0.8,
      }}
    />
  )
}

export function ProfileThemeBackdrop({ theme, imageUrl, className, rounded = 'rounded-2xl' }: {
  theme: ProfileTheme | null
  imageUrl?: string | null
  className?: string
  rounded?: string
}) {
  const resolved = resolveStageTheme(theme)
  return (
    <div className={cn('pointer-events-none absolute inset-0 overflow-hidden bg-[#07080b]', rounded, className)} aria-hidden data-profile-theme-style={resolved.style} data-profile-theme-pattern={resolved.pattern}>
      <StyleLayer theme={resolved} />
      {/* Tema seciliyse kullanici gorseli geri planda kalir: tema renkleri sahneyi tasir. */}
      {imageUrl && <img src={imageUrl} alt='' className={cn('absolute inset-0 size-full scale-110 object-cover blur-2xl', theme ? 'opacity-20' : 'opacity-35')} />}
      {resolved.pattern !== 'none' && <span className='absolute inset-0' style={PATTERN_STYLE[resolved.pattern]} />}
      <span className={cn('absolute inset-0 bg-[radial-gradient(ellipse_at_50%_40%,transparent_45%,rgb(0_0_0/var(--profile-vignette))_100%)]', theme ? '[--profile-vignette:0.3]' : '[--profile-vignette:0.45]')} />
    </div>
  )
}
