import { useNavigate } from '@/i18n/router'
import type { SecurityOverview } from '@/services/adminSecurityService'
import { AdminOpsStatCard } from '../AdminOpsStatCard'
import type { EventFilterSeverity } from './adminOpsSecurityUtils'
import { intlLocale, txa } from '@/i18n/activeLocale'

/**
 * Security > Overview.
 *
 * **Every number is a DOOR.** All seven boxes used to be dead: writing "Critical 2" left the
 * operator to find those two in a 120-row feed.
 * Severity boxes filter the feed, queue boxes go to the related page.
 *
 * As in the handoff, critical/high boxes are COLORED: these two numbers should read differently
 * from the other five and not blend in a gray grid.
 *
 * **The two blocks are SEPARATE on purpose:** the top row depends on the chosen monitoring window, the
 * bottom row is a CURRENT total (pending reports / bans count without a window). In the same grid
 * it read like "12 bans in the last 24 hours"; it was not.
 */

interface AdminOpsSecurityOverviewGridProps {
  overview: SecurityOverview
  loading: boolean
  severityFilter: EventFilterSeverity
  /** Severity box; pressing the same box again clears the filter. */
  onSeverityFilter: (severity: EventFilterSeverity) => void
  /** Redeem kutulari anomaly tablosuna goturur. */
  onFocusAnomalies: () => void
}

export function AdminOpsSecurityOverviewGrid({
  overview,
  loading,
  severityFilter,
  onSeverityFilter,
  onFocusAnomalies,
}: AdminOpsSecurityOverviewGridProps) {
  const navigate = useNavigate()
  const windowLabel = txa('Son {v1} saat', { v1: overview.windowHours })

  /*
   * The RPC's `high_events` field counts severity in ('high','critical'), so it
   * ALSO includes criticals. Labeling the box "High" was wrong and clearly broke once
   * filters were added: it said "High 5" and listed 3 rows.
   * We take the difference to get pure high, so the box and the filtered
   * list give the same number. (Fixed here because changing the RPC signature
   * affects all callers written since 055.)
   */
  const highOnly = Math.max(0, overview.highEvents - overview.criticalEvents)

  // DO NOT SHOW 0 while loading: it reads as "no critical events" when it has not even
  // been asked. Unknown and zero are not the same.
  const num = (value: number) => (loading ? '—' : value.toLocaleString(intlLocale()))

  const toggle = (severity: EventFilterSeverity) =>
    onSeverityFilter(severityFilter === severity ? 'all' : severity)

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <AdminOpsStatCard
          label={txa('Kritik')}
          value={num(overview.criticalEvents)}
          hint={windowLabel}
          tone="danger"
          active={severityFilter === 'critical'}
          action={{
            label: severityFilter === 'critical' ? txa('Filtreyi kaldır') : txa('Akista suz'),
            run: () => toggle('critical'),
          }}
        />
        <AdminOpsStatCard
          label={txa('Yuksek')}
          value={num(highOnly)}
          hint={txa('{v1} · kritik haric', { v1: windowLabel })}
          tone="warn"
          active={severityFilter === 'high'}
          action={{
            label: severityFilter === 'high' ? txa('Filtreyi kaldır') : txa('Akista suz'),
            run: () => toggle('high'),
          }}
        />
        <AdminOpsStatCard
          label={txa('Toplam event')}
          value={num(overview.totalEvents)}
          hint={windowLabel}
          active={severityFilter === 'all'}
          action={{ label: txa('Akisa git'), run: () => onSeverityFilter('all') }}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <AdminOpsStatCard
          label={txa('Bekleyen rapor')}
          value={num(overview.pendingReports)}
          hint={txa('Anlik kuyruk · penceresiz')}
          action={{ label: txa('Raporlar'), run: () => navigate('/admin/raporlar') }}
        />
        <AdminOpsStatCard
          label={txa('Banlı kullanıcı')}
          value={num(overview.bannedUsers)}
          hint={txa('Anlik toplam · penceresiz')}
          action={{ label: txa('Kullanıcılar'), run: () => navigate('/admin/kullanicilar') }}
        />
        <AdminOpsStatCard
          label={txa('Kod aktivasyonu')}
          value={num(overview.codeRedemptions)}
          hint={windowLabel}
          action={{ label: txa('Kodlar'), run: () => navigate('/admin/coin-kodlari') }}
        />
        <AdminOpsStatCard
          label={txa('Supheli redeemer')}
          value={num(overview.suspiciousRedeemers)}
          hint={txa('{v1} · esik ustu', { v1: windowLabel })}
          tone={overview.suspiciousRedeemers > 0 ? 'warn' : 'default'}
          action={{ label: txa('Listeye git'), run: onFocusAnomalies }}
        />
      </div>
    </div>
  )
}
