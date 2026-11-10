import { useState } from 'react'
import { Archive, LockKeyhole, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { communityV2, type CommunityChannel, type CommunitySeriesCandidate } from '@/services/communityV2Service'
import { channelReadOnlyText } from '@/lib/communityNavigation'
import { SeriesSelector } from './SeriesSelector'
import type { ManagerProps } from './types'
import { communityError } from '../communityHelpers'
import { txa } from '@/i18n/activeLocale'

export function ChannelsPanel(props: ManagerProps) {
  const [selected, setSelected] = useState(props.server.channels[0]?.id || 'new')
  const [revision, setRevision] = useState(0)
  const channel = props.server.channels.find(ch => ch.id === selected)
  return <div className="cv2-editor-grid"><aside className="cv2-editor-list" aria-label={txa('Sunucu kanalları')}>
    {props.server.permissions.includes('channels.create') && <button onClick={() => setSelected('new')}><Plus size={15} /> {txa('Kanal oluştur')}</button>}
    {props.server.channels.map(ch => <button key={ch.id} aria-pressed={selected === ch.id} onClick={() => setSelected(ch.id)}>
      {ch.archived_at ? <Archive size={14} /> : ch.is_private ? <LockKeyhole size={14} /> : '#'} {ch.name}
    </button>)}
    <p>{txa('Kategoriler kanalları gruplar. Arşivlenen kanalların geçmişi korunur; yeni mesaj gönderilmez.')}</p>
  </aside>{channel || (selected === 'new' && props.server.permissions.includes('channels.create')) ? <ChannelForm key={`${selected}:${revision}`} {...props} channel={channel} onCreated={setSelected} reload={() => setRevision(v => v + 1)} /> : <p className="cv2-hint">{txa('Düzenlemek için erişebildiğin bir kanal seç.')}</p>}</div>
}

function ChannelForm({ serverId, server, refresh, channel, onCreated, reload }: ManagerProps & { channel?: CommunityChannel; onCreated: (id: string) => void; reload: () => void }) {
  const [name, setName] = useState(channel?.name || ''), [topic, setTopic] = useState(channel?.topic || '')
  const [category, setCategory] = useState(channel?.category || ''), [position, setPosition] = useState(channel?.position || 0)
  const [privateRoom, setPrivateRoom] = useState(channel?.is_private || false), [roles, setRoles] = useState<string[]>(channel?.role_ids || [])
  const [version, setVersion] = useState(channel?.version), [confirmArchive, setConfirmArchive] = useState(false)
  const [slowmode, setSlowmode] = useState(channel?.slowmode_seconds || 0)
  const [series, setSeries] = useState<CommunitySeriesCandidate | null>(null)
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [status, setStatus] = useState('')
  const canMetadata = server.permissions.includes(channel ? 'channels.manage' : 'channels.create')
  const canAccess = server.permissions.includes('channels.permissions.manage') && (!!channel || canMetadata)
  const stale = !!channel && channel.version !== version
  async function save(archive = false) {
    if (busy || stale) return
    setBusy(true); setError(''); setStatus('')
    try {
      const result = archive && channel
        ? await communityV2.write('archive_channel', { server_id: serverId, channel_id: channel.id, version, archived: !channel.archived_at })
        : await communityV2.write('save_channel', { server_id: serverId, channel_id: channel?.id, version, name, topic, category, slowmode_seconds: slowmode, is_private: privateRoom, position, role_ids: roles, manga_id: channel?.manga_id || series?.id || null })
      setVersion(result.version); setConfirmArchive(false); await refresh()
      setStatus(archive ? channel?.archived_at ? txa('Kanal yeniden açıldı.') : txa('Kanal arşivlendi.') : txa('Kanal kaydedildi.'))
      if (!channel && result.id) { toast.success(txa('Kanal oluşturuldu.')); onCreated(result.id) }
    } catch (e) { setError(communityError(e)) } finally { setBusy(false) }
  }
  return <form className="cv2-role-form" onSubmit={e => { e.preventDefault(); void save() }}>
    {stale && !busy && <div className="cv2-notice">{txa('Kanal başka bir işlemle değişti.')} <button type="button" disabled={busy} onClick={reload}>{txa('Güncel kanalı aç')}</button></div>}
    {channel?.read_only_reason && <div className="cv2-notice"><Archive size={16} />{channelReadOnlyText[channel.read_only_reason]}</div>}
    {channel?.manga_id ? <div className="cv2-notice">{txa('Bağlı seri: {v1}. Seri bağlantısı sabittir.', { v1: channel.series?.title || txa('Yayında olmayan seri') })}</div> : server.profile.kind === 'fansub' && canMetadata && (!channel || channel.can_link_series) ? <SeriesSelector serverId={serverId} value={series} onChange={setSeries} disabled={busy || stale} /> : server.profile.kind === 'fansub' && channel && canMetadata && <p className="cv2-hint">{txa('Bu kanalda mesaj geçmişi var. Seri sohbeti için yeni kanal oluştur.')}</p>}
    <label>{txa('Kanal adı')}<input value={name} disabled={busy || !canMetadata} maxLength={60} onChange={e => setName(e.target.value)} required /></label>
    <label>{txa('Konu')}<textarea value={topic} disabled={busy || !canMetadata} maxLength={300} onChange={e => setTopic(e.target.value)} /></label>
    <label>{txa('Kategori')}<input list="cv2-channel-categories" value={category} disabled={busy || !canMetadata} maxLength={60} placeholder={txa('Örneğin: Ekip odaları')} onChange={e => setCategory(e.target.value)} />
      <datalist id="cv2-channel-categories">{[...new Set(server.channels.map(c => c.category).filter(Boolean))].map(value => <option key={value} value={value} />)}</datalist>
    </label>
    <label>{txa('Sıra')}<input type="number" value={position} disabled={busy || !canMetadata} min={0} max={1000} onChange={e => setPosition(Number(e.target.value))} /></label>
    <label>{txa('Yavaş mod (saniye)')}<input type="number" value={slowmode} min={0} max={21600} step={1} disabled={busy || !canMetadata} onChange={e => setSlowmode(Number(e.target.value))} /><small>{txa('0: kapalı. En fazla 6 saat. Her üyenin bu kanala göndereceği mesajlar arasındaki süre; sunucu sahibi ve yavaş modu atlama izni olan roller muaftır.')}</small></label>
    <label className="cv2-check"><input type="checkbox" checked={privateRoom} disabled={busy || !canAccess} onChange={e => setPrivateRoom(e.target.checked)} /> {txa('Özel oda')}</label>
    {privateRoom && <fieldset disabled={busy || !canAccess}><legend>{txa('Bu odayı görebilen roller')}</legend><p className="cv2-hint">{txa('Seçili rollerden biri yeterlidir. Sunucu sahibi her odaya erişir. Diğer yöneticiler kendi erişimlerini kaldıramaz.')}</p>
      {server.roles.map(role => <label className="cv2-check" key={role.id}><input type="checkbox" checked={roles.includes(role.id)} onChange={e => setRoles(previous => e.target.checked ? [...previous, role.id] : previous.filter(r => r !== role.id))} /><span style={{ color: role.color }}>{role.name}</span></label>)}
    </fieldset>}
    {error && <p className="cv2-error" role="alert">{error}</p>}{status && <p role="status" className="cv2-success">{status}</p>}
    <div className="cv2-form-actions">
      {channel && server.permissions.includes('channels.archive') && <button type="button" className="cv2-secondary" disabled={busy || stale} onClick={() => setConfirmArchive(v => !v)}><Archive size={15} />{channel.archived_at ? txa('Yeniden aç') : txa('Kanalı arşivle')}</button>}
      {(canMetadata || canAccess) && <button className="cv2-primary" disabled={busy || stale || !name.trim()}>{busy ? txa('Kaydediliyor…') : txa('Kanalı kaydet')}</button>}
    </div>
    {confirmArchive && <div className="cv2-confirm"><p>{channel?.archived_at ? txa('Kanal arşivden çıkacak. Seri bağlantısı ve rol izinleri uygunsa yeniden mesaj kabul edecek.') : txa('Mesajlar korunacak. Kanal arşivde görünecek ve yeni mesaj kabul etmeyecek.')}</p><button type="button" disabled={busy || stale} onClick={() => void save(true)}>{txa('Onayla')}</button><button type="button" disabled={busy} onClick={() => setConfirmArchive(false)}>{txa('Vazgeç')}</button></div>}
  </form>
}
