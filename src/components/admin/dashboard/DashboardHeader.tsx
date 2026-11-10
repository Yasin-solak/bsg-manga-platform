import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { AdminDashboardPeriod } from '@/services/adminService'
import { cn } from '@/lib/utils'
import { formatDateTimeTr } from './dashboardFormatters'
import { txa } from '@/i18n/activeLocale'

const PERIODS: Array<{ value: AdminDashboardPeriod; label: string }> = [
  { value: '7d', get label() { return txa('7 gün') } },
  { value: '30d', get label() { return txa('30 gün') } },
  { value: 'month', get label() { return txa('Bu ay') } },
]

interface DashboardHeaderProps {
  generatedAt: string | null
  period: AdminDashboardPeriod
  isRefreshing: boolean
  canChangePeriod: boolean
  onPeriodChange?: (period: AdminDashboardPeriod) => void
  onRefresh: () => void | Promise<void>
}

/** Overview header: title + update time, period picker and refresh on the right. */
export function DashboardHeader({
  generatedAt,
  period,
  isRefreshing,
  canChangePeriod,
  onPeriodChange,
  onRefresh,
}: DashboardHeaderProps) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[26px] font-black leading-tight tracking-tight text-foreground">{txa('Genel bakış')}</h1>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          {txa('Platformun nabzı ve bekleyen işler · güncellendi')}{' '}
          <time dateTime={generatedAt || undefined} className="tabular-nums">
            {formatDateTimeTr(generatedAt)}
          </time>
        </p>
      </div>

      <div className="flex items-center gap-2">
        <div
          className="inline-flex rounded-xl bg-muted/60 p-1"
          role="group"
          aria-label={txa('Dashboard dönem filtresi')}
          data-testid="dashboard-period-filter"
        >
          {PERIODS.map((entry) => {
            const selected = entry.value === period
            return (
              <button
                key={entry.value}
                type="button"
                className={cn(
                  'rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60',
                  selected ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
                aria-pressed={selected}
                data-testid={`dashboard-period-${entry.value}`}
                disabled={!canChangePeriod || isRefreshing}
                onClick={() => onPeriodChange?.(entry.value)}
              >
                {entry.label}
              </button>
            )
          })}
        </div>

        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-9 gap-1.5 rounded-full px-3.5"
          disabled={isRefreshing}
          aria-label={isRefreshing ? txa('Dönemsel metrikler yenileniyor') : txa('Dönemsel metrikleri yenile')}
          aria-busy={isRefreshing}
          data-testid="dashboard-refresh"
          onClick={() => { void onRefresh() }}
        >
          <RefreshCw
            className={cn('h-3.5 w-3.5', isRefreshing && 'animate-spin motion-reduce:animate-none')}
            aria-hidden="true"
          />
          <span className="hidden sm:inline">{isRefreshing ? txa('Yenileniyor') : txa('Yenile')}</span>
        </Button>
        <span className="sr-only" role="status" aria-live="polite">
          {isRefreshing ? txa('Genel bakış verileri yenileniyor.') : ''}
        </span>
      </div>
    </header>
  )
}
