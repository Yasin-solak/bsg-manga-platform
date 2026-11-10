import { ArrowRight, ChevronRight, Flag, ListChecks, Scale, ShieldCheck, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import { formatDurationMinutes, formatNumberTr } from './dashboardFormatters'
import type { DashboardQueueView, DashboardTargetSection } from './dashboardTypes'
import { txa } from '@/i18n/activeLocale'

const QUEUE_ICONS: Record<string, LucideIcon> = {
  approval: ListChecks,
  community: ShieldCheck,
  reports: Flag,
  legal: Scale,
}

function priorityLabel(priority: DashboardQueueView['priority']) {
  if (priority === 'critical') return txa('Kritik')
  if (priority === 'high') return txa('Yüksek')
  if (priority === 'medium') return txa('Orta')
  return txa('Normal')
}

function priorityClass(priority: DashboardQueueView['priority']) {
  if (priority === 'critical') return 'bg-rose-500/12 text-rose-600 dark:text-rose-300'
  if (priority === 'high') return 'bg-orange-500/12 text-orange-600 dark:text-orange-300'
  if (priority === 'medium') return 'bg-amber-500/12 text-amber-700 dark:text-amber-300'
  return 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300'
}

function iconClass(priority: DashboardQueueView['priority']) {
  if (priority === 'critical' || priority === 'high') return 'bg-rose-500/10 text-rose-500'
  if (priority === 'medium') return 'bg-amber-500/10 text-amber-500'
  return 'bg-primary/10 text-primary'
}

/** Queue's second line: a bar if real SLA/completion data exists, otherwise the age of the oldest job. */
function QueueStatus({ queue }: { queue: DashboardQueueView }) {
  if (queue.status) {
    return (
      <span className="mt-1 flex items-center gap-2">
        <Progress
          value={queue.status.percent}
          className="h-1.5 max-w-[140px]"
          aria-label={`${queue.label} ${queue.status.label}`}
          aria-valuetext={txa('%{v1}', { v1: Math.round(queue.status.percent) })}
        />
        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
          {txa('%{v1}', { v1: Math.round(queue.status.percent) })} · {queue.status.label}
        </span>
      </span>
    )
  }
  if (queue.availability === 'disabled') return <span className="block text-[11.5px] text-muted-foreground">{txa('Modül kapalı')}</span>
  if (queue.availability === 'unavailable') return <span className="block text-[11.5px] text-muted-foreground">{txa('Veri alınamadı')}</span>
  return (
    <span className="block truncate text-[11.5px] text-muted-foreground">
      {!queue.pendingCount
        ? txa('Kuyruk boş')
        : queue.oldestAgeMinutes == null
          ? txa('Bekleyen iş var')
          : txa('En eski iş {v1} önce', { v1: formatDurationMinutes(queue.oldestAgeMinutes) })}
    </span>
  )
}

interface DashboardOperationsCenterProps {
  queues: DashboardQueueView[]
  onNavigate: (target: DashboardTargetSection) => void
}

export function DashboardOperationsCenter({ queues, onNavigate }: DashboardOperationsCenterProps) {
  const openTotal = queues.reduce((sum, queue) => sum + (queue.availability === 'available' ? queue.pendingCount ?? 0 : 0), 0)
  return (
    <section
      className="flex min-w-0 flex-col overflow-hidden rounded-[20px] border border-border/70 bg-card/60"
      aria-labelledby="dashboard-operations-title"
      data-testid="dashboard-operations-center"
    >
      <header className="flex items-center gap-3 px-5 pb-2 pt-4">
        <span className="min-w-0 flex-1">
          {/*
            "Operasyon Merkezi" ADI BILEREK BIRAKILDI: bu panel moderasyon/icerik
            KUYRUKLARINI gosterir; teknik operasyon ayri sayfada (/admin/operasyon).
          */}
          <h2 id="dashboard-operations-title" className="text-[15px] font-bold tracking-tight text-foreground">
            {txa('İş kuyrukları')}
          </h2>
          <span className="text-[12px] text-muted-foreground">
            {openTotal ? txa('{v1} açık iş · en acil olan üstte', { v1: formatNumberTr(openTotal) }) : txa('Bütün kuyruklar boş')}
          </span>
        </span>
        <Button size="sm" variant="ghost" className="h-8 gap-1 px-2.5 text-[12px]" onClick={() => onNavigate('pending')}>
          {txa('Onay kuyruğu')}
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </Button>
      </header>

      <ul className="divide-y divide-border/50 border-t border-border/50">
        {queues.map((queue) => {
          const Icon = QUEUE_ICONS[queue.id] || ListChecks
          const disabled = queue.availability !== 'available'
          return (
            <li key={queue.id} data-testid={`dashboard-queue-${queue.id}`}>
              <button
                type="button"
                disabled={disabled}
                aria-label={txa('{v1} alanını incele', { v1: queue.label })}
                data-testid={`dashboard-queue-open-${queue.id}`}
                onClick={() => onNavigate(queue.target)}
                className="group flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-muted/40 disabled:cursor-default disabled:opacity-60 disabled:hover:bg-transparent"
              >
                <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-xl', iconClass(queue.priority))}>
                  <Icon className="size-[18px]" strokeWidth={1.9} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-semibold text-foreground">{queue.label}</span>
                  <QueueStatus queue={queue} />
                </span>
                <span className="text-right">
                  <span className="block text-[19px] font-black leading-none tabular-nums text-foreground">
                    {queue.pendingCount == null ? '—' : formatNumberTr(queue.pendingCount)}
                  </span>
                  <span className="text-[10.5px] text-muted-foreground">{txa('bekleyen')}</span>
                </span>
                <span className={cn('hidden w-[62px] shrink-0 rounded-full px-2 py-0.5 text-center text-[11px] font-semibold sm:inline-block', priorityClass(queue.priority))}>
                  {priorityLabel(queue.priority)}
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
