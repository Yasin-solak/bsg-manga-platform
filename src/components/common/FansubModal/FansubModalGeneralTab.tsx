import { AvatarFrame } from '@components/common/AvatarFrame'
import type { GeneralTabProps } from './FansubModalTabPanels.types'
import { txa } from '@/i18n/activeLocale'

export function FansubModalGeneralTab({
  isEdit,
  loading,
  uploading,
  name,
  description,
  avatar,
  previewFrame,
  presetAvatars,
  onSubmit,
  onNameChange,
  onAvatarFileChange,
  onPickAvatar,
  onDescriptionChange,
  onClose,
}: GeneralTabProps) {
  return (
    <form onSubmit={onSubmit} className="spm-form">
      <div className="spm-row">
        <div className="spm-field">
          <label>
            {txa('Fansub Adı')} <span className="spm-required">*</span>
          </label>
          <input
            className="spm-input"
            value={name}
            onChange={(event) => onNameChange(event.target.value)}
            placeholder={txa('Örn. Gecekuşu Çeviri')}
            required
            disabled={loading || isEdit}
          />
          {isEdit && (
            <div style={{ fontSize: '0.8rem', color: '#666', marginTop: '4px' }}>
              {txa('* Fansub adi degistirilemez.')}
            </div>
          )}
        </div>
      </div>

      <div className="spm-row">
        <div className="spm-field">
          <label>{txa('Avatar')}</label>
          <div style={{ marginBottom: '8px' }}>
            <input
              type="file"
              accept="image/png, image/jpeg, image/gif, image/webp"
              onChange={onAvatarFileChange}
              disabled={uploading}
              style={{ fontSize: '0.9rem' }}
            />
            {uploading && (
              <span style={{ marginLeft: '8px', fontSize: '0.9rem' }}>
                {txa('Yukleniyor...')}
              </span>
            )}
          </div>
          <div className="spm-presets">
            {presetAvatars.map((url) => (
              <button
                key={url}
                type="button"
                onClick={() => onPickAvatar(url)}
                className="spm-preset-btn"
                style={{ backgroundImage: `url(${url})` }}
                title={txa('Bu avatari kullan')}
              />
            ))}
          </div>
        </div>
        {avatar && (
          <div
            style={{
              marginLeft: '16px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
            }}
          >
            <AvatarFrame
              src={avatar}
              alt="Preview"
              frameType={previewFrame}
              size={80}
              animated
            />
            <span style={{ fontSize: '10px', marginTop: '4px', color: '#888' }}>
              {txa('Onizleme')}
            </span>
          </div>
        )}
      </div>

      <div className="spm-row">
        <div className="spm-field">
          <label>{txa('Açıklama')}</label>
          <textarea
            className="spm-input spm-textarea"
            value={description}
            onChange={(event) => onDescriptionChange(event.target.value)}
            placeholder={txa('Fansub hakkında kısa bilgi...')}
            rows={3}
          />
        </div>
      </div>

      <div className="spm-actions">
        <button type="button" className="spm-btn spm-btn-cancel" onClick={onClose}>
          {txa('İptal')}
        </button>
        <button type="submit" className="spm-btn spm-btn-save" disabled={loading}>
          {loading ? txa('Kaydediliyor...') : txa('Kaydet')}
        </button>
      </div>
    </form>
  )
}
