import { AdminOpsStatCard, type StatTone } from './AdminOpsStatCard'
import { intlLocale, txa } from '@/i18n/activeLocale'

/**
 * Flag counters: each one a FILTER.
 *
 * **The numbers were dead.** Writing "Active 21" leaves the user to find those 21 in the list,
 * which among 22 flags means eye scanning. Each box narrows the list: the clicked box
 * stays on, clicking again clears it.
 *
 * The box body is `AdminOpsStatCard`: all four tabs of the operations page use the same
 * box.
 */

export type FeatureFlagFilter = 'all' | 'enabled' | 'disabled' | 'public'

interface AdminOpsFeatureFlagStatsProps {
  total: number
  enabled: number
  disabled: number
  publicCount: number
  activeFilter: FeatureFlagFilter
  onFilterChange: (filter: FeatureFlagFilter) => void
}

interface StatEntry {
  filter: FeatureFlagFilter
  label: string
  value: number
  hint: string
  tone: StatTone
}

export function AdminOpsFeatureFlagStats({
  total,
  enabled,
  disabled,
  publicCount,
  activeFilter,
  onFilterChange,
}: AdminOpsFeatureFlagStatsProps) {
  const entries: StatEntry[] = [
    { filter: 'all', label: txa('Toplam flag'), value: total, hint: txa('Tüm kayıtlar'), tone: 'default' },
    { filter: 'enabled', label: txa('Aktif'), value: enabled, hint: txa('Şu an açık'), tone: 'success' },
    { filter: 'disabled', label: txa('Pasif'), value: disabled, hint: txa('Şu an kapalı'), tone: 'default' },
    { filter: 'public', label: txa('Public'), value: publicCount, hint: txa('Istemciye aciliyor'), tone: 'default' },
  ]

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {entries.map((entry) => {
        const active = activeFilter === entry.filter
        return (
          <AdminOpsStatCard
            key={entry.filter}
            label={entry.label}
            value={entry.value.toLocaleString(intlLocale())}
            hint={entry.hint}
            tone={active ? 'default' : entry.tone}
            active={active}
            action={{
              // Clicking an active filter again clears it: the user should not have to look for
              // another box to remove a filter.
              label: txa('Listeyi suz'),
              run: () => onFilterChange(active && entry.filter !== 'all' ? 'all' : entry.filter),
            }}
          />
        )
      })}
    </div>
  )
}
