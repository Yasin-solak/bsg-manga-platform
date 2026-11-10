import { useEffect, useState } from 'react'
import { communityPersonal, communityRooms, type CommunityScope } from '@/services/communityPersonalService'
import { type CommunityServer } from '@/services/communityV2Service'
import { CommunityLoading } from './CommunityShared'
import { communityError } from './communityHelpers'
import { intlLocale, txa } from '@/i18n/activeLocale'

export function CommunityServerPreferences({ serverId, channelId, server, refresh }: { serverId: string; channelId?: string; userId: string; server: CommunityServer; refresh: () => Promise<void> }) {
  const [scope, setScope] = useState('server'), [value, setValue] = useState<CommunityScope | null>(null), [nickname, setNickname] = useState(server.my_nickname || '')
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [status, setStatus] = useState('')
  useEffect(() => { let live = true; setValue(null); void communityPersonal.scope(serverId, scope === 'channel' ? channelId : undefined).then(v => { if (live) { setValue(v); setError('') } }).catch(e => { if (live) setError(communityError(e)) }); return () => { live = false } }, [serverId, channelId, scope])
  async function save(kind: 'scope' | 'nickname') {
    setBusy(true); setError(''); setStatus('')
    try {
      if (kind === 'scope' && value) setValue(await communityPersonal.saveScope(serverId, scope === 'channel' ? channelId : undefined, value))
      else await communityRooms.write('nickname', { server_id: serverId, nickname })
      await refresh(); setStatus(txa('Tercihin kaydedildi.'))
    } catch (e) { setError(communityError(e)) } finally { setBusy(false) }
  }
  return <div className="cv2-role-form"><h3>{server.profile.name}</h3>{server.profile.banner_url && <img className="cv2-server-banner" src={server.profile.banner_url} alt={txa('Sunucu kapağı')} />}
    <p>{server.profile.description}</p>{server.profile.rules && <details><summary>{txa('Sunucu kuralları')}</summary><p className="cv2-rules">{server.profile.rules}</p></details>}
    <form className="cv2-role-form" onSubmit={e => { e.preventDefault(); void save('nickname') }}><label>{txa('Bu sunucudaki takma adın')}<input value={nickname} maxLength={32} disabled={busy} placeholder={txa('Profil adımı kullan')} onChange={e => setNickname(e.target.value)} /></label><button disabled={busy}>{txa('Takma adı kaydet')}</button></form>
    <nav className="cv2-tabs" aria-label={txa('Bildirim kapsamı')}><button disabled={busy} aria-pressed={scope === 'server'} onClick={() => setScope('server')}>{txa('Sunucu')}</button>{channelId && <button disabled={busy} aria-pressed={scope === 'channel'} onClick={() => setScope('channel')}>{txa('Bu kanal')}</button>}</nav>
    {value ? <form className="cv2-role-form" onSubmit={e => { e.preventDefault(); void save('scope') }}><label>{txa('Bildirim tercihi')}<select disabled={busy} value={value.mode} onChange={e => setValue({ ...value, mode: e.target.value as CommunityScope['mode'] })}><option value="inherit">{scope === 'server' ? txa('Genel tercihi kullan') : txa('Sunucudan devral')}</option><option value="all">{txa('Tüm mesajlar')}</option><option value="mentions">{txa('Yalnız etiketler ve yanıtlar')}</option><option value="off">{txa('Bildirim gönderme')}</option></select></label>
      <label>{txa('Süreli sessizlik')}<select disabled={busy} value={value.muted_until && Date.parse(value.muted_until) > Date.now() ? 'active' : ''} onChange={e => setValue({ ...value, muted_until: e.target.value ? new Date(Date.now() + Number(e.target.value) * 60000).toISOString() : null })}><option value="">{txa('Sessizlik yok')}</option>{value.muted_until && Date.parse(value.muted_until) > Date.now() && <option value="active">{txa('{v1} tarihine kadar', { v1: new Date(value.muted_until).toLocaleString(intlLocale()) })}</option>}<option value="15">{txa('15 dakika')}</option><option value="60">{txa('1 saat')}</option><option value="480">{txa('8 saat')}</option><option value="1440">{txa('24 saat')}</option></select></label>
      <button className="cv2-primary" disabled={busy}>{txa('Bildirim tercihini kaydet')}</button></form> : !error && <CommunityLoading />}
    {error && <p role="alert" className="cv2-error">{error}</p>}{status && <p role="status" className="cv2-success">{status}</p>}
  </div>
}
