import type { LucideIcon } from 'lucide-react'
import { Droplets, Flame, Gem, Heart, Leaf, Moon, Sword, Zap } from 'lucide-react'
import {
  getFansubIdentityAudienceLabel,
  getFansubIdentityBadgeMeta,
  type FansubIdentityTagPresentation,
} from '@/lib/fansubIdentityTags'
import { cn } from '@/lib/utils'

const BADGE_ICON_MAP: Record<string, LucideIcon> = {
  leaf: Leaf,
  blade: Sword,
  heart: Heart,
  flame: Flame,
  drop: Droplets,
  moon: Moon,
  bolt: Zap,
  gem: Gem,
}

export function FansubIdentityBadgeIcon({
  badgeKey,
  className,
}: {
  badgeKey: string
  className?: string
}) {
  const Icon = BADGE_ICON_MAP[badgeKey] || Sword
  return <Icon className={className} strokeWidth={2.2} />
}

type FansubIdentityTagChipProps = {
  tag: FansubIdentityTagPresentation | null | undefined
  className?: string
  size?: 'xs' | 'sm' | 'md'
  showAudienceLabel?: boolean
}

const CHIP_SIZE_CLASS = {
  xs: {
    shell: 'gap-1 rounded-full px-1.5 py-0.5 text-[10px]',
    iconWrap: 'size-4 rounded-md',
    icon: 'size-2.5',
  },
  sm: {
    shell: 'gap-1.5 rounded-full px-2 py-0.5 text-[11px]',
    iconWrap: 'size-4.5 rounded-md',
    icon: 'size-2.5',
  },
  md: {
    shell: 'gap-1.5 rounded-full px-2.5 py-1 text-xs',
    iconWrap: 'size-5 rounded-md',
    icon: 'size-3',
  },
} as const

export default function FansubIdentityTagChip({
  tag,
  className,
  size = 'sm',
  showAudienceLabel = false,
}: FansubIdentityTagChipProps) {
  if (!tag) return null

  const badgeMeta = getFansubIdentityBadgeMeta(tag.badgeKey)
  const sizeClass = CHIP_SIZE_CLASS[size]

  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center border bg-[linear-gradient(180deg,hsl(var(--background)/0.94),hsl(var(--muted)/0.58))] font-semibold text-foreground shadow-[0_10px_30px_-22px_hsl(var(--foreground)/0.6)]',
        badgeMeta?.borderTone || 'border-border/70',
        sizeClass.shell,
        className,
      )}
      title={showAudienceLabel ? getFansubIdentityAudienceLabel(tag.audience) : tag.shortcode}
    >
      <span
        className={cn(
          'inline-flex shrink-0 items-center justify-center border bg-[radial-gradient(circle_at_top_left,hsl(var(--background)/0.88),transparent_65%),linear-gradient(145deg,hsl(var(--muted)/0.8),hsl(var(--background)/0.98))]',
          badgeMeta?.borderTone || 'border-border/70',
          badgeMeta?.tone || 'text-foreground',
          sizeClass.iconWrap,
        )}
      >
        <FansubIdentityBadgeIcon badgeKey={tag.badgeKey} className={sizeClass.icon} />
      </span>
      <span className='truncate font-bold tracking-[0.14em]'>{tag.shortcode}</span>
      {showAudienceLabel ? (
        <span className='truncate text-[10px] font-medium tracking-normal text-muted-foreground'>
          {getFansubIdentityAudienceLabel(tag.audience)}
        </span>
      ) : null}
    </span>
  )
}
