import { useState } from 'react'
import { Plus, ShieldCheck, Search, LockKeyhole } from 'lucide-react'
import { toast } from 'sonner'
import { communityV2, COMMUNITY_PERMISSIONS, type CommunityRole } from '@/services/communityV2Service'
import { roleControls } from '@/lib/communityManagementPolicy'
import { communityError } from '../communityHelpers'
import type { ManagerProps } from './types'
import { txa, intlLocale } from '@/i18n/activeLocale'

export function RolesPanel(props: ManagerProps) {
  const [selected, setSelected] = useState(props.server.roles[0]?.id || 'new')
  const [revision, setRevision] = useState(0)
  const role = props.server.roles.find(r => r.id === selected)
  const canCreate = props.server.permissions.includes('roles.create') && props.server.my_rank < 1000
  return <div className="cv2-editor-grid">
    <aside className="cv2-editor-list" aria-label={txa('Sunucu rolleri')}>
      {canCreate && <button onClick={() => setSelected('new')}><Plus size={15} /> {txa('Rol oluştur')}</button>}
      {props.server.roles.map(r => <button key={r.id} aria-pressed={selected === r.id} onClick={() => setSelected(r.id)}>
        <i style={{ background: r.color }} />{r.icon} {r.name}<small>{r.is_default ? txa('Temel') : r.position}</small>{!r.manageable && <LockKeyhole size={12} />}
      </button>)}
      <p>{txa('Küçük sıra değeri daha üsttedir. Yetkililer yalnız kendi en yüksek rollerinin altını yönetir. Aynı sıradaki roller eşittir.')}</p>
    </aside>
    {role || (selected === 'new' && canCreate) ? <RoleForm key={`${selected}:${revision}`} {...props} role={role} onSelect={setSelected} reload={() => setRevision(v => v + 1)} /> : <p className="cv2-hint">{txa('İncelemek için bir rol seç.')}</p>}
  </div>
}

