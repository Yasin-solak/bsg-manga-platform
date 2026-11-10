import { forwardRef, type ComponentProps } from 'react'
import { cn } from '@/lib/utils'

type AdminSurfaceTone = 'default' | 'muted' | 'accent'

interface AdminSurfaceProps extends ComponentProps<'section'> {
  tone?: AdminSurfaceTone
  /** Enables the hover shadow effect on clickable cards */
  interactive?: boolean
}

/**
 * AdminSurface: simple card container.
 *
 * ShadcnUIKit style: white/dark card, thin border, light shadow.
 * Automatic dark/light switching through theme CSS variables.
 *
 * In React 18 function components take no ref; forwardRef is required to "go to" a card
 * (scrollIntoView). The primitive itself carries the ref rather than adding a
 * wrapper div.
 */
export const AdminSurface = forwardRef<HTMLElement, AdminSurfaceProps>(
  function AdminSurface({ className, tone = 'default', interactive = false, ...props }, ref) {
    return (
      <section
        ref={ref}
        className={cn(
          'rounded-xl border border-border bg-card text-card-foreground shadow-sm',
          tone === 'muted' && 'bg-muted/50',
          tone === 'accent' && 'border-primary/30 bg-primary/5',
          interactive && 'cursor-pointer transition-shadow hover:shadow-md active:shadow-sm',
          className,
        )}
        {...props}
      />
    )
  },
)
