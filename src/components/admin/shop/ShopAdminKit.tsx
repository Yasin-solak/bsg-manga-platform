import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { STATE_META } from './shopAdminFormat'

/* Shop Control shared parts: panel, status badge, segment picker, form field. */

export function AdminPanel({ title, meta, action, children, className, bodyClassName }: {
  title?: ReactNode
  meta?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <section className={cn('flex min-w-0 flex-col rounded-[18px] border border-border/70 bg-card', className)}>
      {(title || action) && (
        <header className='flex items-center justify-between gap-3 px-5 pt-4'>
          <span className='min-w-0'>
            {title && <h2 className='truncate text-[15px] font-extrabold'>{title}</h2>}
            {meta && <span className='block truncate text-[12px] text-muted-foreground'>{meta}</span>}
          </span>
          {action}
        </header>
      )}
      <div className={cn('p-5', title && 'pt-3', bodyClassName)}>{children}</div>
    </section>
  )
}

export function StateChip({ state, className }: { state: string, className?: string }) {
  const meta = STATE_META[state] ?? { label: state, tone: 'bg-foreground/10 text-muted-foreground' }
  return <span className={cn('inline-flex h-6 items-center whitespace-nowrap rounded-full px-2.5 text-[11px] font-extrabold', meta.tone, className)}>{meta.label}</span>
}

export function Segments<T extends string>({ value, onChange, options, className }: {
  value: T
  onChange: (value: T) => void
  options: Array<{ value: T, label: ReactNode, tone?: string }>
  className?: string
}) {
  return (
    <div className={cn('flex w-fit max-w-full gap-1 overflow-x-auto rounded-xl border border-border/70 bg-card p-1 [scrollbar-width:none]', className)} role='tablist'>
      {options.map((option) => (
        <button
          key={option.value}
          type='button'
          role='tab'
          aria-selected={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'h-8 flex-none whitespace-nowrap rounded-lg px-3 text-[12.5px] font-bold transition-colors',
            value === option.value ? 'bg-foreground text-background' : cn('bg-transparent text-muted-foreground hover:text-foreground', option.tone),
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function Field({ label, hint, children, className }: { label: string, hint?: ReactNode, children: ReactNode, className?: string }) {
  return (
    <label className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <span className='text-[12px] font-extrabold text-muted-foreground'>{label}</span>
      {children}
      {hint && <span className='text-[11.5px] text-muted-foreground'>{hint}</span>}
    </label>
  )
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return <div className='rounded-2xl border border-dashed border-border px-5 py-8 text-center text-[13px] text-muted-foreground'>{children}</div>
}
