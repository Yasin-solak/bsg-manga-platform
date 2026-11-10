import type { FansubModalTabsHeaderProps } from './FansubModalTabPanels.types'
import { txa } from '@/i18n/activeLocale'

export function FansubModalTabsHeader({
  activeTab,
  isEdit,
  membersCount,
  chaptersCount,
  inventoryCount,
  badgesCount,
  onTabChange,
}: FansubModalTabsHeaderProps) {
  return (
    <div className="fansub-modal-tabs">
      <button
        type="button"
        className={`tab-btn ${activeTab === 'general' ? 'active' : ''}`}
        onClick={() => onTabChange('general')}
      >
        {txa('Genel')}
      </button>
      {isEdit && (
        <>
          <button
            type="button"
            className={`tab-btn ${activeTab === 'members' ? 'active' : ''}`}
            onClick={() => onTabChange('members')}
          >
            {txa('Uyeler (')}{membersCount})
          </button>
          <button
            type="button"
            className={`tab-btn ${activeTab === 'mangas' ? 'active' : ''}`}
            onClick={() => onTabChange('mangas')}
          >
            {txa('Bolumler (')}{chaptersCount})
          </button>
          <button
            type="button"
            className={`tab-btn ${activeTab === 'inventory' ? 'active' : ''}`}
            onClick={() => onTabChange('inventory')}
          >
            {txa('Envanter (')}{inventoryCount})
          </button>
          <button
            type="button"
            className={`tab-btn ${activeTab === 'badges' ? 'active' : ''}`}
            onClick={() => onTabChange('badges')}
          >
            {txa('Rozetler (')}{badgesCount})
          </button>
        </>
      )}
    </div>
  )
}
