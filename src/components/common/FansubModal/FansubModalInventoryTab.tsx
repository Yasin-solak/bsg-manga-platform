import { AvatarFrame, type FrameType } from '@components/common/AvatarFrame'
import type {
  ActiveItemsState,
  InventoryRow,
  InventoryTabProps,
} from './FansubModalTabPanels.types'
import { txa } from '@/i18n/activeLocale'

export function FansubModalInventoryTab({
  coinBalance,
  redeemCodeInput,
  inventory,
  activeItems,
  giftModalOpen,
  storeItems,
  avatar,
  onRedeemCodeInputChange,
  onRedeemCode,
  onOpenGiftModal,
  onCloseGiftModal,
  onGiftItem,
  onGoStore,
  onEquipItem,
  onRemoveInventoryItem,
  getPatternPreview,
  getBackgroundPreview,
}: InventoryTabProps) {
  return (
    <div className="inventory-tab">
      <div
        className="economy-header"
        style={{
          padding: '16px',
          borderRadius: '12px',
          marginBottom: '16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div>
          <h3 style={{ margin: 0, color: '#FFD600' }}>
            {coinBalance.toLocaleString()}{' '}{txa('Coin')}
          </h3>
          <span style={{ fontSize: '12px', color: '#888' }}>{txa('Mevcut Bakiye')}</span>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            className="spm-input"
            style={{ width: '150px' }}
            placeholder={txa('Kod Gir (örn: STAR-500)')}
            value={redeemCodeInput}
            onChange={(event) => onRedeemCodeInputChange(event.target.value)}
          />
          <button type="button" className="admin-btn" onClick={() => void onRedeemCode()}>
            {txa('Kullan')}
          </button>
        </div>
      </div>

      <h4 style={{ marginBottom: '8px', borderBottom: '1px solid #333', paddingBottom: '4px' }}>
        {txa('Envanterim (Kusan)')}
      </h4>
      <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'flex-end' }}>
        <button type="button" className="admin-btn admin-btn-approve" onClick={onOpenGiftModal}>
          {txa('(Admin) Hediye Et')}
        </button>
      </div>

      <div className="admin-store-grid">
        {inventory.length === 0 ? (
          <div
            style={{
              gridColumn: '1/-1',
              textAlign: 'center',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '10px',
            }}
          >
            <p style={{ color: '#666' }}>{txa('Envanterinizde henüz bir ürün yok.')}</p>
            <button
              className="admin-btn"
              onClick={onGoStore}
              style={{ background: '#333', color: '#fff', border: '1px solid #444' }}
            >
              {txa('Magaza\'ya Git')}
            </button>
          </div>
        ) : (
          inventory.map((item) => {
            const isActive =
              activeItems[item.type as keyof ActiveItemsState] === item.storeItemId
            const storeItemDef = storeItems.find((storeItem) => storeItem.id === item.storeItemId)
            const frameType =
              (storeItemDef?.frameType as FrameType | undefined) ||
              (item.image as FrameType | undefined) ||
              'default'
            const bgStyle = storeItemDef?.image || item.image || ''

            return (
              <div
                key={item.id}
                className={`admin-store-card ${isActive ? 'active-item' : ''}`}
                style={
                  isActive
                    ? { borderColor: '#FFD600', boxShadow: '0 0 10px rgba(255, 214, 0, 0.2)' }
                    : {}
                }
              >
                <div
                  className="admin-store-card-image"
                  style={{
                    height: '100px',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    overflow: 'hidden',
                    background: '#111',
                    borderRadius: '4px',
                  }}
                >
                  {renderInventoryPreview({
                    item,
                    avatar,
                    frameType,
                    bgStyle,
                    getPatternPreview,
                    getBackgroundPreview,
                  })}
                </div>
                <div className="admin-store-card-content">
                  <span style={{ fontSize: '12px', color: '#666' }}>{item.type}</span>
                  <h4 style={{ fontSize: '14px', margin: '4px 0' }}>{item.name}</h4>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button
                      className={`action-btn edit ${isActive ? 'disabled' : ''}`}
                      onClick={() =>
                        !isActive &&
                        void onEquipItem({
                          ...item,
                          image: frameType,
                        })
                      }
                      style={{
                        flex: 1,
                        opacity: isActive ? 0.7 : 1,
                        cursor: isActive ? 'default' : 'pointer',
                      }}
                      title={isActive ? txa('Şu an aktif') : txa('Kuşan')}
                    >
                      {isActive ? txa('Aktif') : txa('Kuşan')}
                    </button>
                    <button
                      className="action-btn delete"
                      onClick={() => void onRemoveInventoryItem(item.storeItemId)}
                      style={{ flex: 0.3 }}
                      title={txa('Sil')}
                    >
                      X
                    </button>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      {giftModalOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.8)',
            zIndex: 9999,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <div
            style={{
              background: '#1a1a1a',
              padding: '24px',
              borderRadius: '12px',
              width: '90%',
              maxWidth: '600px',
              maxHeight: '80vh',
              overflowY: 'auto',
              border: '1px solid #333',
            }}
          >
            <h3 style={{ color: '#fff', marginBottom: '16px' }}>
              {txa('Magazadan Esya Secin (Hediye)')}
            </h3>
            <div
              className="admin-store-grid"
              style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))' }}
            >
              {storeItems.map((product) => (
                <div
                  key={product.id}
                  className="admin-store-card"
                  onClick={() => void onGiftItem(product.id)}
                  style={{ cursor: 'pointer', border: '1px solid #333' }}
                >
                  <div style={{ padding: '8px', textAlign: 'center' }}>
                    <span style={{ fontSize: '24px' }}>{product.icon || txa('Gift')}</span>
                    <p style={{ fontSize: '12px', color: '#fff', marginTop: '4px' }}>
                      {product.name}
                    </p>
                    <p style={{ fontSize: '10px', color: '#888' }}>{product.type}</p>
                  </div>
                </div>
              ))}
            </div>
            <button
              className="spm-btn spm-btn-cancel"
              style={{ marginTop: '16px', width: '100%' }}
              onClick={onCloseGiftModal}
            >
              {txa('Vazgeç')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

interface InventoryPreviewProps {
  item: InventoryRow
  avatar: string
  frameType: FrameType
  bgStyle: string
  getPatternPreview: (name?: string) => string
  getBackgroundPreview: (name?: string) => string
}

function renderInventoryPreview({
  item,
  avatar,
  frameType,
  bgStyle,
  getPatternPreview,
  getBackgroundPreview,
}: InventoryPreviewProps) {
  if (item.type === 'frame') {
    return (
      <div style={{ transform: 'scale(1.2)' }}>
        <AvatarFrame
          src={avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=fansub'}
          alt="Frame Preview"
          frameType={frameType}
          size={60}
          animated
        />
      </div>
    )
  }

  if (item.type === 'pattern') {
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: bgStyle.startsWith('http')
            ? `url(${bgStyle})`
            : getPatternPreview(bgStyle),
        }}
      />
    )
  }

  if (item.type === 'background') {
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: bgStyle.startsWith('http')
            ? `url(${bgStyle})`
            : getBackgroundPreview(bgStyle),
        }}
      />
    )
  }

  return <span style={{ fontSize: '32px' }}>Item</span>
}
