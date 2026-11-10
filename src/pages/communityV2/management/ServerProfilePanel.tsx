import { useEffect, useState } from 'react'
import { communityRooms, type CommunityProfile } from '@/services/communityPersonalService'
import { communityV2, type CommunityMember } from '@/services/communityV2Service'
import { CommunityLoading } from '../CommunityShared'
import { JoinModeSelect } from '../CommunityRoomForms'
import { communityError } from '../communityHelpers'
import type { ManagerProps } from './types'
import { intlLocale, txa } from '@/i18n/activeLocale'

export function ServerProfilePanel(props: ManagerProps) {
  const [profile, setProfile] = useState<CommunityProfile | null>(null), [error, setError] = useState(''), [revision, setRevision] = useState(0), [status, setStatus] = useState('')
  useEffect(() => { let live = true; void communityRooms.info(props.serverId).then(v => { if (live) { setProfile(v); setError('') } }).catch(e => { if (live) setError(communityError(e)) }); return () => { live = false } }, [props.serverId, revision])
  return <>{status && <p role="status" className="cv2-success">{status}</p>}{error && <p role="alert" className="cv2-error">{error}</p>}{profile ? <ProfileForm key={`${profile.id}:${profile.version}`} {...props} initial={profile} saved={() => setStatus(txa('Sunucu ayarları kaydedildi.'))} reload={() => setRevision(v => v + 1)} /> : <CommunityLoading />}</>
}
function ProfileForm({ initial, reload, saved, serverId, server, refresh }: ManagerProps & { initial: CommunityProfile; reload: () => void; saved: () => void }) {
  const [form, setForm] = useState(initial), [busy, setBusy] = useState(false), [error, setError] = useState(''), [confirm, setConfirm] = useState('')
  const [members, setMembers] = useState<CommunityMember[]>([]), [search, setSearch] = useState(''), [target, setTarget] = useState('')
  const writable = server.permissions.includes('server.profile.manage')
  const stale = initial.version !== server.profile.version
  useEffect(() => {
    if (initial.kind !== 'room' || !server.is_owner) return
    let live = true
    const timer = setTimeout(() => { void communityV2.members(serverId, search).then(v => { if (live) setMembers(v.filter(m => !m.is_owner)) }).catch(e => { if (live) setError(communityError(e)) }) }, 200)
    return () => { live = false; clearTimeout(timer) }
  }, [serverId, search, initial.kind, server.is_owner])
  async function run(action: 'save_profile' | 'save_join_mode' | 'offer_transfer' | 'cancel_transfer' | 'archive') {
    if (busy || stale) return
    setBusy(true); setError('')
    try {
      await communityRooms.write(action, { ...form, server_id: serverId, version: initial.version, avatar_url: form.avatar_url || '', banner_url: form.banner_url || '', user_id: target, archived: !initial.archived_at })
      await refresh(); saved(); setConfirm(''); reload()
    } catch (e) { setError(communityError(e)) } finally { setBusy(false) }
  }
  return <form className="cv2-role-form" onSubmit={e => { e.preventDefault(); void run('save_profile') }}>
    {stale && <p className="cv2-notice">{txa('Ayarlar değişti.')} <button type="button" onClick={reload}>{txa('Güncel ayarları aç')}</button></p>}
    <fieldset disabled={busy || !writable || stale}>
      <label>{txa('Sunucu adı')}<input value={form.name} maxLength={80} required onChange={e => setForm({ ...form, name: e.target.value })} /></label>
      <label>{txa('Açıklama')}<textarea value={form.description} maxLength={500} onChange={e => setForm({ ...form, description: e.target.value })} /></label>
      <label>{txa('Kurallar')}<textarea rows={6} value={form.rules} maxLength={5000} onChange={e => setForm({ ...form, rules: e.target.value })} /></label>
      <label>{txa('Sunucu simgesi (HTTPS görsel adresi)')}<input type="url" value={form.avatar_url || ''} onChange={e => setForm({ ...form, avatar_url: e.target.value })} /></label>
      <label>{txa('Kapak (HTTPS görsel adresi)')}<input type="url" value={form.banner_url || ''} onChange={e => setForm({ ...form, banner_url: e.target.value })} /></label>
      <p className="cv2-hint">{txa('Bu bilgiler sunucuya aittir; fansub profilini değiştirmez. Otomatik takip katılımı yalnız açık sunucularda çalışır.')}</p>
    </fieldset>
    <JoinModeSelect value={form.join_mode} onChange={value => setForm({ ...form, join_mode: value as CommunityProfile['join_mode'] })} disabled={busy || stale || !server.permissions.includes('server.join.manage')} />
    {server.permissions.includes('server.join.manage') && !writable && <button type="button" disabled={busy || stale} onClick={() => void run('save_join_mode')}>{txa('Katılım türünü kaydet')}</button>}
    {writable && <button className="cv2-primary" disabled={busy || stale}>{txa('Profili kaydet')}</button>}
    {initial.kind === 'room' && server.is_owner && <section className="cv2-confirm">
      <h3>{txa('Sahiplik ve arşiv')}</h3><p>{txa('Arşiv mesaj geçmişini korur ve yeni mesajları kapatır. Sahipliği devrettiğinde eski sahip olarak yönetim hakkın kalmaz; atanmış rollerin geçerli olur.')}</p>
      <button type="button" disabled={busy || stale} onClick={() => setConfirm('archive')}>{initial.archived_at ? txa('Odayı yeniden aç') : txa('Odayı arşivle')}</button>
      <label>{txa('Yeni sahip için üye ara')}<input value={search} onChange={e => { setSearch(e.target.value); setTarget('') }} /></label>
      <select aria-label={txa('Yeni sahip')} value={target} onChange={e => setTarget(e.target.value)}><option value="">{txa('Bir üye seç')}</option>{members.map(m => <option key={m.user_id} value={m.user_id}>@{m.username}</option>)}</select>
      <button type="button" disabled={busy || stale || !target} onClick={() => setConfirm('offer_transfer')}>{txa('Sahiplik devri öner')}</button>
      {initial.transfer_to && <p>{txa('Bekleyen devir isteği · {v1} tarihine kadar geçerli.', { v1: new Date(initial.transfer_until!).toLocaleString(intlLocale()) })} <button type="button" disabled={busy || stale} onClick={() => void run('cancel_transfer')}>{txa('İsteği iptal et')}</button></p>}
      {confirm && <div><p>{confirm === 'archive' ? txa('Odanın arşiv durumunu değiştirmek istiyor musun?') : txa('Seçtiğin üyeye 7 gün geçerli sahiplik devri isteği gönderilecek.')}</p><button type="button" disabled={busy || stale} onClick={() => void run(confirm as 'archive' | 'offer_transfer')}>{txa('Onayla')}</button><button type="button" onClick={() => setConfirm('')}>{txa('Vazgeç')}</button></div>}
    </section>}
    {error && <p role="alert" className="cv2-error">{error}</p>}
  </form>
}
