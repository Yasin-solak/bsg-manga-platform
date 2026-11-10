import { cn } from '@/lib/utils'
import { formatRelativeAge } from './dashboardFormatters'
import type { DashboardActivityView, DashboardTargetSection } from './dashboardTypes'
import { txa } from '@/i18n/activeLocale'

function toneClass(tone: DashboardActivityView['tone']) {
  if (tone === 'danger') return 'bg-rose-500'
  if (tone === 'warning') return 'bg-amber-500'
  if (tone === 'success') return 'bg-emerald-500'
  return 'bg-sky-500'
}

interface DashboardActivityTimelineProps {
  activity: DashboardActivityView[]
  onNavigate: (target: DashboardTargetSection) => void
}

const VISIBLE_ACTIVITY = 6

/** Recent activity: the newest six records instead of a fixed-height scroller. */
export function DashboardActivityTimeline({
  activity,
  onNavigate,
}: DashboardActivityTimelineProps) {
  return (
    <section
      className="flex min-w-0 flex-col overflow-hidden rounded-[20px] border border-border/70 bg-card/60"
      aria-labelledby="dashboard-activity-title"
    >
      <header className="flex items-center justify-between gap-3 px-5 pb-2 pt-4">
        <h2 id="dashboard-activity-title" className="text-[15px] font-bold tracking-tight text-foreground">
          {txa('Son hareketler')}
        </h2>
        <span className="text-[12px] text-muted-foreground">
          {activity.length > VISIBLE_ACTIVITY ? txa('son {v1} / {v2}', { v1: VISIBLE_ACTIVITY, v2: activity.length }) : txa('{v1} kayıt', { v1: activity.length })}
        </span>
      </header>

      {activity.length === 0 ? (
        <p className="px-5 pb-5 text-[12.5px] text-muted-foreground">{txa('Bu dönemde kayıtlı hareket yok.')}</p>
      ) : (
        <ol className="divide-y divide-border/50 border-t border-border/50" data-testid="dashboard-activity-timeline">
          {activity.slice(0, VISIBLE_ACTIVITY).map((item) => (
            <li key={item.id} data-testid={`dashboard-activity-${item.id}`}>
              <button
                type="button"
                className="flex w-full items-center gap-3 px-5 py-2.5 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:cursor-default disabled:hover:bg-transparent"
                disabled={!item.target}
                aria-label={item.target ? txa('{v1} detayına git', { v1: item.title }) : undefined}
                onClick={() => { if (item.target) onNavigate(item.target) }}
              >
                <span className={cn('size-2 shrink-0 rounded-full', toneClass(item.tone))} aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="shrink-0 rounded-md bg-muted px-1.5 py-px text-[10.5px] font-semibold text-muted-foreground">{item.category}</span>
                    <span className="truncate text-[13px] font-medium text-foreground">{item.title}</span>
                  </span>
                  {item.detail ? <span className="mt-0.5 block truncate text-[11.5px] text-muted-foreground">{item.detail}</span> : null}
                </span>
                <span className="shrink-0 text-right text-[11px] text-muted-foreground">
                  <span className="block">{formatRelativeAge(item.createdAt)}</span>
                  {item.actor ? <span className="block max-w-24 truncate">@{item.actor}</span> : null}
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
