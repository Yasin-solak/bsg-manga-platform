import type { ReactNode } from 'react'
import { Crown, Medal } from '@phosphor-icons/react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { txa } from '@/i18n/activeLocale'

export type BoostFrameStyle = 'gold' | 'rose' | 'violet' | 'sapphire' | 'emerald'

type BoostFrameTheme = {
  gradient: string
  shadow: string
  highlight: string
  iconBorder: string
  iconBg: string
  iconShadow: string
}

const BOOST_FRAME_THEMES: Record<BoostFrameStyle, BoostFrameTheme> = {
  gold: {
    gradient: 'bg-[linear-gradient(135deg,rgba(251,191,36,0.98)_0%,rgba(245,158,11,0.9)_45%,rgba(253,230,138,0.98)_100%)]',
    shadow: 'shadow-[0_0_0_1px_rgba(251,191,36,0.22),0_14px_30px_-22px_rgba(245,158,11,0.85)]',
    highlight: 'radial-gradient(circle at 28% 24%, rgba(255,248,196,0.9), transparent 36%)',
    iconBorder: 'border-amber-200/60',
    iconBg: 'bg-amber-500',
    iconShadow: 'shadow-amber-500/35',
  },
  rose: {
    gradient: 'bg-[linear-gradient(135deg,rgba(244,63,94,0.95)_0%,rgba(225,29,72,0.88)_45%,rgba(253,164,175,0.95)_100%)]',
    shadow: 'shadow-[0_0_0_1px_rgba(244,63,94,0.22),0_14px_30px_-22px_rgba(225,29,72,0.85)]',
    highlight: 'radial-gradient(circle at 28% 24%, rgba(255,228,230,0.9), transparent 36%)',
    iconBorder: 'border-rose-200/60',
    iconBg: 'bg-rose-500',
    iconShadow: 'shadow-rose-500/35',
  },
  violet: {
    gradient: 'bg-[linear-gradient(135deg,rgba(139,92,246,0.95)_0%,rgba(109,40,217,0.88)_45%,rgba(196,181,253,0.95)_100%)]',
    shadow: 'shadow-[0_0_0_1px_rgba(139,92,246,0.22),0_14px_30px_-22px_rgba(109,40,217,0.85)]',
    highlight: 'radial-gradient(circle at 28% 24%, rgba(237,233,254,0.9), transparent 36%)',
    iconBorder: 'border-violet-200/60',
    iconBg: 'bg-violet-500',
    iconShadow: 'shadow-violet-500/35',
  },
  sapphire: {
    gradient: 'bg-[linear-gradient(135deg,rgba(59,130,246,0.95)_0%,rgba(37,99,235,0.88)_45%,rgba(147,197,253,0.95)_100%)]',
    shadow: 'shadow-[0_0_0_1px_rgba(59,130,246,0.22),0_14px_30px_-22px_rgba(37,99,235,0.85)]',
    highlight: 'radial-gradient(circle at 28% 24%, rgba(219,234,254,0.9), transparent 36%)',
    iconBorder: 'border-blue-200/60',
    iconBg: 'bg-blue-500',
    iconShadow: 'shadow-blue-500/35',
  },
  emerald: {
    gradient: 'bg-[linear-gradient(135deg,rgba(16,185,129,0.95)_0%,rgba(5,150,105,0.88)_45%,rgba(167,243,208,0.95)_100%)]',
    shadow: 'shadow-[0_0_0_1px_rgba(16,185,129,0.22),0_14px_30px_-22px_rgba(5,150,105,0.85)]',
    highlight: 'radial-gradient(circle at 28% 24%, rgba(209,250,229,0.9), transparent 36%)',
    iconBorder: 'border-emerald-200/60',
    iconBg: 'bg-emerald-500',
    iconShadow: 'shadow-emerald-500/35',
  },
}

export const BOOST_FRAME_STYLE_OPTIONS: { value: BoostFrameStyle; label: string }[] = [
  { value: 'gold', get label() { return txa('Altın') } },
  { value: 'rose', get label() { return txa('Gül') } },
  { value: 'violet', get label() { return txa('Mor') } },
  { value: 'sapphire', get label() { return txa('Safir') } },
  { value: 'emerald', get label() { return txa('Zümrüt') } },
]

export function resolveBoostFrameStyle(raw?: string | null): BoostFrameStyle {
  if (raw && raw in BOOST_FRAME_THEMES) return raw as BoostFrameStyle
  return 'gold'
}

type FansubDiscoverBadgeProps = {
  compact?: boolean
  className?: string
  iconOnly?: boolean
}

type FansubGoldFrameProps = {
  active?: boolean
  frameStyle?: BoostFrameStyle
  children: ReactNode
  className?: string
  innerClassName?: string
  badgeClassName?: string
}

export function FansubDiscoverBadge({
  compact = false,
  className,
  iconOnly = false,
}: FansubDiscoverBadgeProps) {
  return (
    <Badge
      variant='secondary'
      className={cn(
        'rounded-full border border-amber-500/25 bg-amber-500/10 font-semibold uppercase tracking-[0.12em] text-amber-600 dark:text-amber-300',
        compact ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-0.5 text-[11px]',
        iconOnly && 'size-5 justify-center p-0',
        className,
      )}
      title={txa('Topluluk destekli')}
    >
      <Medal size={compact ? 12 : 14} weight="duotone" className={cn('shrink-0', !iconOnly && 'mr-1')} />
      {iconOnly ? <span className="sr-only">{txa('Topluluk destekli')}</span> : txa('Topluluk destekli')}
    </Badge>
  )
}

export function FansubGoldFrame({
  active = false,
  frameStyle = 'gold',
  children,
  className,
  innerClassName,
  badgeClassName,
}: FansubGoldFrameProps) {
  if (!active) {
    return <div className={cn('relative shrink-0', className)}>{children}</div>
  }

  const theme = BOOST_FRAME_THEMES[frameStyle] ?? BOOST_FRAME_THEMES.gold

  return (
    <div
      className={cn(
        'relative shrink-0 rounded-full p-[2px]',
        theme.gradient,
        theme.shadow,
        className,
      )}
    >
      <div
        className='pointer-events-none absolute inset-0 rounded-full opacity-80'
        style={{ background: theme.highlight }}
        aria-hidden
      />
      <div
        className='pointer-events-none absolute inset-0 rounded-full bg-[linear-gradient(90deg,transparent_0%,rgba(255,255,255,0.55)_50%,transparent_100%)] bg-[length:200%_100%] animate-[shimmer_3s_ease-in-out_infinite]'
        aria-hidden
      />
      <span
        className={cn(
          'absolute -right-1 -top-1 z-20 inline-flex size-[18px] items-center justify-center rounded-full border text-white shadow-lg',
          theme.iconBorder,
          theme.iconBg,
          theme.iconShadow,
          badgeClassName,
        )}
      >
        <Crown size={10} weight="fill" />
      </span>
      <div className={cn('relative rounded-full bg-background/90 p-[2px] backdrop-blur-sm', innerClassName)}>
        {children}
      </div>
    </div>
  )
}
