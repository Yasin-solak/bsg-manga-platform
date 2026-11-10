import { useEffect, useState } from 'react'
import { communityRooms, type CommunityProfile } from '@/services/communityPersonalService'
import { CommunityLoading } from './CommunityShared'
import { communityError } from './communityHelpers'
import { txa } from '@/i18n/activeLocale'

export function JoinModeSelect({ value, onChange, disabled = false, required = false }: { value: string; onChange: (value: string) => void; disabled?: boolean; required?: boolean }) {
  return <label>{txa('Katılım türü')}<select value={value} onChange={e => onChange(e.target.value)} disabled={disabled} required={required}>
    <option value="" disabled>{txa('Katılım türünü seç')}</option><option value="open">{txa('Açık · Keşfet üzerinden katılım')}</option>
    <option value="invite">{txa('Davetli · Yalnız davet bağlantısıyla')}</option><option value="request">{txa('Başvurulu · Yönetici onayıyla')}</option>
  </select><small>{txa('Geçerli davet bağlantısı davet edilmiş üyeye doğrudan katılım verir. Başvurulu sunucuda keşfetten gelen kişiler onay bekler.')}</small></label>
}
export function CreateRoomForm({ created }: { created: (id: string) => Promise<void> }) {
  const [clientId] = useState(() => crypto.randomUUID())
  const [name, setName] = useState(''), [mode, setMode] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('')
  async function save() {
    if (busy) return
    setBusy(true); setError('')
    try { const result = await communityRooms.write('create', { name, join_mode: mode, client_id: clientId }); if (result.id) await created(result.id) }
    catch (e) { setError(communityError(e)) } finally { setBusy(false) }
  }
  return <form className="cv2-role-form" onSubmit={e => { e.preventDefault(); void save() }}>
    <label>{txa('Oda adı')}<input value={name} maxLength={80} required disabled={busy} onChange={e => setName(e.target.value)} /></label>
    <JoinModeSelect value={mode} onChange={setMode} disabled={busy} required />
    <p className="cv2-hint">{txa('Kanallarını, rollerini ve izinlerini sunucu yönetiminden düzenleyebilirsin.')}</p>
    {error && <p role="alert" className="cv2-error">{error}</p>}<button className="cv2-primary" disabled={busy || !mode || !name.trim()}>{busy ? txa('Oluşturuluyor…') : txa('Odayı oluştur')}</button>
  </form>
}
export function RoomTransfers({ accepted }: { accepted: () => Promise<void> }) {
  const [rows, setRows] = useState<CommunityProfile[] | null>(null), [busy, setBusy] = useState(''), [error, setError] = useState('')
  useEffect(() => { let live = true; void communityRooms.transfers().then(v => { if (live) setRows(v) }).catch(e => { if (live) setError(communityError(e)) }); return () => { live = false } }, [])
  async function accept(id: string) {
    setBusy(id); setError('')
    try { await communityRooms.write('accept_transfer', { server_id: id }); setRows(previous => previous?.filter(r => r.id !== id) || []); await accepted() }
    catch (e) { setError(communityError(e)) } finally { setBusy('') }
  }
  return <section><h3>{txa('Oda sahipliği davetleri')}</h3>{error && <p role="alert" className="cv2-error">{error}</p>}{rows === null && !error ? <CommunityLoading /> : rows?.length ? rows.map(row => <div key={row.id} className="cv2-discover-row"><span><strong>{row.name}</strong><p>{txa('Kabul ettiğinde sunucunun tek sahibi sen olursun.')}</p></span><button disabled={!!busy} onClick={() => void accept(row.id)}>{txa('Sahipliği kabul et')}</button></div>) : <p className="cv2-hint">{txa('Bekleyen sahiplik davetin yok.')}</p>}</section>
}
