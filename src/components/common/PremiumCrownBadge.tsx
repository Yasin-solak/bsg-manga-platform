/**
 * PremiumCrownBadge: a polished, animated gold crown emblem representing "Premium member"
 * on profile/hover surfaces.
 *
 * Design decision (v9):
 * - A prestigious icon instead of a text chip: filled gold gradient (highlight → gold
 * → deep amber), a faceted center stone, a shine sweep
 * moving over it and a soft outer glow. "Premium" wants a prestigious feel;
 * icon + gold + shine carry that far better than a text chip.
 * - The SAME component is used on the hover card and profile showcase.
 * - clipPath keeps the shine moving only over the crown body.
 * - Accessibility: role="img" + aria-label; hover tooltip.
 *
 * Never again: do not put premium status in a chip with the word "Premium".
 */
import { useId, type CSSProperties } from 'react'
import { usePremiumPerk } from '@/lib/premiumPerks'
import { txa } from '@/i18n/activeLocale'

type PremiumCrownBadgeProps = {
  size?: number
  className?: string
  /** Hover tooltip / aria-label */
  label?: string
  style?: CSSProperties
}

let stylesInjected = false

function ensurePremiumCrownStyles() {
  if (stylesInjected || typeof document === 'undefined') return
  const style = document.createElement('style')
  style.dataset.premiumCrownBadge = 'true'
  style.textContent = `
    @keyframes premiumCrownGlow {
      0%, 100% { filter: drop-shadow(0 0 1.5px rgba(250, 204, 21, 0.5)); }
      50%      { filter: drop-shadow(0 0 4px rgba(250, 204, 21, 0.9)); }
    }
    @keyframes premiumCrownShine {
      0%   { transform: translateX(-140%) skewX(-18deg); }
      55%  { transform: translateX(160%) skewX(-18deg); }
      100% { transform: translateX(160%) skewX(-18deg); }
    }
    @keyframes premiumCrownGemPulse {
      0%, 100% { opacity: 0.85; }
      50%      { opacity: 1; }
    }
    @media (prefers-reduced-motion: reduce) {
      [data-premium-crown-glow], [data-premium-crown-shine], [data-premium-crown-gem] {
        animation: none !important;
      }
    }
  `
  document.head.appendChild(style)
  stylesInjected = true
}

export default function PremiumCrownBadge({
  size = 18,
  className,
  label = txa('Premium üye'),
  style,
}: PremiumCrownBadgeProps) {
  ensurePremiumCrownStyles()
  const rawId = useId().replace(/:/g, '')
  const goldId = `pc-gold-${rawId}`
  const gemId = `pc-gem-${rawId}`
  const clipId = `pc-clip-${rawId}`
  // Magaza Kontrol > Premium: "Premium rozeti" kapaliysa amblem hicbir yerde gosterilmez.
  const visible = usePremiumPerk('premium_badge')
  if (!visible) return null

  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        flexShrink: 0,
        ...style,
      }}
    >
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        xmlns="http://www.w3.org/2000/svg"
        data-premium-crown-glow="true"
        style={{ animation: 'premiumCrownGlow 2.8s ease-in-out infinite' }}
      >
        <defs>
          <linearGradient id={goldId} x1="0%" y1="0%" x2="50%" y2="100%">
            <stop offset="0%" stopColor="#fff7d6" />
            <stop offset="34%" stopColor="#fcd34d" />
            <stop offset="70%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#b45309" />
          </linearGradient>
          <radialGradient id={gemId} cx="50%" cy="38%" r="65%">
            <stop offset="0%" stopColor="#fecdd3" />
            <stop offset="45%" stopColor="#fb7185" />
            <stop offset="100%" stopColor="#be123c" />
          </radialGradient>
          <clipPath id={clipId}>
            <path d="M2.8 8 L6.6 11.4 L9.4 6.4 Q12 4.6 14.6 6.4 L17.4 11.4 L21.2 8 L19.8 18.4 Q19.4 19.6 18 19.6 L6 19.6 Q4.6 19.6 4.2 18.4 Z" />
          </clipPath>
        </defs>

        {/* Tac govdesi: yumusatilmis 3 sivri uc + alt bant */}
        <path
          d="M2.8 8 L6.6 11.4 L9.4 6.4 Q12 4.6 14.6 6.4 L17.4 11.4 L21.2 8 L19.8 18.4 Q19.4 19.6 18 19.6 L6 19.6 Q4.6 19.6 4.2 18.4 Z"
          fill={`url(#${goldId})`}
          stroke="#92400e"
          strokeWidth="0.6"
          strokeLinejoin="round"
        />

        {/* Uc tepe taslari */}
        <circle cx="2.8" cy="8" r="1.25" fill="#fde68a" stroke="#a16207" strokeWidth="0.45" />
        <circle cx="21.2" cy="8" r="1.25" fill="#fde68a" stroke="#a16207" strokeWidth="0.45" />
        <circle cx="12" cy="4.6" r="1.45" fill="#fef3c7" stroke="#a16207" strokeWidth="0.45" />

        {/* Alt bant ayrim cizgisi */}
        <path d="M4.5 16.4 L19.5 16.4" stroke="#92400e" strokeWidth="0.5" strokeOpacity="0.6" strokeLinecap="round" />

        {/* Merkez yakut taş (fasetli) */}
        <g data-premium-crown-gem="true" style={{ animation: 'premiumCrownGemPulse 2.4s ease-in-out infinite' }}>
          <path
            d="M12 9.1 L13.5 10.9 L12 13.2 L10.5 10.9 Z"
            fill={`url(#${gemId})`}
            stroke="#7f1d1d"
            strokeWidth="0.35"
            strokeLinejoin="round"
          />
        </g>

        {/* Yan taslar */}
        <circle cx="7.2" cy="13.6" r="0.62" fill="#38bdf8" stroke="#0c4a6e" strokeWidth="0.28" />
        <circle cx="16.8" cy="13.6" r="0.62" fill="#38bdf8" stroke="#0c4a6e" strokeWidth="0.28" />

        {/* Gezinen parlama cizgisi — yalniz tac uzerinde */}
        <g clipPath={`url(#${clipId})`}>
          <rect
            data-premium-crown-shine="true"
            x="-8"
            y="3"
            width="6"
            height="18"
            fill="rgba(255,255,255,0.65)"
            style={{ animation: 'premiumCrownShine 3.6s ease-in-out infinite', transformOrigin: 'center' }}
          />
        </g>
      </svg>
    </span>
  )
}
