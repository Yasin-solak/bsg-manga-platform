import type { ReactNode } from 'react'
import type { Icon } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { ToneIcon, type PanelTone } from '@/pages/profile/ProfileTabKit'

/*
 * Studio metric strip: cells in one card (instead of large separate boxes).
 * Cell lines are each cell's right/bottom edge; outer edges are hidden with -m,
 * so no double lines form in 2 / 3 / 5 columns.
 */
export type StudioStat = {
  key: string
  icon: Icon
  tone: PanelTone
  label: string
  value: ReactNode
  sub?: ReactNode
}

const COLS: Record<number, string> = {
  3: 'grid-cols-3',
  4: 'grid-cols-2 lg:grid-cols-4',
  5: 'grid-cols-2 sm:grid-cols-3 xl:grid-cols-5',
}

export function StudioStatStrip({ items, testId, className }: { items: StudioStat[], testId?: string, className?: string }) {
  return (
    <section className={cn('overflow-hidden rounded-[20px] border border-border/70 bg-card/60', className)} data-testid={testId}>
      <div className={cn('-mb-px -mr-px grid [&>*]:border-b [&>*]:border-r [&>*]:border-border/60', COLS[items.length] || 'grid-cols-2 lg:grid-cols-4')}>
        {items.map((item) => (
          <div key={item.key} className="flex min-w-0 items-center gap-3 px-4 py-3">
            <ToneIcon icon={item.icon} tone={item.tone} />
            <span className="min-w-0">
              <span className="block truncate text-[11.5px] font-semibold text-muted-foreground">{item.label}</span>
              <span className="block text-[20px] font-black leading-tight tracking-tight tabular-nums">{item.value}</span>
              {item.sub != null && <span className="block truncate text-[11px] text-muted-foreground">{item.sub}</span>}
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}
