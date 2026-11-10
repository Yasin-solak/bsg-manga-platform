import { useEffect, useState } from 'react'
import { Link } from '@/i18n/router'
import { ChevronDown, Hash, LockKeyhole, Settings2, Users, LogOut } from 'lucide-react'
import { communityV2, type CommunityHome, type CommunityServer, type CommunityMember } from '@/services/communityV2Service'
import { CommunityAvatar, CommunityIdentity, CommunityLoading, CommunityModal } from './CommunityShared'
import { communityError, displayRole } from './communityHelpers'
import { CommunityManagement } from './CommunityManagement'
import { CommunityServerPreferences } from './CommunityServerPreferences'
import { CommunityChat } from './CommunityChat'
import { CommunityChannelTree } from './CommunityChannelTree'
import { allowedManagementTabs } from '@/lib/communityManagementPolicy'
import { resolveCommunityTarget } from '@/lib/communityNavigation'
import { useCommunityServer } from './useCommunityServer'
import { txa } from '@/i18n/activeLocale'

export function CommunityWorkspace({ home, activeId, channelId, userId, selectServer, selectChannel, reloadHome, openDiscover, overlayOpen }: {
  home: CommunityHome; activeId: string; channelId: string; userId: string; overlayOpen: boolean;
  selectServer: (id: string) => void; selectChannel: (id: string, replace?: boolean) => void; reloadHome: () => Promise<void>; openDiscover: () => void;
}) {
  const { server, error, setError, loading, memberRevision, refresh, refreshActivity } = useCommunityServer(activeId)
  const [preferences, setPreferences] = useState(false)
  const [manage, setManage] = useState(false), [leave, setLeave] = useState(false), [leaving, setLeaving] = useState(false)
  const [mobilePanel, setMobilePanel] = useState<'channels' | 'chat' | 'members'>(channelId ? 'chat' : 'channels')
  const [small, setSmall] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches)
  useEffect(() => {
    const query = window.matchMedia('(max-width: 767px)')
    const update = () => setSmall(query.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  const active = home.servers.find(s => s.id === activeId)
  const channel = server && resolveCommunityTarget(server.channels, channelId, server.channels.find(c => !c.archived_at))
  const resolvedChannelId = channel?.id
  useEffect(() => {
    // Pin the first selection: a new channel/order change should not change the open chat.
    if (resolvedChannelId && resolvedChannelId !== channelId) selectChannel(resolvedChannelId, true)
  }, [resolvedChannelId, channelId, selectChannel])
  const canManage = server && allowedManagementTabs(server).length > 0
  async function leaveServer() {
    setLeaving(true)
    try { await communityV2.write('leave', { server_id: activeId }); await reloadHome(); setLeave(false) }
    catch (e) { setError(communityError(e)) } finally { setLeaving(false) }
  }
  return <>
    <nav className="cv2-mobile-tabs" aria-label={txa('Topluluk panelleri')}>{([['channels', txa('Kanallar')], ['chat', txa('Sohbet')], ['members', txa('Üyeler')]] as const).map(([id, text]) => <button aria-pressed={mobilePanel === id} key={id} onClick={() => setMobilePanel(id)}>{text}</button>)}</nav>
    <div className={`cv2-workspace cv2-panel-${mobilePanel}`}>
      <aside className="cv2-sidebar" aria-label={txa('Sunucular ve kanallar')}><div className="cv2-sidebar-label">{txa('SUNUCULAR')}{' '}<button onClick={openDiscover}>{txa('Keşfet')}</button></div>
        {home.servers.map(s => <div className="cv2-server" key={s.id}><button className="cv2-server-title" aria-expanded={activeId === s.id} onClick={() => selectServer(s.id)}><CommunityAvatar url={s.avatar_url} name={s.name} /><strong>{s.id === activeId ? server?.profile.name || s.name : s.name}{s.archived_at && txa(' · Arşiv')}</strong><ChevronDown size={15} /></button>
          {activeId === s.id && <div className="cv2-channel-tree">{loading ? <CommunityLoading /> : <CommunityChannelTree channels={server?.channels || []} selectedId={channel?.id} select={id => { selectChannel(id); setMobilePanel('chat') }} />}{!loading && !server?.channels.length && <p className="cv2-hint">{txa('Görüntüleyebildiğin kanal yok.')}</p>}</div>}
        </div>)}
        <div className="cv2-sidebar-actions">{canManage && <button onClick={() => setManage(true)}><Settings2 size={16} /> {txa('Sunucu yönetimi')}</button>}<button onClick={() => setPreferences(true)}><Settings2 size={16} /> {txa('Sunucu bilgisi ve tercihlerim')}</button>{active?.kind === 'fansub' && <Link to={`/fansub/${active.slug}`}><Users size={16} /> {txa('Fansub profili')}</Link>}{server && !server.is_owner && <button onClick={() => setLeave(true)}><LogOut size={16} /> {txa('Sunucudan ayrıl')}</button>}</div>
      </aside>
      <div className="cv2-main">{error && <div role="alert" className="cv2-error">{error} <button onClick={() => { void reloadHome(); void refresh() }}>{txa('Yenile')}</button></div>}{loading ? <CommunityLoading /> : channel && server ? channel.can_read ? <CommunityChat key={channel.id} channel={channel} server={server} userId={userId} refreshServer={refresh} refreshActivity={refreshActivity} visible={!overlayOpen && !manage && !leave && !preferences && (!small || mobilePanel === 'chat')} /> : <div className="cv2-empty"><LockKeyhole /><h2>{channel.name}</h2><p>{txa('Bu kanalı görebiliyorsun, ancak mesajlarını okuma iznin yok.')}</p></div> : <div className="cv2-empty"><Hash /><h2>{channelId ? txa('Bu kanal kullanılamıyor') : txa('Bir kanal seç')}</h2><p>{channelId ? txa('Kanal kaldırılmış veya erişimin değişmiş olabilir. Soldan erişebildiğin başka bir kanal seç.') : txa('Erişebildiğin sohbetler burada açılır.')}</p></div>}</div>
      <aside className="cv2-members" aria-label={txa('Kanal üyeleri')}>{(!small || mobilePanel === 'members') && (server && channel ? <CommunityMembers key={channel.id} serverId={activeId} channelId={channel.id} server={server} revision={memberRevision} /> : <p className="cv2-hint">{txa('Üyeleri görmek için bir kanal seç.')}</p>)}</aside>
    </div>
    {preferences && server && <CommunityModal title={txa('Sunucu bilgisi ve tercihlerim')} description={txa('Kurallar, takma adın ve bildirimlerin.')} onClose={() => setPreferences(false)}><CommunityServerPreferences serverId={activeId} channelId={channel?.id} server={server} userId={userId} refresh={refresh} /></CommunityModal>}
    {manage && server && <CommunityManagement serverId={activeId} server={server} refresh={refresh} onClose={() => setManage(false)} />}
    {leave && <CommunityModal title={txa('Sunucudan ayrıl')} description={txa('Fansub takibin korunur. İstersen Keşfet bölümünden yeniden katılabilirsin; otomatik katılım seni geri eklemez.')} onClose={() => { if (!leaving) setLeave(false) }}><button className="cv2-primary" disabled={leaving} onClick={() => void leaveServer()}>{leaving ? txa('Ayrılıyor…') : txa('Sunucudan ayrıl')}</button></CommunityModal>}
  </>
}
function CommunityMembers({ serverId, channelId, server, revision }: { serverId: string; channelId: string; server: CommunityServer; revision: number }) {
  const [rows, setRows] = useState<CommunityMember[]>([]), [page, setPage] = useState(0), [search, setSearch] = useState(''), [loading, setLoading] = useState(true), [error, setError] = useState('')
  useEffect(() => {
    let live = true
    const timer = setTimeout(() => { void communityV2.members(serverId, search, page * 50, false, channelId).then(value => { if (live) { setRows(value); setError('') } }).catch(e => { if (live) { setRows([]); setError(communityError(e)) } }).finally(() => { if (live) setLoading(false) }) }, 150)
    return () => { live = false; clearTimeout(timer) }
  }, [serverId, channelId, page, search, revision])
  const groups = new Map<string, { label: string; position: number; color?: string; members: CommunityMember[] }>()
  rows.slice(0, 50).forEach(member => {
    const role = [...server.roles].sort((a,b) => a.position-b.position || a.id.localeCompare(b.id)).find(r => r.hoist && !r.is_default && member.role_ids.includes(r.id)), id = member.is_owner ? 'owner' : role?.id || 'members'
    const group = groups.get(id) || { label: member.is_owner ? txa('Sunucu sahibi') : role?.name || txa('Üyeler'), position: member.is_owner ? -1 : role?.position ?? 1001, color: role?.color, members: [] }
    group.members.push(member); groups.set(id, group)
  })
  return <><h2>{txa('ÜYELER')}</h2><input className="cv2-member-search" aria-label={txa('Kanal üyelerinde ara')} placeholder={txa('Üye ara…')} value={search} onChange={e => { setSearch(e.target.value); setPage(0) }} />
    {error && <p role="alert">{error}</p>}{loading ? <CommunityLoading /> : [...groups.entries()].sort((a, b) => a[1].position - b[1].position).map(([id, group]) => <section className="cv2-member-group" key={id}><h3 style={{ color: group.color }}>{group.label} <span>— {group.members.length}</span></h3>{group.members.map(member => <div key={member.user_id} className="cv2-member-with-icon"><span aria-hidden="true">{displayRole(member, server.roles)?.icon}</span><CommunityIdentity user={member} color={displayRole(member, server.roles)?.color} /></div>)}</section>)}
    {!loading && !rows.length && <p className="cv2-hint">{txa('Gösterilecek üye yok.')}</p>}{(page > 0 || rows.length > 50) && <div className="cv2-pagination"><button disabled={!page} onClick={() => setPage(p => p - 1)}>{txa('Önceki')}</button><button disabled={rows.length <= 50} onClick={() => setPage(p => p + 1)}>{txa('Sonraki')}</button></div>}
  </>
}
