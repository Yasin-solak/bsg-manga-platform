import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { countdownParts } from './shopFormat'
import { txa } from '@/i18n/activeLocale'

/* Countdown updated every second (campaign / deal of the day / coming soon). */
export function ShopCountdown({ target, compact = false, className }: { target: string, compact?: boolean, className?: string }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  const parts = countdownParts(target, now)
  const visible = parts[0].value > 0 ? parts : parts.slice(1)

  if (compact) {
    return (
      <span className={cn('tabular-nums', className)}>
        {visible.map((part) => `${String(part.value).padStart(2, '0')}`).join(':')}
      </span>
    )
  }
  return (
    <span className={cn('flex gap-2', className)} role='timer' aria-label={txa('Kalan süre')}>
      {visible.map((part) => (
        <span key={part.label} className='flex w-[58px] flex-col items-center rounded-xl bg-white/[0.07] py-2 backdrop-blur'>
          <span className='text-[22px] font-black leading-none tabular-nums'>{String(part.value).padStart(2, '0')}</span>
          <span className='mt-1 text-[10px] font-bold uppercase tracking-[0.1em] text-white/60'>{part.label}</span>
        </span>
      ))}
    </span>
  )
}
