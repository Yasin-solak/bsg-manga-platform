import type { ReactNode } from 'react'
import { Link } from '@/i18n/router'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTx } from '@/i18n/LocaleProvider'

/**
 * Mobile home building blocks: measures exactly from the design handoff.
 *
 * Section template in the handoff:
 * title row : padding 0 16px, margin 26px 0 12px, baseline aligned
 * title     : 15px / 800 / uppercase / letter-spacing .045em
 * "All"     : 13px / 700 / accent color, min-height 44px (touch target)
 * rail      : gap 12px, horizontal scroll, padding 0 16px 4px
 *
 * The rail extends to the screen EDGE but the first card starts 16px in, so
 * the next card shows half and signals "there is more". Trapping the rail inside a card
 * destroyed this hint.
 */

interface SectionHeaderProps {
  title: string
  /** "All" link; not shown if not given. */
  to?: string
  onClick?: () => void
}

export function MobileSectionHeader({ title, to, onClick }: SectionHeaderProps) {
  const tx = useTx()
  const linkClass =
    'inline-flex min-h-[44px] items-center gap-0.5 pl-2.5 text-[13px] font-bold text-primary'

  return (
    <div className="mb-3 mt-6 flex items-baseline justify-between px-4">
      <h3 className="m-0 text-[15px] font-extrabold uppercase tracking-[0.045em] text-foreground">
        {title}
      </h3>
      {to ? (
        <Link to={to} className={linkClass}>
          {tx('Tümü')}
          <ChevronRight className="size-4" aria-hidden="true" />
        </Link>
      ) : onClick ? (
        <button type="button" onClick={onClick} className={linkClass}>
          {tx('Tümü')}
          <ChevronRight className="size-4" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  )
}

interface MobileRailProps {
  children: ReactNode
  className?: string
  testId?: string
}

/** Yatay ray: kaydirma cubugu gizli, ic bosluk 16px. */
export function MobileRail({ children, className, testId }: MobileRailProps) {
  return (
    <div
      className={cn(
        'homepage-scroll-row flex gap-3 overflow-x-auto overflow-y-hidden px-4 pb-1',
        className,
      )}
      data-testid={testId}
    >
      {children}
    </div>
  )
}
