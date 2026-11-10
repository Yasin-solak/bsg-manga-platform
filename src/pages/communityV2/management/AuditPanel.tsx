import { useEffect, useState } from 'react'
import { communityV2, COMMUNITY_PERMISSIONS, type CommunityAudit, type CommunityRole } from '@/services/communityV2Service'
import { CommunityLoading } from '../CommunityShared'
import { communityError } from '../communityHelpers'
import { intlLocale, txa } from '@/i18n/activeLocale'

const actions: Record<string, string> = { 'room.created':'Oda oluşturuldu', 'room.save_profile':'Sunucu profili güncellendi', 'room.offer_transfer':'Sahiplik devri önerildi', 'room.accept_transfer':'Sahiplik devredildi', 'room.cancel_transfer':'Devir iptal edildi', 'room.archive':'Oda arşiv durumu değişti', 'room.decide_request':'Katılım başvurusu kararı', get 'invite.create'() { return txa('Davet oluşturuldu') }, get 'invite.revoke'() { return txa('Davet iptal edildi') }, get 'invite.join'() { return txa('Davetle katıldı') }, get 'report.resolved'() { return txa('Şikâyet sonuçlandırıldı') }, get 'report.dismissed'() { return txa('Şikâyet gerekçesiz bulundu') }, get 'message.pin'() { return txa('Mesaj sabitlendi') }, get 'message.unpin'() { return txa('Mesaj sabitlemesi kaldırıldı') }, get save_role() { return txa('Rol kaydedildi') }, get delete_role() { return txa('Rol silindi') }, get assign_roles() { return txa('Üye rolleri güncellendi') }, get save_channel() { return txa('Kanal kaydedildi') }, get archive_channel() { return txa('Kanal arşiv durumu değişti') }, get 'server.manual'() { return txa('Sunucu açıldı') }, get 'server.automatic'() { return txa('Sunucu otomatik açıldı') }, get 'member.timeout'() { return txa('Yazma kısıtlaması değişti') }, get 'member.kick'() { return txa('Üye çıkarıldı') }, get 'member.ban'() { return txa('Üye yasaklandı') }, get 'member.unban'() { return txa('Üye yasağı kaldırıldı') }, get delete_message() { return txa('Mesaj silindi') } }
const fields: Record<string, string> = { get slowmode_seconds() { return txa('Yavaş mod (saniye)') }, get mentionable() { return txa('Etiketlenebilir') }, get name() { return txa('Ad') }, get color() { return txa('Renk') }, get position() { return txa('Sıra') }, get permissions() { return txa('İzinler') }, get category() { return txa('Kategori') }, get topic() { return txa('Konu') }, get private() { return txa('Özel oda') }, get roles() { return txa('Erişen roller') }, get manga_id() { return txa('Bağlı seri kimliği') } }
function object(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {} }
function changes(row: CommunityAudit, roles: CommunityRole[]) {
  const roleNames = (value: unknown) => Array.isArray(value) ? value.map(id => roles.find(r => r.id === id)?.name || txa('Silinmiş rol')).join(', ') || txa('Özel rol yok') : '—'
  const format = (key: string, value: unknown): string => {
    if (key === 'roles') return roleNames(value)
    if (key === 'permissions' && Array.isArray(value)) return value.map(p => COMMUNITY_PERMISSIONS.find(([id]) => id === p)?.[1] || txa('Bilinmeyen izin')).join(', ') || txa('İzin yok')
    if (typeof value === 'boolean') return value ? txa('Açık') : txa('Kapalı')
    return typeof value === 'string' || typeof value === 'number' ? String(value) || txa('Boş') : '—'
  }
  if (row.action === 'assign_roles') return [`Roller: ${roleNames(row.details.before)} → ${roleNames(row.details.after)}`]
  if (row.action === 'archive_channel') return [row.details.archived ? txa('Kanal salt okunur arşive alındı.') : txa('Kanal arşivden çıkarıldı. Seri ve rol koşulları geçerli.')]
  if (row.action === 'member.timeout' && row.details.minutes != null) return [row.details.minutes ? txa('{v1} dakika yazma kısıtlaması.', { v1: row.details.minutes }) : txa('Yazma kısıtlaması kaldırıldı.')]
  const before = object(row.details.before), after = object(row.details.after)
  return Object.keys(fields).filter(key => key in after && JSON.stringify(before[key]) !== JSON.stringify(after[key])).map(key => `${fields[key]}: ${format(key, before[key])} → ${format(key, after[key])}`)
}
export function AuditPanel({ serverId, roles }: { serverId: string; roles: CommunityRole[] }) {
  const [actorSearch, setActorSearch] = useState(''), [actors, setActors] = useState<{id:string;username:string}[]>([])
  useEffect(() => { let live=true; const timer=setTimeout(() => { void communityV2.auditActors(serverId, actorSearch).then(v=>{if(live)setActors(v)}).catch(()=>{}) },200); return()=>{live=false;clearTimeout(timer)} },[serverId,actorSearch])
  const [action, setAction] = useState(''), [actor, setActor] = useState(''), [from, setFrom] = useState(''), [to, setTo] = useState('')
  const [rows, setRows] = useState<CommunityAudit[]>([]), [page, setPage] = useState(0), [error, setError] = useState(''), [loading, setLoading] = useState(true), [revision, setRevision] = useState(0)
  useEffect(() => {
    let live = true; setLoading(true)
    void communityV2.audit(serverId, page * 50, { action: action || undefined, actor_id: actor.trim() || undefined, from: from ? new Date(from).toISOString() : undefined, to: to ? new Date(new Date(to).getTime() + 86400000).toISOString() : undefined }).then(value => { if (live) { setRows(value); setError('') } }).catch(e => { if (live) setError(communityError(e)) }).finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [serverId, page, revision, action, actor, from, to])
  return <><div className="cv2-filter-grid"><label>{txa('İşlem')}<select value={action} onChange={e => { setAction(e.target.value); setPage(0) }}><option value="">{txa('Tüm işlemler')}</option>{Object.entries(actions).map(([key,title]) => <option key={key} value={key}>{title}</option>)}</select></label><label>{txa('İşlemi yapan')}<input aria-label={txa('İşlem yapan kişiyi ara')} value={actorSearch} onChange={e=>setActorSearch(e.target.value)} placeholder={txa('Kullanıcı adı ara')} /><select value={actor} onChange={e=>{setActor(e.target.value);setPage(0)}}><option value="">{txa('Herkes')}</option>{actors.map(a=><option key={a.id} value={a.id}>@{a.username}</option>)}</select></label><label>{txa('Başlangıç')}<input type="date" value={from} onChange={e => { setFrom(e.target.value); setPage(0) }} /></label><label>{txa('Bitiş')}<input type="date" value={to} onChange={e => { setTo(e.target.value); setPage(0) }} /></label></div><button className="cv2-secondary" disabled={loading} onClick={() => setRevision(v => v + 1)}>{txa('Geçmişi yenile')}</button>
    {error && <p role="alert" className="cv2-error">{error}</p>}{loading ? <CommunityLoading /> : rows.map(row => <article className="cv2-audit" key={row.id}>
      <strong>{txa(actions[row.action] || 'Sunucu işlemi')}{row.details.label && ` · ${row.details.label}`}</strong><span>@{row.username || txa('silinmiş hesap')}</span><time dateTime={row.created_at}>{new Date(row.created_at).toLocaleString(intlLocale())}</time>
      <div className="cv2-audit-changes">{changes(row, roles).map((text, index) => <p key={index}>{text}</p>)}</div>
    </article>)}
    {!loading && !rows.length && <p className="cv2-hint">{txa('Henüz işlem kaydı yok.')}</p>}
    <div className="cv2-pagination"><button disabled={!page || loading} onClick={() => setPage(p => p - 1)}>{txa('Önceki')}</button><span>{txa('Sayfa {v1}', { v1: page + 1 })}</span><button disabled={rows.length < 50 || loading} onClick={() => setPage(p => p + 1)}>{txa('Sonraki')}</button></div>
  </>
}
