import { Activity, FileClock, Flag, ShieldCheck } from 'lucide-react'
import { AdminSurface } from '@/components/admin/shared/AdminSurface'
import { cn } from '@/lib/utils'
import type { OpsTab } from './adminOpsUtils'
import { txa } from '@/i18n/activeLocale'

/**
 * Operations tabs.
 *
 * Labels go through the dictionary; "Status" used to be Turkish and the others English.
 *
 * **Counter badges (design handoff):** say what is there before entering the tab.
 * The open alarm badge is in DANGER tone: the only place carrying "something to look at"
 * without switching tabs.
 * A badge shows only if the number is KNOWN; an empty badge while loading would read as
 * "zero alarms".
 */

interface AdminOpsTabsProps {
  activeTab: OpsTab
  onChange: (tab: OpsTab) => void
  /** Aktif bayrak sayisi; bilinmiyorsa undefined. */
  activeFlagCount?: number
  /** Acik alarm sayisi; bilinmiyorsa undefined. */
  openAlarmCount?: number
}

export function AdminOpsTabs({
  activeTab,
  onChange,
  activeFlagCount,
  openAlarmCount,
}: AdminOpsTabsProps) {
  const tabs: Array<{
    tab: OpsTab
    label: string
    icon: typeof Activity
    count?: number
    danger?: boolean
  }> = [
    { tab: 'status', label: txa('Durum'), icon: Activity },
    { tab: 'feature_flags', label: txa('Bayraklar'), icon: Flag, count: activeFlagCount },
    { tab: 'audit_logs', label: txa('Denetim kaydi'), icon: FileClock },
    {
      tab: 'security',
      label: txa('Güvenlik'),
      icon: ShieldCheck,
      count: openAlarmCount,
      danger: (openAlarmCount ?? 0) > 0,
    },
  ]

  return (
    <AdminSurface className="flex w-fit max-w-full flex-wrap gap-1 p-1.5">
      {tabs.map(({ tab, label, icon: Icon, count, danger }) => {
        const active = activeTab === tab
        return (
          <button
            key={tab}
            type="button"
            onClick={() => onChange(tab)}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
              active
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
            {label}
            {typeof count === 'number' ? (
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 text-[11px] font-bold tabular-nums',
                  active
                    ? 'bg-primary-foreground/25 text-primary-foreground'
                    : danger
                      ? 'bg-destructive/15 text-destructive'
                      : 'bg-muted text-muted-foreground',
                )}
              >
                {count}
              </span>
            ) : null}
          </button>
        )
      })}
    </AdminSurface>
  )
}
