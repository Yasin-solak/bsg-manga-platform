import { ArrowRight, Megaphone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { formatRelativeAge } from './dashboardFormatters'
import type { DashboardAnnouncementView, DashboardTargetSection } from './dashboardTypes'
import { txa } from '@/i18n/activeLocale'

interface DashboardAnnouncementsPanelProps {
  announcements: DashboardAnnouncementView[]
  onNavigate: (target: DashboardTargetSection) => void
}

/** Live / recent announcements; if empty, one row and "Write an announcement". */
export function DashboardAnnouncementsPanel({
  announcements,
  onNavigate,
}: DashboardAnnouncementsPanelProps) {
  return (
    <section
      className="overflow-hidden rounded-[20px] border border-border/70 bg-card/60"
      aria-labelledby="dashboard-announcements-title"
      data-testid="dashboard-announcements-panel"
    >
      <header className="flex items-center justify-between gap-3 px-5 pb-2 pt-4">
        <h2 id="dashboard-announcements-title" className="inline-flex items-center gap-2 text-[15px] font-bold tracking-tight text-foreground">
          <Megaphone className="size-4 text-amber-500" aria-hidden="true" />
          {txa('Duyurular')}
        </h2>
        <Button size="sm" variant="ghost" className="h-8 gap-1 px-2.5 text-[12px]" onClick={() => onNavigate('announcements')}>
          {announcements.length ? txa('Tümü') : txa('Duyuru yaz')}
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </Button>
      </header>

      {announcements.length === 0 ? (
        <p className="px-5 pb-4 text-[12.5px] text-muted-foreground">{txa('Yayında duyuru yok.')}</p>
      ) : (
        <ul className="divide-y divide-border/50 border-t border-border/50">
          {announcements.slice(0, 3).map((item) => (
            <li key={item.id} className="flex items-start gap-3 px-5 py-2.5" data-testid={`dashboard-announcement-${item.id}`}>
              <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', item.isActive ? 'bg-emerald-500' : 'bg-muted-foreground/40')} aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="shrink-0 rounded-md bg-muted px-1.5 py-px text-[10.5px] font-semibold text-muted-foreground">{item.category}</span>
                  <span className="truncate text-[13px] font-medium text-foreground">{item.title}</span>
                </span>
                {item.body ? <span className="mt-0.5 block line-clamp-1 text-[11.5px] text-muted-foreground">{item.body}</span> : null}
              </span>
              <span className="shrink-0 text-[11px] text-muted-foreground">{formatRelativeAge(item.updatedAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
