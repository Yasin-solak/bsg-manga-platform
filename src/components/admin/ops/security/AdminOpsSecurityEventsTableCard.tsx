import { forwardRef, type Dispatch, type SetStateAction } from 'react'
import { AlertTriangle } from 'lucide-react'
import type { SecurityEventItem } from '@/services/adminSecurityService'
import { AdminSurface } from '@/components/admin/shared/AdminSurface'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  SEVERITY_OPTIONS,
  formatDateTime,
  severityBadgeClass,
  type EventFilterSeverity,
} from './adminOpsSecurityUtils'
import { intlLocale, txa } from '@/i18n/activeLocale'

interface AdminOpsSecurityEventsTableCardProps {
  eventsLoading: boolean
  eventsError: string | null
  filteredEvents: SecurityEventItem[]
  /** The frame in the title; the list shows the same window as the summary. */
  windowHours: number
  /** Record count in the window before filtering: for a "3/48" reading. */
  windowTotal: number
  /** Fetch limiti pencereyi kesiyorsa true; sessiz eksiklik yasak. */
  truncated: boolean
  eventsLimit: number
  onRaiseLimit: () => void
  eventsSearch: string
  eventsSeverityFilter: EventFilterSeverity
  eventsSourceFilter: string
  eventSources: string[]
  setEventsSearch: Dispatch<SetStateAction<string>>
  setEventsSeverityFilter: Dispatch<SetStateAction<EventFilterSeverity>>
  setEventsSourceFilter: Dispatch<SetStateAction<string>>
}

const selectInputClass =
  'h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-sm'

export const AdminOpsSecurityEventsTableCard = forwardRef<
  HTMLElement,
  AdminOpsSecurityEventsTableCardProps
>(function AdminOpsSecurityEventsTableCard(
  {
    eventsLoading,
    eventsError,
    filteredEvents,
    windowHours,
    windowTotal,
    truncated,
    eventsLimit,
    onRaiseLimit,
    eventsSearch,
    eventsSeverityFilter,
    eventsSourceFilter,
    eventSources,
    setEventsSearch,
    setEventsSeverityFilter,
    setEventsSourceFilter,
  },
  ref,
) {
  const filterActive =
    eventsSeverityFilter !== 'all' || eventsSourceFilter !== 'all' || !!eventsSearch.trim()

  return (
    <AdminSurface ref={ref} className="p-4" data-testid="admin-ops-security-events">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="m-0 font-heading text-base text-foreground">{txa('Güvenlik olay akışı')}</h2>
          <Badge variant="outline" className="rounded-lg tabular-nums">
            {filterActive
              ? `${filteredEvents.length}/${windowTotal}`
              : filteredEvents.length.toLocaleString(intlLocale())}
          </Badge>
        </div>
        <span className="text-[11px] text-muted-foreground">
          {txa('Son {v1} saat · ozetle ayni pencere', { v1: windowHours })}
        </span>
      </div>

      {/* Kirpilma uyarisi listenin USTUNDE: altta olsa okunmadan
          "hepsi bu kadarmis" diye kapatilirdi. */}
      {truncated ? (
        <div
          className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5"
          data-testid="admin-ops-security-events-truncated"
        >
          <span className="flex items-center gap-2 text-[11px] leading-4 text-amber-700 dark:text-amber-300">
            <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
            {txa('Cekim limiti (')}{eventsLimit}{txa(') doldu; bu pencerede gosterilmeyen event olabilir.')}
          </span>
          <Button type="button" size="sm" variant="outline" onClick={onRaiseLimit}>
            {txa('Limiti artir')}
          </Button>
        </div>
      ) : null}

      <div className="mb-3 grid grid-cols-[2fr_1fr_1fr_auto] gap-2.5 max-[900px]:grid-cols-1">
        <Input
          type="text"
          value={eventsSearch}
          onChange={(event) => setEventsSearch(event.target.value)}
          placeholder={txa('Event/source/message/metadata ara...')}
        />
        <select
          className={selectInputClass}
          value={eventsSeverityFilter}
          onChange={(event) =>
            setEventsSeverityFilter(event.target.value as EventFilterSeverity)
          }
          aria-label={txa('Severity filtresi')}
        >
          {SEVERITY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          className={selectInputClass}
          value={eventsSourceFilter}
          onChange={(event) => setEventsSourceFilter(event.target.value)}
          aria-label={txa('Kaynak filtresi')}
        >
          <option value="all">{txa('Tüm kaynaklar')}</option>
          {eventSources.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <Button
          type="button"
          variant="outline"
          disabled={!filterActive}
          onClick={() => {
            setEventsSearch('')
            setEventsSeverityFilter('all')
            setEventsSourceFilter('all')
          }}
        >
          {txa('Filtreyi temizle')}
        </Button>
      </div>
      {eventsLoading ? (
        <p className="text-sm text-muted-foreground">{txa('Güvenlik olayları yükleniyor…')}</p>
      ) : eventsError ? (
        <p className="text-sm text-muted-foreground">{eventsError}</p>
      ) : filteredEvents.length === 0 ? (
        // An empty list must SAY WHY; otherwise people look for a fault that does not exist.
        <p className="text-sm text-muted-foreground">
          {filterActive
            ? txa('Bu filtreye uyan olay yok. Filtreyi temizleyip tekrar dene.')
            : txa('Son {v1} saatte guvenlik eventi kaydedilmemis.', { v1: windowHours })}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full divide-y divide-border text-sm">
            <thead>
              <tr className="text-left">
                <th className="py-2 pr-2 font-semibold">{txa('Zaman')}</th>
                <th className="py-2 pr-2 font-semibold">{txa('Severity')}</th>
                <th className="py-2 pr-2 font-semibold">{txa('Kaynak')}</th>
                <th className="py-2 pr-2 font-semibold">{txa('Event')}</th>
                <th className="py-2 pr-2 font-semibold">{txa('Mesaj')}</th>
                <th className="py-2 pr-2 font-semibold">{txa('Aktor/Hedef')}</th>
                <th className="py-2 pr-2 font-semibold">{txa('Detay')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredEvents.map((item) => (
                <tr key={item.id}>
                  <td className="py-2 pr-2">{formatDateTime(item.createdAt)}</td>
                  <td className="py-2 pr-2">
                    <Badge
                      variant="outline"
                      className={cn(
                        'min-w-[82px] font-extrabold uppercase',
                        severityBadgeClass(item.severity),
                      )}
                    >
                      {item.severity}
                    </Badge>
                  </td>
                  <td className="py-2 pr-2">{item.source}</td>
                  <td className="py-2 pr-2">
                    <code className="rounded bg-muted px-1 py-0.5 text-xs">
                      {item.eventType}
                    </code>
                  </td>
                  <td className="py-2 pr-2">{item.message || '-'}</td>
                  <td className="py-2 pr-2">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs font-bold">
                        {item.actorUsername || item.actorUserId || '-'}
                      </span>
                      <small className="text-[11px] text-muted-foreground">
                        {item.targetUsername || item.targetUserId || '-'}
                      </small>
                    </div>
                  </td>
                  <td className="py-2 pr-2">
                    <details className="max-w-[260px] [&_summary]:cursor-pointer [&_summary]:select-none">
                      <summary>JSON</summary>
                      <pre className="mt-1.5 max-h-[220px] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-muted/30 p-2 text-[11px] leading-snug">
                        {JSON.stringify(item.metadata || {}, null, 2)}
                      </pre>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminSurface>
  )
})
