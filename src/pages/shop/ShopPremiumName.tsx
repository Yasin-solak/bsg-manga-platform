import { useEffect, useState } from 'react'
import PremiumCrownBadge from '@components/common/PremiumCrownBadge'
import { cn } from '@/lib/utils'
import { premiumNameStyle, SHOP_PREMIUM_NAME_PRESETS, standardNameStyle, type ShopNamePreset } from './shopPremiumShowcase'

/*
 * The reader's name with premium name style and effect (nameTextEffects). With cycle on, presets rotate;
 * in standard mode the standard reader's plain name shows (for comparison).
 */

export function ShopPremiumName({ name, premium = true, preset, cycle = false, crown = true, className }: {
  name: string
  premium?: boolean
  preset?: ShopNamePreset
  cycle?: boolean
  crown?: boolean
  className?: string
}) {
  const [index, setIndex] = useState(0)
  useEffect(() => {
    if (!cycle || !premium) return undefined
    setIndex(0)
    const timer = window.setInterval(() => setIndex((current) => (current + 1) % SHOP_PREMIUM_NAME_PRESETS.length), 2200)
    return () => window.clearInterval(timer)
  }, [cycle, premium])

  const active = preset ?? SHOP_PREMIUM_NAME_PRESETS[index]
  const look = premium ? premiumNameStyle(active) : standardNameStyle()

  return (
    <span className={cn('inline-flex max-w-full items-center gap-2', className)} data-shop-premium-name={premium ? active.id : 'standard'}>
      <span key={premium ? active.id : 'standard'} className={cn('min-w-0 truncate animate-in fade-in duration-300', look.className)} style={look.style}>
        {name}
      </span>
      {premium && crown && <PremiumCrownBadge size={22} className='flex-none' />}
    </span>
  )
}
