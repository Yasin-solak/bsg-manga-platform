import { Award, ListChecks, Trophy } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { BadgePickerCard } from '@/components/common/cosmeticPickerCards'
import { OPEN_QUICK_PANEL_EVENT, type OpenQuickPanelEventDetail } from '@/components/layout/appSidebar/appSidebarUtils'
import type { ProfileOwnedBadge } from './types'
import { txa } from '@/i18n/activeLocale'

const PROFILE_BADGE_DISPLAY_LIMIT = 3

type ProfileEditBadgesSectionProps = {
  disabled?: boolean
  onClose: () => void
  onSelectedBadgeIdsChange: (badgeIds: string[]) => void
  ownedBadges: ProfileOwnedBadge[]
  selectedBadgeIds: string[]
}

function normalizeSelectedBadgeIds(selectedBadgeIds: string[]) {
  const seen = new Set<string>()
  const output: string[] = []

  for (const badgeId of selectedBadgeIds) {
    const normalized = badgeId.trim()
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    output.push(normalized)
    if (output.length >= PROFILE_BADGE_DISPLAY_LIMIT) break
  }

  return output
}

function requestOpenTasksPanel() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent<OpenQuickPanelEventDetail>(OPEN_QUICK_PANEL_EVENT, {
    detail: { panel: 'tasks' },
  }))
}

function EmptyBadgeState({ onOpenTasks }: { onOpenTasks: () => void }) {
  return (
    <div className="flex h-full min-h-[260px] flex-col items-center justify-center rounded-[14px] border border-dashed border-border/60 bg-background/35 px-5 text-center">
      <span className="flex size-12 items-center justify-center rounded-[16px] border border-primary/25 bg-primary/10 text-primary">
        <Award className="size-6" />
      </span>
      <h5 className="mt-3 text-sm font-black text-foreground">{txa('Henüz rozetin yok')}</h5>
      <p className="mt-1 max-w-sm text-sm leading-6 text-muted-foreground">
        {txa('Görevleri tamamladıkça kazandığın rozetleri burada vitrine alabilirsin.')}
      </p>
      <Button
        type="button"
        onClick={onOpenTasks}
        className="mt-4 rounded-full bg-primary px-5 font-black text-primary-foreground hover:bg-primary/90"
      >
        <Trophy className="mr-2 size-4" />
        {txa('Görevlere Git')}
      </Button>
    </div>
  )
}

export default function ProfileEditBadgesSection({
  disabled,
  onClose,
  onSelectedBadgeIdsChange,
  ownedBadges,
  selectedBadgeIds,
}: ProfileEditBadgesSectionProps) {
  const normalizedSelectedBadgeIds = normalizeSelectedBadgeIds(selectedBadgeIds)
  const limitReached = normalizedSelectedBadgeIds.length >= PROFILE_BADGE_DISPLAY_LIMIT

  const handleOpenTasks = () => {
    onClose()
    window.setTimeout(requestOpenTasksPanel, 0)
  }

  const toggleBadge = (badgeId: string) => {
    const isSelected = normalizedSelectedBadgeIds.includes(badgeId)
    if (isSelected) {
      onSelectedBadgeIdsChange(normalizedSelectedBadgeIds.filter((selectedId) => selectedId !== badgeId))
      return
    }
    if (limitReached) return
    onSelectedBadgeIdsChange([...normalizedSelectedBadgeIds, badgeId])
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="m-0 text-xs text-muted-foreground">
          {txa('Profil vitrinin icin en fazla 3 rozeti sirasiyla sec; sagdaki onizleme aninda guncellenir.')}
        </p>
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-muted-foreground">{ownedBadges.length}{' '}{txa('rozet')}</span>
          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-black text-primary">
            {txa('{v1}/{v2} secili', { v1: normalizedSelectedBadgeIds.length, v2: PROFILE_BADGE_DISPLAY_LIMIT })}
          </span>
        </div>
      </div>

      {ownedBadges.length > 0 ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3">
          {ownedBadges.map((badge, index) => {
            const selectOrder = normalizedSelectedBadgeIds.indexOf(badge.badge_id) + 1
            const selected = selectOrder > 0
            return (
              <BadgePickerCard
                key={`${badge.id}-${badge.badge_id}-${index}`}
                imageUrl={badge.badge?.image_url || '/badges/default.png'}
                name={badge.badge?.name || txa('Rozet')}
                disabled={disabled}
                limitReached={limitReached}
                onToggle={() => toggleBadge(badge.badge_id)}
                selected={selected}
                selectOrder={selectOrder}
              />
            )
          })}
        </div>
      ) : (
        <EmptyBadgeState onOpenTasks={handleOpenTasks} />
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/40 pt-3">
        <div className="flex min-w-0 items-center gap-2">
          <ListChecks className="size-4 shrink-0 text-muted-foreground" />
          <p className="m-0 text-xs text-muted-foreground">
            {txa('Okuma, yorum ve topluluk görevlerini tamamladıkça rozet havuzun genişler.')}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleOpenTasks}
          className="rounded-full text-primary hover:bg-primary/10"
        >
          <Trophy className="mr-1.5 size-3.5" />
          {txa('Görevlere git')}
        </Button>
      </div>
    </section>
  )
}
