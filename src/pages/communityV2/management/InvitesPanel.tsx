import { useEffect, useRef, useState } from 'react'
import { communityInvites, type CommunityInvite, type InviteDraft } from '@/services/communityInvitesService'
import { communityInvitePath, createInviteToken, INVITE_DURATIONS, INVITE_STATUS } from '@/lib/communityInvites'
import type { ManagerProps } from './types'
import { CommunityLoading } from '../CommunityShared'
import { communityError } from '../communityHelpers'
import '../communityInvites.css'
import { intlLocale, txa, getActiveLocale } from '@/i18n/activeLocale'
import { localizeHref } from '@/i18n/localizedRoutes'

export function InvitesPanel({ serverId, server }: ManagerProps) {
  const canCreate = server.is_owner || server.permissions.includes('invites.create')
  const canManage = server.is_owner || server.permissions.includes('invites.manage')
  const [rows, setRows] = useState<CommunityInvite[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState('')
  const [revision, setRevision] = useState(0), [cursors, setCursors] = useState<string[]>([])
  const [label, setLabel] = useState(txa('Okur daveti')), [duration, setDuration] = useState(604800), [limit, setLimit] = useState('25')
  const [busy, setBusy] = useState(''), [confirm, setConfirm] = useState(''), [message, setMessage] = useState('')
  const [created, setCreated] = useState<{ id: string; url: string } | null>(null)
  const pending = useRef<InviteDraft | null>(null), alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const before = cursors[cursors.length - 1]
  useEffect(() => {
    const controller = new AbortController(); setLoading(true)
    void communityInvites.list(serverId, before, controller.signal).then(value => {
      if (!controller.signal.aborted) { setRows(value); setError('') }
    }).catch(e => { if (!controller.signal.aborted) { setRows([]); setError(communityError(e)) } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [serverId, before, revision, canManage, canCreate])
  async function create(event: React.FormEvent) {
    event.preventDefault(); if (busy) return
    if (!label.trim()) { setError(txa('Davet adı boş bırakılamaz.')); return }
    setBusy('create'); setError(''); setMessage('')
    // If the network response is lost, the same form resends with the same key.
    const draft = { server_id: serverId, label: label.trim(), ttl_seconds: duration, max_uses: limit === '' ? null : Number(limit) }
    if (!pending.current || Object.entries(draft).some(([key, value]) => pending.current?.[key as keyof InviteDraft] !== value)) pending.current = { ...draft, token: createInviteToken() }
    try {
      const result = await communityInvites.create(pending.current)
      if (!alive.current) return
      if (result.revoked) { pending.current = null; throw new Error(txa('Önceki oluşturma isteğinin daveti iptal edilmiş. Yeniden oluşturabilirsin.')) }
      setCreated({ id: result.id, url: window.location.origin + localizeHref(communityInvitePath(pending.current.token), getActiveLocale()) }); pending.current = null
      setMessage(txa('Davet hazır. Bağlantıyı bu pencereyi kapatmadan kopyala.')); setCursors([]); setRevision(v => v + 1)
    } catch (e) { if (alive.current) setError(communityError(e)) } finally { if (alive.current) setBusy('') }
  }
  async function revoke(id: string) {
    setBusy(id); setError(''); setMessage('')
    try { await communityInvites.revoke(serverId, id); if (alive.current) { if (created?.id === id) setCreated(null); setConfirm(''); setMessage(txa('Davet iptal edildi. Mevcut üyeler sunucuda kalır.')); setRevision(v => v + 1) } }
    catch (e) { if (alive.current) setError(communityError(e)) } finally { if (alive.current) setBusy('') }
  }
  async function copy() {
    if (!created) return
    try { await navigator.clipboard.writeText(created.url); if (alive.current) setMessage(txa('Davet bağlantısı kopyalandı.')) }
    catch { if (alive.current) setError(txa('Kopyalama izni verilmedi. Bağlantı alanını seçip kendin kopyalayabilirsin.')) }
  }
  return <section className="cv2-invites" aria-label={txa('Sunucu davetleri')}>
    <p className="cv2-hint">{txa('{v1} Bağlantı yalnız topluluk üyeliği verir; özel oda veya ekip yetkisi vermez.', { v1: canManage ? txa('Sunucunun tüm davetlerini yönetiyorsun.') : txa('Oluşturduğun davetleri görebilir ve iptal edebilirsin.') })}</p>
    {canCreate && <form className="cv2-form cv2-invite-create" onSubmit={e => void create(e)}>
      <label>{txa('Davet adı')}<input required maxLength={80} value={label} disabled={!!busy} onChange={e => setLabel(e.target.value)} /></label>
      <label>{txa('Geçerlilik süresi')}<select value={duration} disabled={!!busy} onChange={e => setDuration(Number(e.target.value))}>{INVITE_DURATIONS.map(([v, text]) => <option key={v} value={v}>{text}</option>)}</select></label>
      <label>{txa('Kullanım sınırı')}<input type="number" min={1} max={10000} step={1} value={limit} disabled={!!busy} placeholder={txa('Sınırsız')} onChange={e => setLimit(e.target.value)} /><small>{txa('Boş bırakırsan sınırsız. Mevcut üye tekrar açınca kullanım düşmez.')}</small></label>
      <button className="cv2-primary" disabled={!!busy}>{busy === 'create' ? txa('Oluşturuluyor…') : txa('Davet oluştur')}</button>
    </form>}
    {created && <div className="cv2-invite-link"><label>{txa('Paylaşılacak davet bağlantısı')}<input readOnly value={created.url} onFocus={e => e.target.select()} /></label><button className="cv2-secondary" onClick={() => void copy()}>{txa('Bağlantıyı kopyala')}</button><p>{txa('Bağlantı bu ekran kapandıktan sonra tekrar gösterilmez. Kaybedersen eskisini iptal edip yenisini oluşturabilirsin.')}</p></div>}
    {message && <p role="status" className="cv2-success">{message}</p>}{error && <p role="alert" className="cv2-error">{error}</p>}
    <button className="cv2-secondary" disabled={loading || !!busy} onClick={() => setRevision(v => v + 1)}>{txa('Davetleri yenile')}</button>
    {loading ? <CommunityLoading /> : rows.slice(0, 25).map(row => <article className="cv2-invite-row" key={row.id}>
      <div><strong>{row.label}</strong><span>{INVITE_STATUS[row.status]}</span><p>{txa('@{v1} · {v2} / {v3} kullanım', { v1: row.creator_username || txa('silinmiş hesap'), v2: row.uses, v3: row.max_uses ?? '∞' })}</p><p>{row.expires_at ? txa('Bitiş: {v1}', { v1: new Date(row.expires_at).toLocaleString(intlLocale()) }) : txa('Süresiz')}{' '}{txa('· Oluşturma:')}{' '}{new Date(row.created_at).toLocaleString(intlLocale())}</p></div>
      {row.status !== 'revoked' && <button className="cv2-danger" disabled={!!busy} onClick={() => setConfirm(row.id)}>{txa('İptal et')}</button>}
      {confirm === row.id && <div className="cv2-confirm"><p>{txa('“{v1}” bağlantısı kalıcı olarak kapatılsın mı? Katılmış üyeler etkilenmez.', { v1: row.label })}</p><button disabled={!!busy} onClick={() => void revoke(row.id)}>{txa('Daveti iptal et')}</button><button disabled={!!busy} onClick={() => setConfirm('')}>{txa('Vazgeç')}</button></div>}
    </article>)}
    {!loading && !rows.length && !error && <p className="cv2-hint">{txa('Henüz davet yok.')}</p>}
    <div className="cv2-pagination"><button disabled={!cursors.length || loading || !!busy} onClick={() => setCursors(v => v.slice(0, -1))}>{txa('Önceki')}</button><span>{txa('Sayfa {v1}', { v1: cursors.length + 1 })}</span><button disabled={rows.length <= 25 || loading || !!busy} onClick={() => setCursors(v => [...v, rows[24].cursor])}>{txa('Sonraki')}</button></div>
  </section>
}
