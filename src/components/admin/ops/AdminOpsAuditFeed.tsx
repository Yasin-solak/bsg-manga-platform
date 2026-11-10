import { useState } from 'react'
import type { AdminAuditLogItem } from '@/services/adminOpsService'
import { AdminSurface } from '@/components/admin/shared/AdminSurface'
import { cn } from '@/lib/utils'
import { resolveAuditActor } from './adminOpsUtils'
import { intlLocale, txa } from '@/i18n/activeLocale'

/**
 * Audit record feed: the handoff's row layout grouped by day.
 *
 * It used to be a six-column table: the time column printed a full date on each row, turning
 * "what happened today" into date reading. Now the day is a HEADER and rows have
 * only the time.
 *
 * A row reads like a SENTENCE: [who] [did what] -> [to what]. The table scattered the same
 * info over three columns.
 */

interface AdminOpsAuditFeedProps {
  auditLoading: boolean
  auditError: string | null
  auditLoaded: boolean
  auditLogs: AdminAuditLogItem[]
  /** Zaman daraltmasi aciksa baslikta gorunur. */
  recentOnly: boolean
}

/** Should print something even without a name; an empty circle blurs identity. */
function initialsOf(name: string): string {
  const parts = name.trim().split(/[\s._-]+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toLocaleUpperCase(intlLocale())
  return (parts[0]![0]! + parts[1]![0]!).toLocaleUpperCase(intlLocale())
}

/** Gun basligi: bugun/dun okunur, oncesi tarih. */
function dayLabelOf(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return txa('Bilinmeyen tarih')

  const startOfDay = (input: Date) =>
    new Date(input.getFullYear(), input.getMonth(), input.getDate()).getTime()
  const now = new Date()
  const diffDays = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000)

  if (diffDays === 0) return txa('Bugun')
  if (diffDays === 1) return txa('Dun')
  return date.toLocaleDateString(intlLocale(), { day: '2-digit', month: 'long', year: 'numeric' })
}

function timeOf(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleTimeString(intlLocale(), { hour: '2-digit', minute: '2-digit' })
}

interface DayGroup {
  label: string
  entries: AdminAuditLogItem[]
}

/** Liste zaten zaman sirali gelir; gruplama sirayi KORUR. */
function buildDayGroups(logs: AdminAuditLogItem[]): DayGroup[] {
  const groups: DayGroup[] = []
  for (const item of logs) {
    const label = dayLabelOf(item.createdAt)
    const last = groups[groups.length - 1]
    if (last && last.label === label) last.entries.push(item)
    else groups.push({ label, entries: [item] })
  }
  return groups
}

export function AdminOpsAuditFeed({
  auditLoading,
  auditError,
  auditLoaded,
  auditLogs,
  recentOnly,
}: AdminOpsAuditFeedProps) {
  const [openDetailId, setOpenDetailId] = useState<string | null>(null)

  if (auditLoading || auditError || !auditLoaded || auditLogs.length === 0) {
    return (
      <AdminSurface
        className={cn('p-6 text-center', auditLogs.length === 0 && auditLoaded && 'border-dashed')}
        data-testid="admin-ops-audit-table"
      >
        <p className="m-0 text-sm text-muted-foreground">
          {auditLoading
            ? txa('Denetim kaydı yükleniyor…')
            : auditError
              ? auditError
              : !auditLoaded
                ? txa('Denetim kaydı henüz yüklenmedi.')
                : txa('Bu filtreye uyan kayıt yok.')}
        </p>
      </AdminSurface>
    )
  }

  return (
    <div className="space-y-5" data-testid="admin-ops-audit-table">
      {recentOnly ? (
        // A narrowed list must SAY so; otherwise missing records seem "lost".
        <p className="m-0 text-[11px] font-semibold text-primary">{txa('Yalnizca son 24 saat')}</p>
      ) : null}

      {buildDayGroups(auditLogs).map((group) => (
        <section key={group.label}>
          <h3 className="mb-2 px-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            {group.label}
            <span className="ml-2 font-semibold normal-case tracking-normal">
              {group.entries.length}{' '}{txa('kayit')}
            </span>
          </h3>

          <AdminSurface className="overflow-hidden p-0">
            {group.entries.map((item, index) => {
              const actorName = resolveAuditActor(item)
              const detailOpen = openDetailId === item.id
              return (
                <div
                  key={item.id}
                  className={cn('px-4 py-3', index > 0 && 'border-t border-border')}
                  data-testid="admin-ops-audit-row"
                >
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span
                      className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-bold text-muted-foreground"
                      aria-hidden="true"
                    >
                      {initialsOf(actorName)}
                    </span>
                    <span className="text-[13px] font-semibold text-foreground">{actorName}</span>
                    <code className="rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-[11px] text-foreground">
                      {item.action}
                    </code>
                    <span className="text-xs text-muted-foreground">
                      → {item.resourceType}
                      {item.resourceId ? ` · ${item.resourceId}` : ''}
                    </span>
                    <span className="flex-1" />
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {timeOf(item.createdAt)}
                    </span>
                    <button
                      type="button"
                      onClick={() => setOpenDetailId(detailOpen ? null : item.id)}
                      aria-expanded={detailOpen}
                      className={cn(
                        'shrink-0 rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors',
                        detailOpen
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground',
                      )}
                    >
                      {detailOpen ? txa('Kapat') : 'JSON'}
                    </button>
                  </div>

                  {item.summary ? (
                    <p className="m-0 ml-[38px] mt-1.5 text-[13px] leading-5 text-foreground/80">
                      {item.summary}
                    </p>
                  ) : null}

                  {detailOpen ? (
                    <pre className="ml-[38px] mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-muted/40 p-3 text-[11px] leading-relaxed text-foreground">
                      {JSON.stringify(item.metadata || {}, null, 2)}
                    </pre>
                  ) : null}
                </div>
              )
            })}
          </AdminSurface>
        </section>
      ))}
    </div>
  )
}
