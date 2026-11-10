import type { ReactNode } from 'react'
import { Link } from '@/i18n/router'
import { ArrowRight, type Icon } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'

/*
 * Profile tabs v3 design language: all tabs use the same panel, title, empty state and
 * number components (one visual language; no different card styles per tab).
 */

export type PanelTone = 'primary' | 'violet' | 'amber' | 'emerald' | 'sky' | 'rose' | 'neutral'

const TONE: Record<PanelTone, string> = {
  primary: 'bg-primary/15 text-primary',
  violet: 'bg-violet-400/15 text-violet-300',
  amber: 'bg-amber-400/15 text-amber-300',
  emerald: 'bg-emerald-400/15 text-emerald-300',
  sky: 'bg-sky-400/15 text-sky-300',
  rose: 'bg-rose-400/15 text-rose-300',
  neutral: 'bg-muted text-muted-foreground',
}

export function ToneIcon({ icon: IconCmp, tone = 'primary', size = 'md' }: { icon: Icon, tone?: PanelTone, size?: 'sm' | 'md' | 'lg' }) {
  const box = size === 'lg' ? 'size-10 rounded-xl' : size === 'sm' ? 'size-6 rounded-md' : 'size-8 rounded-[10px]'
  const px = size === 'lg' ? 20 : size === 'sm' ? 13 : 16
  return (
    <span className={cn('flex flex-none items-center justify-center', box, TONE[tone])}>
      <IconCmp weight='fill' size={px} />
    </span>
  )
}

/** Action in the panel title: moving to a tab (onClick) or a page link (to). */
export type PanelAction = { label: string, onClick?: () => void, to?: string }

function ActionButton({ action }: { action: PanelAction }) {
  const cls = 'group/act flex flex-none items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-bold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground'
  const body = (
    <>
      {action.label}
      <ArrowRight weight='bold' size={11} className='transition-transform group-hover/act:translate-x-0.5' />
    </>
  )
  return action.to
    ? <Link to={action.to} className={cls}>{body}</Link>
    : <button type='button' onClick={action.onClick} className={cn(cls, 'bg-transparent')}>{body}</button>
}

export function Panel({ title, icon, tone = 'primary', meta, action, children, className, bodyClassName, testId, flush }: {
  title?: string
  icon?: Icon
  tone?: PanelTone
  meta?: ReactNode
  action?: PanelAction
  children: ReactNode
  className?: string
  bodyClassName?: string
  testId?: string
  /** Govde kenar boslugu olmadan (tam genislik liste / gorsel). */
  flush?: boolean
}) {
  return (
    <section
      className={cn(
        'relative flex min-w-0 flex-col overflow-hidden rounded-[20px] border border-border/70 bg-card/60 shadow-[inset_0_1px_0_hsl(var(--foreground)/0.04)]',
        className,
      )}
      data-testid={testId}
    >
      {title && (
        <header className='flex items-center gap-3 px-5 pb-1 pt-4'>
          {icon && <ToneIcon icon={icon} tone={tone} />}
          <span className='min-w-0 flex-1'>
            <h2 className='truncate text-[15px] font-bold tracking-tight text-foreground'>{title}</h2>
            {meta && <span className='block truncate text-[12px] text-muted-foreground'>{meta}</span>}
          </span>
          {action && <ActionButton action={action} />}
        </header>
      )}
      <div className={cn(flush ? 'pb-2 pt-2' : 'p-5 pt-3', !title && !flush && 'pt-5', bodyClassName)}>{children}</div>
    </section>
  )
}

export function PanelEmpty({ icon: IconCmp, title, hint, action, className }: {
  icon: Icon
  title: string
  hint?: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border/80 px-6 py-10 text-center', className)}>
      <span className='flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground'>
        <IconCmp weight='duotone' size={22} />
      </span>
      <span className='text-[13.5px] font-bold text-foreground'>{title}</span>
      {hint && <span className='max-w-[340px] text-[12.5px] leading-relaxed text-muted-foreground'>{hint}</span>}
      {action}
    </div>
  )
}

/** Kucuk sayi kutusu: ikon, etiket, buyuk sayi, alt not. */
export function StatTile({ icon, tone, label, value, sub, className }: {
  icon: Icon
  tone: PanelTone
  label: string
  value: ReactNode
  sub?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-3 rounded-2xl border border-border/70 bg-background/40 p-4', className)}>
      <span className='flex items-center gap-2'>
        <ToneIcon icon={icon} tone={tone} size='sm' />
        <span className='truncate text-[12px] font-semibold text-muted-foreground'>{label}</span>
      </span>
      <span className='text-[26px] font-black leading-none tracking-tight tabular-nums'>{value}</span>
      {sub && <span className='-mt-1 truncate text-[11.5px] text-muted-foreground'>{sub}</span>}
    </div>
  )
}

/** Ince ilerleme cubugu. */
export function Meter({ percent, className, barClassName }: { percent: number, className?: string, barClassName?: string }) {
  return (
    <span className={cn('block h-1.5 overflow-hidden rounded-full bg-foreground/[0.08]', className)}>
      <span
        className={cn('block h-full rounded-full bg-gradient-to-r from-primary to-primary/70 transition-[width] duration-700', barClassName)}
        style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
      />
    </span>
  )
}
