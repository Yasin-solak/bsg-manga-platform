import { AdminOpsStatCard } from './AdminOpsStatCard'
import { intlLocale, txa } from '@/i18n/activeLocale'

/**
 * Audit record counters.
 *
 * This tab had NO statistics: two tables and four dropdowns. An operator could answer
 * "what happened in the last upload" only by eyeballing 120 rows. Counters were added
 * as filters, not for decoration.
 *
 * **Fetched records and total records are not the same.** The box says "shown", not
 * "total"; the audit table is fetched with a limit and "total 120" would suggest
 * the database holds 120 records. (The handoff has a "Total N records" subline;
 * no RPC provides that number, so it was not invented.)
 */

interface AdminOpsAuditStatsProps {
  shownCount: number
  recentCount: number
  actionTypeCount: number
  limit: number
  filterActive: boolean
  recentOnly: boolean
  actionsOpen: boolean
  onClearFilters: () => void
  onToggleRecent: () => void
  onToggleActions: () => void
}

export function AdminOpsAuditStats({
  shownCount,
  recentCount,
  actionTypeCount,
  limit,
  filterActive,
  recentOnly,
  actionsOpen,
  onClearFilters,
  onToggleRecent,
  onToggleActions,
}: AdminOpsAuditStatsProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <AdminOpsStatCard
        label={txa('Gösterilen kayıt')}
        value={shownCount.toLocaleString(intlLocale())}
        hint={txa('En fazla {v1} kayit cekilir', { v1: limit })}
        // "Clear" is not a door when there is no filter; fake clickability
        // erodes trust.
        disabled={!filterActive}
        action={{ label: txa('Filtreleri temizle'), run: onClearFilters }}
      />
      <AdminOpsStatCard
        label={txa('Son 24 saat')}
        value={recentCount.toLocaleString(intlLocale())}
        hint={txa('Çekilen kayıtlar içinde')}
        active={recentOnly}
        action={{
          label: recentOnly ? txa('Filtreyi kaldır') : txa('Yalnizca bunlar'),
          run: onToggleRecent,
        }}
      />
      <AdminOpsStatCard
        label={txa('İşlem türü')}
        value={actionTypeCount.toLocaleString(intlLocale())}
        hint={txa('Çekilen kayıtlarda farklı işlem')}
        active={actionsOpen}
        action={{
          label: actionsOpen ? txa('Listeyi kapat') : txa('Dagilimi ac'),
          run: onToggleActions,
        }}
      />
    </div>
  )
}
