import { useEffect, useState } from 'react'
import { useCommunityAvailability } from '@/contexts/CommunityAvailabilityContext'
import { communityPersonal, type CommunityPreferences } from '@/services/communityPersonalService'
import { CommunityLoading } from './CommunityShared'
import { RoomTransfers } from './CommunityRoomForms'
import { communityError } from './communityHelpers'
import { txa } from '@/i18n/activeLocale'

export function CommunityPreference({ refresh = async () => {} }: { refresh?: () => Promise<void> }) {
  const { enabled } = useCommunityAvailability()
  return enabled ? <EnabledCommunityPreference refresh={refresh} /> : null
}

function EnabledCommunityPreference({ refresh }: { refresh: () => Promise<void> }) {
  const [value, setValue] = useState<CommunityPreferences | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [saved, setSaved] = useState(false), [revision, setRevision] = useState(0)
  useEffect(() => { let live = true; void communityPersonal.preferences().then(v => { if (live) { setValue(v); setError('') } }).catch(e => { if (live) setError(communityError(e)) }); return () => { live = false } }, [revision])
  async function save() {
    if (!value || busy) return
    setBusy(true); setError(''); setSaved(false)
    try { setValue(await communityPersonal.savePreferences(value)); setSaved(true) }
    catch (e) { setError(communityError(e)) } finally { setBusy(false) }
  }
  return <div className="cv2-role-form">{error && <p role="alert" className="cv2-error">{error} <button onClick={() => setRevision(v => v + 1)}>{txa('Yeniden dene')}</button></p>}{!value ? !error && <CommunityLoading /> : <form className="cv2-role-form" onSubmit={e => { e.preventDefault(); void save() }}>
    <label className="cv2-check"><input type="checkbox" checked={value.auto_join} disabled={busy} onChange={e => setValue({ ...value, auto_join: e.target.checked })} />{txa('Takip ettiğim fansubların açık sunucularına otomatik katıl')}</label>
    <p className="cv2-hint">{txa('Ayrıldığın veya yasaklandığın sunuculara geri eklenmezsin. Davetli ve başvurulu sunucular kendi katılım kurallarını korur.')}</p>
    <label>{txa('Topluluk bildirimleri')}<select value={value.notifications} disabled={busy} onChange={e => setValue({ ...value, notifications: e.target.value as CommunityPreferences['notifications'] })}><option value="all">{txa('Tüm mesajlar')}</option><option value="mentions">{txa('Yalnız etiketler ve yanıtlar')}</option><option value="off">{txa('Kapalı')}</option></select></label>
    <label className="cv2-check"><input type="checkbox" checked={value.push_enabled} disabled={busy} onChange={e => setValue({ ...value, push_enabled: e.target.checked })} />{txa('Topluluk için cihaz bildirimi de gönder')}</label>
    <p className="cv2-hint">{txa('Cihaz bildirimi için Ayarlar → Bildirimler bölümünden cihaz iznini de açmalısın. Aynı kanaldan en fazla dakikada bir bildirim gelir. Sunucu ve kanal tercihleri genel seçimin üzerine uygulanır; süreli sunucu sessizliği bütün kanalları susturur.')}</p>
    <label className="cv2-check"><input type="checkbox" checked={value.show_presence} disabled={busy} onChange={e => setValue({ ...value, show_presence: e.target.checked })} />{txa('Açık olduğum sohbette çevrimiçi olduğumu göster')}</label>
    <label className="cv2-check"><input type="checkbox" checked={value.show_typing} disabled={busy || !value.show_presence} onChange={e => setValue({ ...value, show_typing: e.target.checked })} />{txa('Yazıyor bilgimi göster')}</label>
    <p className="cv2-hint">{txa('Çevrimiçi bilgisi yaklaşık 90 saniye, yazıyor bilgisi 8 saniye içinde sona erer. Engellenen hesaplarla bu bilgiler paylaşılmaz.')}</p>
    <button className="cv2-primary" disabled={busy}>{busy ? txa('Kaydediliyor…') : txa('Tercihleri kaydet')}</button>{saved && <p role="status" className="cv2-success">{txa('Tercihlerin kaydedildi.')}</p>}
  </form>}<RoomTransfers accepted={refresh} /></div>
}
