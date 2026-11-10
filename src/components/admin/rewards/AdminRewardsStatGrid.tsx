import { cn } from '@/lib/utils'

interface AdminRewardsStatItem {
  label: string
  value: string
  tone?: 'amber'
}

interface AdminRewardsStatGridProps {
  items: AdminRewardsStatItem[]
}

/** Module summary: admin v2 strip (one-line cells instead of large boxes). */
export function AdminRewardsStatGrid({ items }: AdminRewardsStatGridProps) {
  return (
    <section className="overflow-hidden rounded-[20px] border border-border/70 bg-card/60" data-testid="rewards-strip">
      <div className="-mb-px -mr-px grid grid-cols-2 lg:grid-cols-4 [&>*]:border-b [&>*]:border-r [&>*]:border-border/60">
        {items.map((item) => (
          <div key={item.label} className="min-w-0 px-4 py-3">
            <span className="block truncate text-[11.5px] font-semibold text-muted-foreground">{item.label}</span>
            <span className={cn('block truncate text-[18px] font-black leading-tight tabular-nums', item.tone === 'amber' && 'text-amber-600 dark:text-amber-300')}>{item.value}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
