import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import { communityRooms } from '@/services/communityPersonalService'
import { communityV2, type CommunityMember } from '@/services/communityV2Service'
import { CommunityIdentity, CommunityLoading } from '../CommunityShared'
import { communityError } from '../communityHelpers'
import type { ManagerProps } from './types'
import { intlLocale, txa } from '@/i18n/activeLocale'

export function MembersPanel(props: ManagerProps) {
  const [members, setMembers] = useState<CommunityMember[]>([]), [search, setSearch] = useState(''), [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [selected, setSelected] = useState('')
  const [revision, setRevision] = useState(0), [status, setStatus] = useState('')
  useEffect(() => {
    let live = true
    const timer = setTimeout(() => {
      void communityV2.members(props.serverId, search, page * 50, true)
        .then(rows => { if (live) { setMembers(rows); setError('') } })
        .catch(e => { if (live) setError(communityError(e)) })
        .finally(() => { if (live) setLoading(false) })
    }, 180)
    return () => { live = false; clearTimeout(timer) }
  }, [props.serverId, props.server, search, page, revision])
  const member = members.find(m => m.user_id === selected)
  async function done() { setSelected(''); setStatus(txa('Üye işlemi kaydedildi.')); setRevision(v => v + 1); await props.refresh() }
  return <div className="cv2-member-manager">
    {!selected && <label className="cv2-search"><Search size={16} /><input aria-label={txa('Üye ara')} value={search} placeholder={txa('Üyelerde ara')} onChange={e => { setSearch(e.target.value); setPage(0); setLoading(true) }} /></label>}
    {error && <p role="alert" className="cv2-error">{error}</p>}{status && <p className="cv2-success" role="status">{status}</p>}
    {member ? <MemberForm key={member.user_id} {...props} member={member} done={done} back={() => setSelected('')} /> : selected ? <><p className="cv2-hint">{txa('Üyenin durumu değişti.')}</p><button onClick={() => setSelected('')}>{txa('Üyelere dön')}</button></> : loading ? <CommunityLoading /> : <>
      {members.slice(0, 50).map(row => <div className="cv2-managed-member" key={row.user_id}>
        <CommunityIdentity user={row} /><small>{row.is_owner ? txa('Sunucu sahibi') : row.state === 'banned' ? txa('Yasaklı') : row.state === 'left' ? txa('Ayrılmış') : row.manageable ? txa('Alt seviye') : txa('Korunan üye')}</small>
        <button onClick={() => { setSelected(row.user_id); setStatus('') }}>{txa('İncele')}</button>
      </div>)}
      {!members.length && <p className="cv2-hint">{txa('Üye bulunamadı.')}</p>}
      <div className="cv2-pagination"><button disabled={!page} onClick={() => { setPage(p => p - 1); setLoading(true) }}>{txa('Önceki')}</button><span>{txa('Sayfa {v1}', { v1: page + 1 })}</span><button disabled={members.length <= 50} onClick={() => { setPage(p => p + 1); setLoading(true) }}>{txa('Sonraki')}</button></div>
    </>}
  </div>
}

function MemberForm({ serverId, server, member, done, back }: ManagerProps & { member: CommunityMember; done: () => Promise<void>; back: () => void }) {
  const [nickname, setNickname] = useState(member.nickname || '')
  const [roles, setRoles] = useState(member.role_ids), [original, setOriginal] = useState(member.role_ids)
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [operation, setOperation] = useState(''), [minutes, setMinutes] = useState(60)
  const canAssign = server.permissions.includes('roles.assign') && (server.is_owner || member.manageable) && member.state === 'active'
  const stale = original.length !== member.role_ids.length || original.some(id => !member.role_ids.includes(id))
  const has = (key: string) => member.manageable && server.permissions.includes(key)
  const operations = [
    ...(member.state === 'active' && has('members.timeout') ? [['timeout', txa('Yazmayı süreli kısıtla')], ['untimeout', txa('Yazma kısıtlamasını kaldır')]] : []),
    ...(member.state === 'active' && has('members.kick') ? [['kick', txa('Sunucudan çıkar')]] : []),
    ...(has('members.ban') ? [member.state === 'banned' ? ['unban', txa('Yasağı kaldır (otomatik katılmaz)')] : ['ban', txa('Sunucudan yasakla')]] : []),
  ]
  const selectedOperation = operations.find(([id]) => id === operation)
  async function act(mode: 'roles' | 'moderate') {
    if (busy || (mode === 'roles' ? !canAssign || stale : !selectedOperation)) return
    setBusy(true); setError('')
    try {
      await communityV2.write(mode === 'roles' ? 'assign_roles' : 'moderate', mode === 'roles'
        ? { server_id: serverId, user_id: member.user_id, role_ids: roles, expected_role_ids: original }
        : { server_id: serverId, user_id: member.user_id, operation: operation === 'untimeout' ? 'timeout' : operation, minutes: operation === 'untimeout' ? 0 : minutes })
      await done()
    } catch (e) { setError(communityError(e)) } finally { setBusy(false) }
  }
  async function saveNickname() { setBusy(true); setError(''); try { await communityRooms.write('nickname', { server_id: serverId, user_id: member.user_id, nickname }); await done() } catch (e) { setError(communityError(e)) } finally { setBusy(false) } }
  return <div className="cv2-role-form">
    <button className="cv2-back" disabled={busy} onClick={back}>{txa('← Üyelere dön')}</button><CommunityIdentity user={member} />
    {member.timeout_until && Date.parse(member.timeout_until) > Date.now() && <p className="cv2-hint">{txa('Yazma kısıtlaması: {v1} tarihine kadar.', { v1: new Date(member.timeout_until).toLocaleString(intlLocale()) })}</p>}
    {!member.manageable && !server.is_owner && <p className="cv2-notice">{txa('Kendine, eşit veya üst seviyedeki üyelere yönetim işlemi uygulayamazsın.')}</p>}
    {member.is_owner && <p className="cv2-notice">{txa('Sunucunun tek sahibi korunur. Özel roller sahipliği değiştirmez.')}</p>}
    {stale && canAssign && <div className="cv2-notice">{txa('Üyenin rolleri başka bir işlemle değişti.')} <button disabled={busy} onClick={() => { setOriginal(member.role_ids); setRoles(member.role_ids) }}>{txa('Güncel rolleri aç')}</button></div>}
    {member.state === 'active' && member.manageable && server.permissions.includes('members.nicknames.manage') && <label>{txa('Sunucu takma adı')}<input value={nickname} maxLength={32} disabled={busy} onChange={e => setNickname(e.target.value)} /><button disabled={busy} onClick={() => void saveNickname()}>{txa('Takma adı kaydet')}</button></label>}
    <fieldset disabled={busy || !canAssign}><legend>{txa('Üyenin rolleri')}</legend>
      <p className="cv2-hint">{txa('Herkes rolü bütün üyelere otomatik uygulanır. Kilitli roller değiştirilemez.')}</p>
      {server.roles.filter(r => !r.is_default).map(role => <label className="cv2-check" key={role.id}><input type="checkbox" disabled={!server.is_owner && !role.manageable} checked={roles.includes(role.id)} onChange={e => setRoles(previous => e.target.checked ? [...previous, role.id] : previous.filter(r => r !== role.id))} /><span style={{ color: role.color }}>{role.name}</span></label>)}
      {canAssign && <button className="cv2-primary" disabled={busy || stale} onClick={() => void act('roles')}>{txa('Rolleri kaydet')}</button>}
    </fieldset>
    {!!operations.length && <label>{txa('Üye işlemi')}<select value={selectedOperation ? operation : ''} disabled={busy} onChange={e => setOperation(e.target.value)}><option value="">{txa('İşlem seç')}</option>{operations.map(([id, title]) => <option key={id} value={id}>{title}</option>)}</select></label>}
    {selectedOperation && <>
      {operation === 'timeout' && <label>{txa('Kısıtlama süresi')}<select value={minutes} disabled={busy} onChange={e => setMinutes(Number(e.target.value))}>{[[15, txa('15 dakika')], [60, txa('1 saat')], [1440, txa('1 gün')], [10080, txa('7 gün')]].map(([value, title]) => <option key={value} value={value}>{title}</option>)}</select></label>}
      <div className="cv2-confirm"><p>@{member.username}: {selectedOperation[1]}. {operation === 'kick' ? txa('Üye tekrar katılabilir; özel rolleri kaldırılır.') : operation === 'ban' ? txa('Üye tekrar katılamaz; özel rolleri kaldırılır.') : ''}</p><button disabled={busy} onClick={() => void act('moderate')}>{txa('Onayla ve uygula')}</button></div>
    </>}
    {error && <p role="alert" className="cv2-error">{error}</p>}
  </div>
}