function RoleForm({ serverId, server, refresh, role, onSelect, reload }: ManagerProps & { role?: CommunityRole; onSelect: (id: string) => void; reload: () => void }) {
  const [name, setName] = useState(role?.name || ''), [color, setColor] = useState(role?.color || '#86d9ce')
  const [icon, setIcon] = useState(role?.icon || ''), [hoist, setHoist] = useState(role?.hoist || false)
  const [position, setPosition] = useState(role?.position ?? Math.max(10, server.my_rank + 1))
  const [mentionable, setMentionable] = useState(role?.mentionable || false)
  const [permissions, setPermissions] = useState<string[]>(role?.permissions || [])
  // Broadcast refreshes cannot advance the open form's version; another person's change is not overwritten.
  const [version, setVersion] = useState(role?.version)
  const [search, setSearch] = useState(''), [section, setSection] = useState('appearance')
  const [error, setError] = useState(''), [status, setStatus] = useState(''), [busy, setBusy] = useState(false), [confirmDelete, setConfirmDelete] = useState(false)
  const controls = roleControls(server, role)
  const stale = !!role && role.version !== version
  const canSave = controls.appearance || controls.permissions || controls.order
  const filtered = COMMUNITY_PERMISSIONS.filter(([, title, description]) => `${txa(title)} ${txa(description)}`.toLocaleLowerCase(intlLocale()).includes(search.toLocaleLowerCase(intlLocale())))

  async function save() {
    if (busy || !canSave || stale) return
    setBusy(true); setError(''); setStatus('')
    try {
      const saved = await communityV2.write('save_role', { server_id: serverId, role_id: role?.id, version, name, color, position, permissions, mentionable, icon, hoist })
      setVersion(saved.version); await refresh(); setStatus(txa('Rol kaydedildi.'))
      if (!role && saved.id) { toast.success(txa('Rol oluşturuldu.')); onSelect(saved.id) }
    } catch (e) { setError(communityError(e)) } finally { setBusy(false) }
  }
  async function remove() {
    if (!role || busy || !controls.remove) return
    setBusy(true); setError('')
    try { await communityV2.write('delete_role', { server_id: serverId, role_id: role.id, version }); await refresh(); onSelect('new') }
    catch (e) { setError(communityError(e)) } finally { setBusy(false) }
  }
  return <form className="cv2-role-form" onSubmit={e => { e.preventDefault(); void save() }}>
    <nav className="cv2-tabs" aria-label={txa('Rol düzenleme')}>
      <button type="button" aria-pressed={section === 'appearance'} onClick={() => setSection('appearance')}>{txa('Görünüm')}</button>
      <button type="button" aria-pressed={section === 'permissions'} onClick={() => setSection('permissions')}>{txa('İzinler')} <small>{permissions.length}</small></button>
    </nav>
    {role && !role.manageable && <p className="cv2-notice">{txa('Bu rol korunuyor. Eşit, üst veya kendi rolünü değiştiremez; sahip olmadığın izinleri yönetemezsin.')}</p>}
    {stale && <div className="cv2-notice">{txa('Rol başka bir işlemle değişti.')} <button type="button" disabled={busy} onClick={reload}>{txa('Güncel rolü aç')}</button></div>}
    {section === 'appearance' ? <>
      <label>{txa('Rol adı')}<input value={name} disabled={busy || !controls.appearance} onChange={e => setName(e.target.value)} maxLength={40} required /></label>
      <label>{txa('Rol simgesi (emoji)')}<input value={icon} maxLength={8} disabled={busy || !controls.appearance} onChange={e => setIcon(e.target.value)} placeholder={txa('Örneğin: 📚')} /></label>
      <label className="cv2-check"><input type="checkbox" checked={hoist} disabled={busy || !controls.appearance || role?.is_default} onChange={e => setHoist(e.target.checked)} />{txa('Üye listesinde ayrı grup göster')}</label>
      <label>{txa('Rol rengi')}<input type="color" value={color} disabled={busy || !controls.appearance} onChange={e => setColor(e.target.value)} /></label>
      <label>{txa('Listede sıra')}<input type="number" min={server.is_owner ? 0 : server.my_rank + 1} max={1000} value={position} disabled={busy || !controls.order} onChange={e => setPosition(Number(e.target.value))} required /></label>
      {!role?.is_default && <label className="cv2-permission"><span><strong>{txa('Etiketlenebilir rol')}</strong><small>{txa('Rol etiketleme izni olan üyeler bu rolü @ ile seçebilir.')}</small></span><input type="checkbox" checked={mentionable} disabled={busy || !controls.permissions} onChange={e => setMentionable(e.target.checked)} /></label>}
      <div className="cv2-role-preview"><ShieldCheck style={{ color }} /><span style={{ color }}>{name || txa('Yeni rol')}</span><small>{txa('Üyeler en üstteki özel rollerinin rengiyle, bir kez listelenir.')}</small></div>
      {role?.is_default && <p className="cv2-hint">{txa('Herkes rolü bütün üyelerde vardır. Bu temel rolü yalnız sunucu sahibi yönetir.')}</p>}
    </> : <>
      <div className="cv2-notice">{txa('Bir rolün verdiği izin yeterlidir. Kapalı seçim başka rolün verdiği izni geri almaz.')}</div>
      <label className="cv2-search"><Search size={16} /><input aria-label={txa('İzin ara')} value={search} onChange={e => setSearch(e.target.value)} placeholder={txa('İzinlerde ara')} /></label>
      <div>{filtered.map(([key, title, description]) => <label className="cv2-permission" key={key}>
        <span><strong>{txa(title)}</strong><small>{txa(description)}</small></span>
        <input type="checkbox" disabled={busy || !controls.grant(key)} checked={permissions.includes(key)} onChange={e => setPermissions(previous => e.target.checked ? [...previous, key] : previous.filter(p => p !== key))} />
      </label>)}{!filtered.length && <p className="cv2-hint">{txa('Aramana uygun izin yok.')}</p>}</div>
    </>}
    {error && <p role="alert" className="cv2-error">{error}</p>}{status && <p role="status" className="cv2-success">{status}</p>}
    <div className="cv2-form-actions">
      {controls.remove && <button type="button" className="cv2-danger" disabled={busy} onClick={() => setConfirmDelete(v => !v)}>{txa('Rolü sil')}</button>}
      {canSave && <button className="cv2-primary" disabled={busy || stale || !name.trim()}>{busy ? txa('Kaydediliyor…') : txa('Rolü kaydet')}</button>}
    </div>
    {confirmDelete && <div className="cv2-confirm"><p>{txa('“{v1}” silinecek. Üyelerden ve özel oda erişimlerinden kaldırılacak. Bu işlem geri alınamaz.', { v1: role?.name ?? '' })}</p><button type="button" disabled={busy || stale} className="cv2-danger" onClick={() => void remove()}>{txa('Evet, rolü sil')}</button><button type="button" disabled={busy} onClick={() => setConfirmDelete(false)}>{txa('Vazgeç')}</button></div>}
  </form>
}
