import { Activity, CircleCheck, CircleDashed, TriangleAlert } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { DashboardHealthItemView, DashboardHealthView } from './dashboardTypes'
import { txa } from '@/i18n/activeLocale'

function itemTone(item: DashboardHealthItemView) {
  if (item.tone === 'critical') return 'text-destructive'
  if (item.tone === 'attention') return 'text-amber-700 dark:text-amber-400'
  if (item.tone === 'stable') return 'text-emerald-700 dark:text-emerald-400'
  return 'text-muted-foreground'
}

function HealthItemIcon({ item }: { item: DashboardHealthItemView }) {
  if (item.tone === 'critical' || item.tone === 'attention') {
    return <TriangleAlert className="size-3.5" aria-hidden="true" />
  }
  if (item.tone === 'stable') return <CircleCheck className="size-3.5" aria-hidden="true" />
  return <CircleDashed className="size-3.5" aria-hidden="true" />
}

function HealthGauge({ score }: { score: number | null }) {
  const normalized = score == null ? 0 : Math.max(0, Math.min(100, score))
  const radius = 30
  const circumference = 2 * Math.PI * radius
  const dash = (normalized / 100) * circumference

  return (
    <div
      className="relative size-[84px] shrink-0"
      role="meter"
      aria-label={txa('Operasyon sağlığı skoru')}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={score == null ? undefined : Math.round(normalized)}
      aria-valuetext={score == null ? txa('Veri yok') : `${Math.round(normalized)} / 100`}
    >
      <svg viewBox="0 0 72 72" className="size-full -rotate-90" aria-hidden="true">
        <circle cx="36" cy="36" r={radius} fill="none" stroke="currentColor" strokeWidth="5" className="text-muted" />
        <circle
          cx="36"
          cy="36"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference - dash}`}
          className="text-primary transition-[stroke-dasharray] duration-300 motion-reduce:transition-none"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-lg font-semibold tabular-nums text-primary">
          {score == null ? '—' : `${Math.round(normalized)}%`}
        </span>
        <span className="text-[9px] text-muted-foreground">{txa('Kalite ort.')}</span>
      </div>
    </div>
  )
}

export function DashboardHealthPanel({ health }: { health: DashboardHealthView }) {
  return (
    <section
      className="rounded-[20px] border border-border/70 bg-card/60 px-5 pb-4 pt-4"
      aria-labelledby="dashboard-health-title"
      data-testid="dashboard-health-panel"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2">
          <Activity className="size-4 text-primary" aria-hidden="true" />
          <h2 id="dashboard-health-title" className="text-[15px] font-bold tracking-tight text-foreground">
            {txa(health.title)}
          </h2>
        </span>
        <span className="text-[11px] font-medium text-muted-foreground">
          {health.status === 'partial' ? txa('Kısmi · ') : health.status === 'unavailable' ? txa('Veri yok · ') : ''}
          {txa('{v1}/{v2} metrik', { v1: health.availableMetricCount, v2: health.totalMetricCount })}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
        <ul className="min-w-0 space-y-2">
          {health.items.slice(0, 4).map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3 text-[12.5px]">
              <span className={cn('inline-flex min-w-0 items-center gap-2', itemTone(item))}>
                <HealthItemIcon item={item} />
                <span className="truncate text-foreground">{item.label}</span>
              </span>
              <span className={cn('shrink-0 font-medium', itemTone(item))}>{item.statusLabel}</span>
            </li>
          ))}
        </ul>
        <HealthGauge score={health.score} />
      </div>

      <p className="mt-3 border-t border-border/60 pt-2 text-[11px] leading-relaxed text-muted-foreground">
        {txa(health.disclosure)}
      </p>
    </section>
  )
}
