import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface AdminToolbarProps {
  leading?: ReactNode
  trailing?: ReactNode
  className?: string
}

/**
 * AdminToolbar: inline toolbar.
 *
 * Structure: search/filter on the left, actions on the right.
 * No background, only flex alignment.
 */
export function AdminToolbar({ leading, trailing, className }: AdminToolbarProps) {
  if (!leading && !trailing) return null

  return (
    <div
      className={cn(
        'flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between',
        className,
      )}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2">{leading}</div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">{trailing}</div>
    </div>
  )
}
