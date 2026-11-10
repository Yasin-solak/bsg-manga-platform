import { useEffect, useRef, useState } from 'react'
import { toUserFacingErrorMessage } from '@/services/userFacingError'
import { prepareSupportScreenshot, uploadSupportScreenshot, downloadSupportScreenshot, deleteSupportScreenshot, type PreparedScreenshot } from '@/services/supportScreenshotService'
import { txa } from '@/i18n/activeLocale'

export function SupportScreenshotPicker({ value, onChange, disabled, onPreparing }: { value: PreparedScreenshot | null; onChange: (value: PreparedScreenshot | null) => void; disabled: boolean; onPreparing?: (value: boolean) => void }) {
  const [error, setError] = useState(''), [preparing, setPreparing] = useState(false)
  const generation = useRef(0)
  useEffect(() => () => { generation.current++ }, [])
  useEffect(() => () => { if (value) URL.revokeObjectURL(value.preview) }, [value])
  async function select(file?: File) {
    if (!file) return
    const attempt = ++generation.current
    setPreparing(true); onPreparing?.(true); setError('')
    try {
      const next = await prepareSupportScreenshot(file)
      if (attempt !== generation.current) { URL.revokeObjectURL(next.preview); return }
      onChange(next)
    } catch (reason) { if (attempt === generation.current) setError(toUserFacingErrorMessage(reason, txa('Görsel hazırlanamadı.'))) }
    finally { if (attempt === generation.current) { setPreparing(false); onPreparing?.(false) } }
  }
  return <div className="settings-dialog-stack">
    <label>{txa('Ekran görüntüsü (isteğe bağlı)')}<input type="file" accept="image/png,image/jpeg,image/webp" disabled={disabled || preparing} onChange={e => { void select(e.target.files?.[0]); e.target.value = '' }} /></label>
    <p className="settings-note">{txa('Yalnız seçtiğin dosya, gönderdiğinde destek ekibine iletilir. Görseldeki kişisel bilgileri önce kapat. PNG/JPEG/WebP, en fazla 8 MB; hazırlanan görsel en fazla 1600 piksel ve 1 MB olur. Özel depoda 30 gün tutulur; talebinden daha erken silebilirsin.')}</p>
    {preparing && <p role="status">{txa('Görsel hazırlanıyor…')}</p>}
    {value && <><img className="settings-screenshot-preview" src={value.preview} alt={txa('Gönderilecek ekran görüntüsü')} /><button type="button" className="settings-action" disabled={disabled} onClick={() => onChange(null)}>{txa('Görseli kaldır')}</button></>}
    {error && <p role="alert" className="settings-error">{error}</p>}
  </div>
}

export function SupportScreenshotTicket({ requestId, ownerId, attached, canEdit, onChange }: { requestId: string; ownerId: string; attached: boolean; canEdit: boolean; onChange: () => void }) {
  const [image, setImage] = useState<PreparedScreenshot | null>(null), [url, setUrl] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [preparing, setPreparing] = useState(false)
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => () => { if (url) URL.revokeObjectURL(url) }, [url])
  async function run(action: 'view' | 'upload' | 'delete') {
    setBusy(true); setError('')
    try {
      if (action === 'view') {
        const next = await downloadSupportScreenshot(requestId, ownerId)
        if (alive.current) setUrl(next); else URL.revokeObjectURL(next)
      } else {
        if (action === 'upload' && image) await uploadSupportScreenshot(requestId, image)
        if (action === 'delete') await deleteSupportScreenshot(requestId)
        if (alive.current) { setImage(null); setUrl(''); onChange() }
      }
    } catch (reason) { if (alive.current) setError(toUserFacingErrorMessage(reason, txa('Görsel işlemi tamamlanamadı.'))) }
    finally { if (alive.current) setBusy(false) }
  }
  return <div className="settings-dialog-stack">
    {attached ? <><button className="settings-action" disabled={busy} onClick={() => void run('view')}>{txa('Ekran görüntüsünü aç')}</button>{url && <img className="settings-screenshot-preview" src={url} alt={txa('Destek talebine eklenen ekran görüntüsü')} />}{canEdit && <button className="settings-action" disabled={busy} onClick={() => void run('delete')}>{txa('Ekran görüntüsünü sil')}</button>}</> : canEdit && <details><summary>{txa('Ekran görüntüsü ekle')}</summary><SupportScreenshotPicker value={image} onChange={setImage} disabled={busy} onPreparing={setPreparing} /><button className="settings-save" disabled={busy || preparing || !image} onClick={() => void run('upload')}>{txa('Görseli yükle')}</button></details>}
    {error && <p role="alert" className="settings-error">{error}</p>}
  </div>
}
