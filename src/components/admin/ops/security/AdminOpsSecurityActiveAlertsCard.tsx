import type {
  SecurityAlertItem,
  SecurityAlertStatus,
} from '@/services/adminSecurityService'
import { AdminSurface } from '@/components/admin/shared/AdminSurface'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  STATUS_OPTIONS,
  alertStatusBadgeClass,
  alertStatusLabel,
  formatDateTime,
  scopeLabel,
  type AlertStatusFilter,
} from './adminOpsSecurityAlertsUtils'
import { intlLocale, txa } from '@/i18n/activeLocale'

/**
 * Active alarm center: the row list from the handoff.
 *
 * It used to be an eight-column table; "Last notice" and "Mute" columns ate half the
 * screen and action buttons slid far right into horizontal scrolling. An alarm is a ROW:
 * dot (severity) · event · status · hit · time ·
 * job to do.
 *
 * The status filter is a SEGMENT, not a dropdown: all four options are visible at a
 * glance and the selected one can be read.
 */

interface AdminOpsSecurityActiveAlertsCardProps {
  alertsLoading: boolean
  alertsError: string | null
  alerts: SecurityAlertItem[]
  alertsSearch: string
  alertsStatusFilter: AlertStatusFilter
  alertsLimit: number
  statusBusyId: string | null
  onAlertsSearchChange: (value: string) => void
  onAlertsStatusFilterChange: (value: AlertStatusFilter) => void
  onAlertsLimitChange: (value: number) => void
  onReload: () => void
  onSetAlertStatus: (alertId: string, status: SecurityAlertStatus) => void
}

/** Onem noktasi: cozulmus alarm sonuk, kritik kirmizi. */
function dotClass(item: SecurityAlertItem): string {
  if (item.status === 'resolved') return 'bg-muted-foreground/40'
  if (item.severity === 'critical') return 'bg-destructive'
  if (item.severity === 'high') return 'bg-amber-500'
  return 'bg-yellow-500'
}

export function AdminOpsSecurityActiveAlertsCard({
  alertsLoading,
  alertsError,
  alerts,
  alertsSearch,
  alertsStatusFilter,
  alertsLimit,
  statusBusyId,
  onAlertsSearchChange,
  onAlertsStatusFilterChange,
  onAlertsLimitChange,
  onReload,
  onSetAlertStatus,
}: AdminOpsSecurityActiveAlertsCardProps) {
  return (
    <AdminSurface className="p-4" data-testid="admin-ops-security-alerts">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="m-0 font-heading text-base text-foreground">{txa('Aktif alarm merkezi')}</h2>
          <Badge variant="outline" className="rounded-lg tabular-nums">
            {alerts.length}
          </Badge>
        </div>

        <div
          className="inline-flex overflow-hidden rounded-lg border border-border"
          role="group"
          aria-label={txa('Alarm durumu filtresi')}
        >
          {STATUS_OPTIONS.map((option) => {
            const active = alertsStatusFilter === option.value
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => onAlertsStatusFilterChange(option.value)}
                aria-pressed={active}
                className={cn(
                  'border-r border-border px-3 py-1.5 text-xs font-semibold transition-colors last:border-r-0',
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

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Input
          type="text"
          placeholder={txa('event/source/scope ara...')}
          value={alertsSearch}
          onChange={(event) => onAlertsSearchChange(event.target.value)}
          className="h-9 w-full sm:w-64"
          aria-label={txa('Alarm ara')}
        />
        <Input
          type="number"
          min={20}
          max={500}
          value={alertsLimit}
          onChange={(event) =>
            onAlertsLimitChange(Math.min(500, Math.max(20, Number(event.target.value || 20))))
          }
          className="h-9 w-24"
          aria-label={txa('Alarm cekim limiti')}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onReload}
          disabled={alertsLoading || Boolean(statusBusyId)}
        >
          {alertsLoading ? txa('Yükleniyor…') : txa('Yenile')}
        </Button>
      </div>

      {alertsError ? (
        <p className="m-0 text-sm text-muted-foreground">{alertsError}</p>
      ) : alertsLoading ? (
        <p className="m-0 text-sm text-muted-foreground">{txa('Alarmlar yükleniyor…')}</p>
      ) : alerts.length === 0 ? (
        <p className="m-0 py-6 text-center text-sm text-muted-foreground">
          {txa('Bu gorunumde alarm yok.')}
        </p>
      ) : (
        <div className="divide-y divide-border">
          {alerts.map((item) => (
            <div
              key={item.id}
              className={cn(
                'flex flex-wrap items-center gap-3 py-3',
                item.status === 'resolved' && 'opacity-60',
                item.severity === 'critical' && item.status !== 'resolved' && '-mx-2 rounded-lg bg-destructive/5 px-2',
              )}
            >
              <span
                className={cn('size-2 shrink-0 rounded-full', dotClass(item))}
                aria-hidden="true"
              />
              <div className="min-w-[170px]">
                <strong className="block font-mono text-[13px] text-foreground">
                  {item.eventType}
                </strong>
                <small className="text-[11px] text-muted-foreground">
                  {scopeLabel(item)} · {item.source || txa('tüm kaynaklar')}
                </small>
              </div>

              <Badge
                variant="outline"
                className={cn('font-semibold', alertStatusBadgeClass(item.status))}
              >
                {alertStatusLabel(item.status)}
              </Badge>

              <span className="text-xs text-muted-foreground">
                Hit: <span className="tabular-nums">{item.hitCount.toLocaleString(intlLocale())}</span>
              </span>

              <span className="flex-1 text-xs text-muted-foreground">
                {formatDateTime(item.lastHitAt)}
                {item.mutedUntil ? ` · sessiz: ${formatDateTime(item.mutedUntil)}` : ''}
              </span>

              <div className="flex flex-wrap gap-1.5">
                {item.status !== 'acknowledged' && item.status !== 'resolved' ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={statusBusyId === item.id}
                    onClick={() => onSetAlertStatus(item.id, 'acknowledged')}
                  >
                    {txa('Onayla')}
                  </Button>
                ) : null}
                {item.status !== 'resolved' ? (
                  <Button
                    type="button"
                    size="sm"
                    disabled={statusBusyId === item.id}
                    onClick={() => onSetAlertStatus(item.id, 'resolved')}
                  >
                    {txa('Çözüldü')}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={statusBusyId === item.id}
                    onClick={() => onSetAlertStatus(item.id, 'open')}
                  >
                    {txa('Yeniden ac')}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </AdminSurface>
  )
}
