import type { ReactNode } from 'react'
import { ArrowRight } from 'lucide-react'
import { AdminSurface } from '@/components/admin/shared/AdminSurface'
import { cn } from '@/lib/utils'

/**
 * Operations stat box: the same box on all four tabs of the page.
 *
 * Pattern from the design handoff: SMALL CAPS label, large value, one line of
 * context below. Each tab used to draw its own box (some with icons, some
 * without, three different sizes).
 *
 * **Colors come from tokens, NOT the handoff's fixed light-theme colors.** The handoff
 * has `#fff` / `#0f172a`; the app runs on a dark theme and copying fixed colors
 * would make the panel unreadable there.
 */

export type StatTone = 'default' | 'danger' | 'warn' | 'success'

const TONE_SURFACE: Record<StatTone, string> = {
  default: '',
  danger: 'border-destructive/30 bg-destructive/5',
  warn: 'border-amber-500/30 bg-amber-500/5',
  success: 'border-emerald-500/30 bg-emerald-500/5',
}

const TONE_LABEL: Record<StatTone, string> = {
  default: 'text-muted-foreground',
  danger: 'text-destructive',
  warn: 'text-amber-600 dark:text-amber-400',
  success: 'text-emerald-600 dark:text-emerald-400',
}

const TONE_VALUE: Record<StatTone, string> = {
  default: 'text-foreground',
  danger: 'text-destructive',
  warn: 'text-amber-600 dark:text-amber-400',
  success: 'text-emerald-600 dark:text-emerald-400',
}

interface AdminOpsStatCardProps {
  label: string
  value: ReactNode
  hint?: ReactNode
  tone?: StatTone
  /** The value prints in monospace (like a version id). */
  mono?: boolean
  /** If the box is a DOOR: action label + job to run. */
  action?: { label: string; run: () => void }
  /** Filtre kutusu aciksa cerceve vurgulanir. */
  active?: boolean
  /** Disables meaningless actions like "clear" when there is no filter. */
  disabled?: boolean
  testId?: string
}

export function AdminOpsStatCard({
  label,
  value,
  hint,
  tone = 'default',
  mono = false,
  action,
  active = false,
  disabled = false,
  testId,
}: AdminOpsStatCardProps) {
  const body = (
    <>
      <div className={cn('text-[11px] font-semibold uppercase tracking-wide', active ? 'text-primary' : TONE_LABEL[tone])}>
        {label}
      </div>
      <p
        className={cn(
          'm-0 mt-2 text-[22px] font-bold leading-none tabular-nums',
          mono && 'font-mono text-xl',
          TONE_VALUE[tone],
        )}
      >
        {value}
      </p>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <span className="text-[11px] leading-4 text-muted-foreground">{hint}</span>
        {action && !disabled ? (
          <span className="inline-flex shrink-0 items-center gap-0.5 text-[11px] font-semibold text-primary">
            {action.label}
            <ArrowRight className="size-3" aria-hidden="true" />
          </span>
        ) : null}
      </div>
    </>
  )

  if (!action) {
    return (
      <AdminSurface className={cn('p-4', TONE_SURFACE[tone])} data-testid={testId}>
        {body}
      </AdminSurface>
    )
  }

  return (
    <AdminSurface
      className={cn('p-0', TONE_SURFACE[tone], active && 'border-primary/40 bg-primary/5')}
      data-testid={testId}
    >
      <button
        type="button"
        onClick={action.run}
        disabled={disabled}
        aria-pressed={active}
        className={cn(
          'block w-full rounded-xl p-4 text-left transition-colors',
          'hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
          disabled && 'cursor-default opacity-60 hover:bg-transparent',
        )}
      >
        {body}
      </button>
    </AdminSurface>
  )
}
