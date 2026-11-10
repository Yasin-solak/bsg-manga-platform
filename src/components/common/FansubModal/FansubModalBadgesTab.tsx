import type { BadgesTabProps } from './FansubModalTabPanels.types'
import { txa } from '@/i18n/activeLocale'

export function FansubModalBadgesTab({
  isEdit,
  ownedBadges,
  selectedBadgeIds,
  onToggleBadge,
  onSaveBadges,
}: BadgesTabProps) {
  if (!isEdit) return null

  return (
    <div className="spm-badges-panel">
      <p style={{ color: '#888', marginBottom: '16px' }}>
        {txa('Fansub sayfasinda gosterilecek rozetleri secin (en fazla 3 adet).')}
      </p>
      {ownedBadges.length === 0 ? (
        <p style={{ color: '#888', textAlign: 'center', padding: '40px 0' }}>
          {txa('Henüz rozet satın alınmamış. Mağazadan rozet satın alabilirsiniz.')}
        </p>
      ) : (
        <>
          <div
            className="admin-store-grid"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))' }}
          >
            {ownedBadges.map((ownedBadge) => {
              const isSelected = selectedBadgeIds.includes(ownedBadge.badge_id)
              const selectOrder = selectedBadgeIds.indexOf(ownedBadge.badge_id) + 1
              return (
                <div
                  key={ownedBadge.id}
                  className="admin-store-card"
                  onClick={() => onToggleBadge(ownedBadge.badge_id)}
                  style={{
                    cursor: 'pointer',
                    border: isSelected ? '2px solid #FFD600' : '1px solid #333',
                    background: isSelected ? 'rgba(255, 214, 0, 0.1)' : undefined,
                    position: 'relative',
                  }}
                >
                  <div style={{ padding: '12px', textAlign: 'center' }}>
                    <img loading="lazy" decoding="async"
                      src={ownedBadge.badge?.image_url || '/badges/default.png'}
                      alt={ownedBadge.badge?.name || txa('Rozet')}
                      style={{ width: '48px', height: '48px', objectFit: 'contain' }}
                    />
                    <p style={{ fontSize: '12px', color: '#fff', marginTop: '8px' }}>
                      {ownedBadge.badge?.name || txa('Rozet')}
                    </p>
                  </div>
                  {isSelected && (
                    <div
                      style={{
                        position: 'absolute',
                        top: '8px',
                        right: '8px',
                        background: '#FFD600',
                        color: '#000',
                        width: '20px',
                        height: '20px',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 'bold',
                        fontSize: '12px',
                      }}
                    >
                      {selectOrder}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <button
            type="button"
            className="spm-btn spm-btn-save"
            style={{ marginTop: '20px' }}
            onClick={() => void onSaveBadges()}
          >
            {txa('Rozetleri Kaydet')}
          </button>
        </>
      )}
    </div>
  )
}
