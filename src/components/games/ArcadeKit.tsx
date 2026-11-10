import type { ReactNode } from 'react'
import { Link } from '@/i18n/router'
import { ArrowLeft, Coins } from 'lucide-react'
import type { MurekMood, MurekMotion } from '@/components/murek/Murek'
import { MyMurek } from '@/components/murek/MyMurek'
import { cn } from '@/lib/utils'
import './arcade.css'
import { txa } from '@/i18n/activeLocale'

/* Oyun Kosesi ortak parcalari: kabuk, ust serit, coin olcer, Murek balonu, geri sayim. */

export function ArcadeShell({ children, className, testId }: { children: ReactNode, className?: string, testId?: string }) {
  return (
    <div className={cn('arcade mx-auto w-full max-w-6xl px-4 pb-14 pt-5 lg:px-8 lg:pt-8', className)} data-testid={testId}>
      {children}
    </div>
  )
}

export function CoinMeter({ earned, cap, compact = false }: { earned: number, cap: number, compact?: boolean }) {
  const blocks = 10
  const filled = cap > 0 ? Math.round((Math.min(earned, cap) / cap) * blocks) : 0
  return (
    <div className='flex items-center gap-2.5' data-testid='arcade-coin-meter' title={txa('Bugün oyunlardan {earned}/{cap} coin', { earned, cap })}>
      <Coins className='size-4 shrink-0 text-[var(--arcade-coin)]' />
      {!compact && <span className='px-meter' aria-hidden='true'>{Array.from({ length: blocks }, (_, index) => <span key={index} data-on={index < filled} />)}</span>}
      <span className='font-mono text-xs font-black tabular-nums text-foreground'>{earned}<span className='text-muted-foreground'>/{cap}</span></span>
    </div>
  )
}

export function GameTopBar({ title, subtitle, earned, cap }: { title: string, subtitle?: string, earned?: number, cap?: number }) {
  return (
    <div className='mb-5 flex flex-wrap items-center gap-3'>
      <Link to='/oyunlar' aria-label={txa('Oyun Köşesi')} className='px-frame grid size-10 place-items-center text-muted-foreground hover:text-foreground'>
        <ArrowLeft className='size-5' />
      </Link>
      <div className='min-w-0 flex-1'>
        <p className='m-0 text-[10.5px] font-black uppercase tracking-[0.2em] text-[var(--arcade-ink)]'>{txa('Oyun Köşesi')}</p>
        <h1 className='m-0 text-xl font-black tracking-tight text-foreground sm:text-2xl'>{title}</h1>
        {subtitle && <p className='m-0 text-xs text-muted-foreground'>{subtitle}</p>}
      </div>
      {typeof earned === 'number' && typeof cap === 'number' && (
        <div className='px-frame order-last basis-full px-3 py-2 sm:order-none sm:basis-auto'><CoinMeter earned={earned} cap={cap} /></div>
      )}
    </div>
  )
}

export function MurekSays({ mood, motion = 'bob', size = 72, children, reactionKey }: {
  mood: MurekMood
  motion?: MurekMotion
  size?: number
  children: ReactNode
  reactionKey?: number
}) {
  return (
    <div className='flex items-end gap-4'>
      <MyMurek key={reactionKey} mood={mood} motion={motion} size={size} />
      <div className='px-bubble mb-2 min-w-0 flex-1 text-sm font-bold leading-snug' role='status' aria-live='polite'>{children}</div>
    </div>
  )
}

export function AttemptPips({ left, max }: { left: number, max: number }) {
  return (
    <span className='inline-flex items-center gap-1' aria-label={txa('{left}/{max} deneme hakkı', { left, max })}>
      {Array.from({ length: max }, (_, index) => (
        <span key={index} className='px-dot' data-state={index < left ? 'good' : undefined} />
      ))}
    </span>
  )
}
