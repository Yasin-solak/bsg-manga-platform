import { RefreshCw, Settings2 } from 'lucide-react'
import { AdminSurface } from '@/components/admin/shared/AdminSurface'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { txa } from '@/i18n/activeLocale'

/**
 * Security tab control strip.
 *
 * **The monitoring window is not a setting but the page's FRAME.** Every number below
 * is calculated from it; being a fourth box in a dropdown hid that.
 * Now it is at the top, as segment buttons, with the selected one
 * visible.
 *
 * The other three numbers (anomaly threshold/limit, event limit) do not change in daily
 * use, so they went inside `details`. A rarely used setting should not occupy
 * the top of the screen on every open.
 */

interface AdminOpsSecurityControlsCardProps {
  windowHours: number
  anomalyMinCount: number
  anomalyLimit: number
  eventsLimit: number
  overviewLoading: boolean
  eventsLoading: boolean
  anomalyLoading: boolean
  cleanupLoading: boolean
  onWindowHoursChange: (value: number) => void
  onAnomalyMinCountChange: (value: number) => void
  onAnomalyLimitChange: (value: number) => void
  onEventsLimitChange: (value: number) => void
  onRefreshAll: () => void
  onCleanupExpiredBans: () => void
}

const WINDOW_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 6, label: '6s' },
  { value: 12, label: '12s' },
  { value: 24, label: '24s' },
  { value: 72, label: '3g' },
  { value: 168, label: '7g' },
]

export function AdminOpsSecurityControlsCard({
  windowHours,
  anomalyMinCount,
  anomalyLimit,
  eventsLimit,
  overviewLoading,
  eventsLoading,
  anomalyLoading,
  cleanupLoading,
  onWindowHoursChange,
  onAnomalyMinCountChange,
  onAnomalyLimitChange,
  onEventsLimitChange,
  onRefreshAll,
  onCleanupExpiredBans,
}: AdminOpsSecurityControlsCardProps) {
  const busy = overviewLoading || eventsLoading || anomalyLoading

  return (
    <AdminSurface className="p-4" data-testid="admin-ops-security-controls">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-muted-foreground">{txa('Izleme penceresi')}</span>
          <div
            className="inline-flex overflow-hidden rounded-lg border border-border"
            role="group"
            aria-label={txa('Izleme penceresi')}
          >
            {WINDOW_OPTIONS.map((option) => {
              const active = windowHours === option.value
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => onWindowHoursChange(option.value)}
                  aria-pressed={active}
                  className={cn(
                    'px-3 py-1.5 text-xs font-semibold transition-colors',
                    'border-r border-border last:border-r-0',
                    active
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-transparent text-muted-foreground hover:bg-muted',
                  )}
                >
                  {option.label}
                </button>
              )
            })}
          </div>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onRefreshAll}
          disabled={busy || cleanupLoading}
        >
          <RefreshCw className={cn('mr-1.5 size-3.5', busy && 'animate-spin')} aria-hidden="true" />
          {busy ? txa('Yükleniyor…') : txa('Yenile')}
        </Button>
      </div>

      <details className="group mt-3 border-t border-border pt-3">
        <summary className="inline-flex cursor-pointer select-none items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground">
          <Settings2 className="size-3.5" aria-hidden="true" />
          {txa('Gelismis ayarlar')}
        </summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
            {txa('Anomaly esigi')}
            <Input
              type="number"
              min={2}
              max={50}
              value={anomalyMinCount}
              onChange={(event) =>
                onAnomalyMinCountChange(
                  Math.min(50, Math.max(2, Number(event.target.value || 2))),
                )
              }
            />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
            {txa('Anomaly limiti')}
            <Input
              type="number"
              min={5}
              max={100}
              value={anomalyLimit}
              onChange={(event) =>
                onAnomalyLimitChange(
                  Math.min(100, Math.max(5, Number(event.target.value || 5))),
                )
              }
            />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
            {txa('Event cekim limiti')}
            <Input
              type="number"
              min={30}
              max={400}
              value={eventsLimit}
              onChange={(event) =>
                onEventsLimitChange(
                  Math.min(400, Math.max(30, Number(event.target.value || 30))),
                )
              }
            />
          </label>
        </div>

        {/*
          Yikici islem gelismis alanin icinde ve KIRMIZI DEGIL.
          Kart basliginda duran buyuk kirmizi dugme, tehlikeyi normallestiriyor
          ve yanlislikla basilmaya davetiye cikariyordu; aksiyon dogrulama
          diyalogu zaten servis katmaninda.
        */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
          <span className="text-[11px] leading-4 text-muted-foreground">
            {txa('Suresi dolan banlari toplu temizler; ban kaydini kaldirir, kullaniciyi silmez.')}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onCleanupExpiredBans}
            disabled={cleanupLoading || overviewLoading || eventsLoading}
          >
            {cleanupLoading ? txa('Temizleniyor...') : txa('Suresi dolan banlari temizle')}
          </Button>
        </div>
      </details>
    </AdminSurface>
  )
}
