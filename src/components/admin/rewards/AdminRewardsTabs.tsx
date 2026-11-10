import { CalendarHeart, Flame, ListChecks, Trophy, Users, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AdminRewardsTab } from './adminRewardsUtils'
import { txa } from '@/i18n/activeLocale'

interface AdminRewardsTabsProps {
  activeTab: AdminRewardsTab
  onChange: (tab: AdminRewardsTab) => void
}

const REWARD_TABS: Array<{ id: AdminRewardsTab, label: string, icon: LucideIcon }> = [
  { id: 'fansub', get label() { return txa('Fansub ödülleri') }, icon: Trophy },
  { id: 'reading_streak', get label() { return txa('Okuma serisi') }, icon: Flame },
  { id: 'user_tasks', get label() { return txa('Kullanıcı görevleri') }, icon: ListChecks },
  { id: 'fansub_tasks', get label() { return txa('Fansub görevleri') }, icon: Users },
  { id: 'events', get label() { return txa('Etkinlikler') }, icon: CalendarHeart },
]

export function AdminRewardsTabs({ activeTab, onChange }: AdminRewardsTabsProps) {
  return (
    <nav aria-label={txa('Ödül modülleri')}>
      <div className="flex w-fit max-w-full flex-wrap gap-0.5 rounded-xl bg-muted/60 p-1" role="tablist">
        {REWARD_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => onChange(tab.id)}
            data-testid={`rewards-tab-${tab.id}`}
            className={cn(
              'inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors',
              activeTab === tab.id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <tab.icon className="size-3.5" />{tab.label}
          </button>
        ))}
      </div>
    </nav>
  )
}
