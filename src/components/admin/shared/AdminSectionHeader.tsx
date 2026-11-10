import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface AdminSectionHeaderProps {
  title: string
  description?: string
  /** A plain small badge now instead of an in-card eyebrow */
  eyebrow?: string
  meta?: ReactNode
  actions?: ReactNode
  className?: string
}

/**
 * AdminSectionHeader: simple page header.
 *
 * ShadcnUIKit style: large title + description on the left,
 * primary action button on the right. No card wrapper.
 */
export function AdminSectionHeader({
  title,
  description,
  eyebrow,
  meta,
  actions,
  className,
}: AdminSectionHeaderProps) {
  return (
    <div className={cn('flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className="min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          {eyebrow && (
            <span className="inline-flex rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
              {eyebrow}
            </span>
          )}
          <h1 className="text-[26px] font-black leading-tight tracking-tight text-foreground">{title}</h1>
        </div>
        {description && (
          <p className="text-[13px] text-muted-foreground">{description}</p>
        )}
        {meta && <div className="pt-0.5">{meta}</div>}
      </div>
      {actions && (
        <div className="flex shrink-0 items-center gap-2 pt-2 sm:pt-0">{actions}</div>
      )}
    </div>
  )
}
