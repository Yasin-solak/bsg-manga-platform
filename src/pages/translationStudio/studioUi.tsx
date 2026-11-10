import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { txa } from '@/i18n/activeLocale'

/*
  Ceviri Studyosu V3 ortak parcalari. Olculer handoff prototipinden birebir
  alinmistir (buton 42-48px, yaricap 10-12px, 12.5px etiketler).
*/

export function StepHeading({ step, title, subtitle, aside }: {
  step: number
  title: string
  subtitle: ReactNode
  aside?: ReactNode
}) {
  return (
    <div className='flex items-end justify-between gap-5'>
      <div className='flex flex-col gap-1.5'>
        <span className='text-xs font-extrabold tracking-[0.06em] text-[var(--tl-p)]'>{txa('ADIM {v1} / 6', { v1: step })}</span>
        <h2 className='m-0 text-[28px] font-extrabold tracking-[-0.01em]'>{title}</h2>
        <span className='text-sm font-medium text-[var(--tl-mut)]'>{subtitle}</span>
      </div>
      {aside}
    </div>
  )
}

export function PrimaryButton({ className, size = 'md', children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & {
  size?: 'sm' | 'md' | 'lg'
}) {
  return (
    <button
      type='button'
      {...props}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-[10px] border-0 bg-[var(--tl-p)] font-extrabold text-[var(--tl-pfg)] transition-opacity',
        'disabled:cursor-not-allowed disabled:opacity-45',
        size === 'sm' && 'h-9 px-3.5 text-[12.5px]',
        size === 'md' && 'h-[42px] px-5 text-sm',
        size === 'lg' && 'h-12 px-6 text-[15px]',
        className,
      )}
    >
      {children}
    </button>
  )
}

export function GhostButton({ className, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type='button'
      {...props}
      className={cn(
        'inline-flex items-center gap-2 rounded-[10px] border border-[var(--tl-line)] bg-transparent font-bold text-[var(--tl-fg2)]',
        'transition-colors hover:border-[var(--tl-p35)] hover:text-[var(--tl-fg)] disabled:cursor-not-allowed disabled:opacity-45',
        className,
      )}
    >
      {children}
    </button>
  )
}

export function Segmented<T extends string>({ value, options, onChange, className }: {
  value: T
  options: Array<{ value: T, label: string }>
  onChange: (value: T) => void
  className?: string
}) {
  return (
    <div className={cn('flex gap-1 rounded-[11px] border border-[var(--tl-line)] bg-[var(--tl-card)] p-1', className)} role='tablist'>
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type='button'
            role='tab'
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'h-[34px] rounded-lg border-0 px-4 text-[13px] font-bold transition-colors',
              active ? 'bg-[var(--tl-acc2)] text-[var(--tl-fg)]' : 'bg-transparent text-[var(--tl-mut)] hover:text-[var(--tl-fg2)]',
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

/** Tasarimdaki "seg" deseni: secili secenek p15 zemin + p35 kenar. */
export function ChoiceButton({ active, className, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { active: boolean }) {
  return (
    <button
      type='button'
      aria-pressed={active}
      {...props}
      className={cn(
        'border font-bold transition-colors',
        active
          ? 'border-[var(--tl-p35)] bg-[var(--tl-p15)] text-[var(--tl-p)]'
          : 'border-[var(--tl-line)] bg-transparent text-[var(--tl-mut)] hover:text-[var(--tl-fg2)]',
        className,
      )}
    >
      {children}
    </button>
  )
}

export function FieldLabel({ label, children }: { label: string, children: ReactNode }) {
  return (
    <label className='flex flex-col gap-[7px] text-[12.5px] font-bold text-[var(--tl-mut)]'>
      {label}
      {children}
    </label>
  )
}


export function Toggle({ on, disabled }: { on: boolean, disabled?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        'relative h-5 w-9 flex-none rounded-full transition-colors',
        on ? 'bg-[var(--tl-p)]' : 'bg-[var(--tl-acc2)]',
        disabled && 'opacity-45',
      )}
    >
      <span
        className='absolute top-[3px] h-3.5 w-3.5 rounded-full bg-[var(--tl-fg)] transition-[left] duration-150'
        style={{ left: on ? 19 : 3 }}
      />
    </span>
  )
}

export function ProgressBar({ value, color = 'var(--tl-p)', className }: { value: number, color?: string, className?: string }) {
  return (
    <div className={cn('h-1.5 overflow-hidden rounded-full bg-[var(--tl-acc2)]', className)}>
      <div
        className='h-full rounded-full transition-[width] duration-150'
        style={{ width: `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`, background: color }}
      />
    </div>
  )
}
