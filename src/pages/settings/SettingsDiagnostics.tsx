import { toUserFacingErrorMessage } from '@/services/userFacingError'
import { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { readDiagnosticConsent, saveDiagnosticConsent, deleteDiagnosticHistory } from '@/services/diagnosticsService'
import { SettingsSwitch } from './SettingsRow'
import { txa } from '@/i18n/activeLocale'

export function SettingsDiagnostics() {
  const { currentUser } = useAuth()
  const [enabled, setEnabled] = useState(false), [busy, setBusy] = useState(true), [notice, setNotice] = useState('')
  const userId = currentUser?.id
  useEffect(() => {
    let active = true
    if (!userId) { setBusy(false); return }
    readDiagnosticConsent().then(value => { if (active) setEnabled(value) }).catch(() => { if (active) setNotice(txa('Tercih yüklenemedi. Sayfayı yeniden açıp deneyebilirsin.')) }).finally(() => { if (active) setBusy(false) })
    return () => { active = false }
  }, [userId])
  async function change(value: boolean) {
    setBusy(true); setNotice('')
    try { await saveDiagnosticConsent(value); setEnabled(value); setNotice(value ? txa('Tanılama iznin kaydedildi. Performans ölçümlerini yeniden başlatmak için sayfayı yenileyebilirsin.') : txa('Otomatik tanılama kapatıldı.')) }
    catch (error) { setNotice(toUserFacingErrorMessage(error, txa('İşlem tamamlanamadı.'))) }
    finally { setBusy(false) }
  }
  async function clear() {
    setBusy(true)
    try { await saveDiagnosticConsent(false); setEnabled(false); await deleteDiagnosticHistory(); setNotice(txa('Otomatik tanılama kapatıldı ve kayıtların silindi. Destek eklerini ilgili talebinden ayrıca kaldırabilirsin.')) }
    catch (error) { setNotice(toUserFacingErrorMessage(error, txa('Silinemedi.'))) }
    finally { setBusy(false) }
  }
  return <div className="settings-dialog-stack">
    <p className="settings-note">{txa('Tanılama açıkken hata kategorisi, sayfa türü, uygulama sürümü, tarayıcı/işletim sistemi, ekran boyutu aralığı, tema, bağlantı ve bildirim desteğini BSG Manga’ya göndeririz. Kayıtlar hesabınla ilişkilidir; anonim değildir. Yalnız site yöneticileri inceleyebilir.')}</p>
    <p className="settings-note">{txa('Mesajların, arama/okuma geçmişin, tam adresler, şifrelerin ve oturum anahtarların toplanmaz. Açılış hızı (LCP/FCP/TTFB), etkileşim gecikmesi (INP) ve sayfa kayması (CLS) %10 örneklemle ölçülür. Görsel veya tıklanan öğenin içeriği alınmaz. Tanılama varsayılan açıktır; önceden kapattıysan tercihin korunur. Ölçümler mevcut sayfa açılışını kapsar. Otomatik kayıtlar günlük temizlikle 14 gün, destek ekleri 30 gün sonunda kaldırılır. Altyapı günlükleri ve yedeklerin saklanması bundan ayrıdır.')}</p>
    <SettingsSwitch title={txa('Otomatik tanılama verilerini paylaş')} description={txa('Varsayılan açıktır. Bu tercih hesabına bağlıdır; kapatınca yeni olaylar kabul edilmez. Destek almak için zorunlu değildir.')} checked={enabled} onChange={value => void change(value)} disabled={busy || !currentUser} />
    {!currentUser && <p className="settings-note">{txa('Tercihini değiştirmek için giriş yapmalısın.')}</p>}
    {currentUser && <button className="settings-action" disabled={busy} onClick={() => void clear()}>{txa('Tanılamayı kapat ve otomatik kayıtlarımı sil')}</button>}
    {notice && <p role="status" className="settings-note">{notice}</p>}
  </div>
}
