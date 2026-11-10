import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from '@/i18n/router'
import { Compass, Menu, MessageCircle, Settings2, Plus } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { communityV2, type CommunityHome, type CommunityDiscovery } from '@/services/communityV2Service'
import { CommunityAvatar, CommunityLoading, CommunityModal } from './CommunityShared'
import { communityError } from './communityHelpers'
import { CommunityWorkspace } from './CommunityWorkspace'
import { CommunityPreference } from './CommunityPreference'
import { CommunityJoinTarget } from './CommunityJoinTarget'
import { CommunityInviteEntry } from './CommunityInviteEntry'
import { resolveCommunityTarget } from '@/lib/communityNavigation'
import { CreateRoomForm } from './CommunityRoomForms'
import './communityPersonal.css'
import './communityV2.css'
import './communityInteractions.css'
import { txa } from '@/i18n/activeLocale'

export default function CommunityEntry() {
  const { currentUser, loading: authLoading } = useAuth()
  const userId = currentUser?.id
  const liveUser = useRef(userId)
  const homeRequest = useRef({ sequence: 0 })
  const syncedUser = useRef<string | null>(null)
  liveUser.current = userId
  const [home, setHome] = useState<CommunityHome | null>(null), [error, setError] = useState(''), [loading, setLoading] = useState(true)
  const homeRef = useRef(home)
  homeRef.current = home
  const [modal, setModal] = useState(''), [busy, setBusy] = useState(false)
  const [params, setParams] = useSearchParams()
  const requestedServer = params.get('sunucu'), requestedChannel = params.get('kanal')
  const inviteToken = params.get('davet')
  const loadHome = useCallback(async () => {
    if (!userId) return
    const request = ++homeRequest.current.sequence
    const current = () => liveUser.current === userId && homeRequest.current.sequence === request
    try { const next = await communityV2.home(undefined, requestedServer); if (current()) { setHome(next); setError('') } }
    catch (e) { if (current()) setError(communityError(e)) } finally { if (current()) setLoading(false) }
  }, [userId, requestedServer])
  useEffect(() => {
    let live = true
    const requests = homeRequest.current
    if (!userId) { syncedUser.current = null; setHome(null); setLoading(false) }
    else if (syncedUser.current !== userId) {
      setHome(null); setLoading(true)
      void communityV2.sync().then(() => { if (live) { syncedUser.current = userId; return loadHome() } }).catch(e => { if (live) { setError(communityError(e)); setLoading(false) } })
    } else {
      // A known server switch needs no membership sync or full-screen load.
      if (requestedServer && !homeRef.current?.servers.some(s => s.id === requestedServer)) setLoading(true)
      void loadHome()
    }
    return () => { live = false; requests.sequence++ }
  }, [userId, loadHome, requestedServer])
  const activeId = home && resolveCommunityTarget(home.servers, requestedServer)?.id
  const needsTargetEntry = Boolean((requestedServer && !activeId) || (requestedChannel && !requestedServer))
  async function create(fansubId: string) {
    setBusy(true); setError('')
    try {
      const result = await communityV2.write('create_server', { fansub_id: fansubId })
      await loadHome(); if (result.id) setParams({ sunucu: result.id }); setModal('')
    } catch (e) { setError(communityError(e)) } finally { setBusy(false) }
  }
  return <div className="cv2"><header className="cv2-top"><button aria-label={txa('Ana menüyü aç')} onClick={() => setModal('menu')}><Menu size={20} /></button><Link to="/topluluk" className="cv2-brand"><MessageCircle size={20} /> {txa('Topluluk')}</Link><span className="cv2-top-subtitle">{txa('Birlikte okumak daha güzel.')}</span><div className="cv2-top-actions">{currentUser && <><button onClick={() => setModal('discover')}><Compass size={17} /> {txa('Sunucuları keşfet')}</button><button onClick={() => setModal('room')}><Plus size={17} /> {txa('Oda oluştur')}</button>{Boolean(home?.owned_fansubs.length) && <button onClick={() => setModal('create')}><Plus size={17} /> {txa('Sunucu aç')}</button>}<button aria-label={txa('Topluluk tercihleri')} onClick={() => setModal('preferences')}><Settings2 size={18} /></button></>}</div></header>
    {error && <div role="alert" className="cv2-error">{error} <button onClick={() => void loadHome()}>{txa('Yeniden dene')}</button></div>}
    {authLoading || (currentUser && loading) ? <CommunityLoading /> : !currentUser ? <div className="cv2-empty"><MessageCircle size={42} /><h1>{txa('Okurlar burada buluşuyor.')}</h1><p>{txa('Fansub sunucularına katılmak ve sohbet etmek için hesabına giriş yap.')}</p><Link className="cv2-primary" to={`/giris?returnTo=${encodeURIComponent(`/topluluk${params.size ? `?${params}` : ''}`)}`}>{txa('Giriş yap')}</Link></div> : inviteToken !== null ? <CommunityInviteEntry key={`${userId}:${inviteToken}`} token={inviteToken} joined={id => setParams({ sunucu: id }, { replace: true })} reset={() => setParams({}, { replace: true })} /> : needsTargetEntry ? <CommunityJoinTarget key={`${userId}:${requestedServer}:${requestedChannel}`} serverId={requestedServer} channelId={requestedChannel || ''} joined={async id => { setParams({ sunucu: id, kanal: requestedChannel || '' }); await loadHome() }} reset={() => setParams({})} /> : home && activeId ? <CommunityWorkspace key={`${currentUser.id}:${activeId}`} home={home} activeId={activeId} channelId={params.get('kanal') || ''} userId={currentUser.id} selectServer={id => setParams({ sunucu: id })} selectChannel={(id, replace = false) => setParams({ sunucu: activeId, kanal: id }, { replace })} reloadHome={loadHome} openDiscover={() => setModal('discover')} overlayOpen={Boolean(modal)} /> : <div className="cv2-empty"><MessageCircle size={42} /><h1>{txa('Topluluğunu bul.')}</h1><p>{txa('Fansubların sohbetlerine katıl, okuduğun seriler üzerine konuş.')}</p><button className="cv2-primary" onClick={() => setModal('discover')}>{txa('Sunucuları keşfet')}</button>{Boolean(home?.owned_fansubs.length) && <button onClick={() => setModal('create')}>{txa('Fansub sunucunu aç')}</button>}</div>}
    {modal === 'menu' && <CommunityModal title={txa('Ana menü')} description={txa('BSG Manga\'da gezin.')} onClose={() => setModal('')}><nav className="cv2-main-menu">{[['/', txa('Ana sayfa')], ['/kesfet', txa('Keşfet')], ['/fansublar', txa('Fansublar')], ['/kutuphane', txa('Kütüphanem')], ['/ayarlar', txa('Ayarlar')]].map(([path, label]) => <Link key={path} to={path}>{label}</Link>)}</nav></CommunityModal>}
    {modal === 'preferences' && <CommunityModal title={txa('Topluluk tercihleri')} description={txa('Sunuculara nasıl katılacağını seç.')} onClose={() => setModal('')}><CommunityPreference refresh={loadHome} /></CommunityModal>}
    {modal === 'discover' && <Discovery onClose={() => setModal('')} onJoined={async id => { await loadHome(); setParams({ sunucu: id }); setModal('') }} />}
    {modal === 'room' && <CommunityModal title={txa('Oda oluştur')} description={txa('Kendi sohbet topluluğunu kur.')} onClose={() => setModal('')}><CreateRoomForm created={async id => { await loadHome(); setParams({ sunucu: id }); setModal('') }} /></CommunityModal>}
    {modal === 'create' && home && <CommunityModal title={txa('Fansub sunucunu aç')} description={txa('Sunucu sahibi fansubun tek admini olur. Rollerini ve özel odalarını oluşturabilirsin.')} onClose={() => { if (!busy) setModal('') }}>{home.owned_fansubs.map(f => <div className="cv2-discover-row" key={f.id}><strong>{f.name}</strong><button className="cv2-primary" disabled={busy} onClick={() => void create(f.id)}>{busy ? txa('Açılıyor…') : txa('Sunucuyu aç')}</button></div>)}{error && <p role="alert" className="cv2-error">{error}</p>}</CommunityModal>}
  </div>
}
function Discovery({ onClose, onJoined }: { onClose: () => void; onJoined: (id: string) => Promise<void> }) {
  const [rows, setRows] = useState<CommunityDiscovery[]>([]), [search, setSearch] = useState(''), [page, setPage] = useState(0), [busy, setBusy] = useState(''), [error, setError] = useState(''), [loading, setLoading] = useState(true)
  useEffect(() => { let live = true; setLoading(true); const timer = setTimeout(() => { void communityV2.discover(search, page * 20).then(value => { if (live) setRows(value) }).catch(e => { if (live) setError(communityError(e)) }).finally(() => { if (live) setLoading(false) }) }, 180); return () => { live = false; clearTimeout(timer) } }, [search, page])
  async function join(id: string) { setBusy(id); setError(''); try { const result = await communityV2.write('join', { server_id: id }); if (result.pending) { setRows(previous => previous.map(r => r.id === id ? { ...r, pending: true } : r)); } else await onJoined(id) } catch (e) { setError(communityError(e)) } finally { setBusy('') } }
  return <CommunityModal title={txa('Sunucuları keşfet')} description={txa('Katıldığında fansubun çeviri ekibine değil, sohbet topluluğuna üye olursun.')} onClose={onClose}>
    <input aria-label={txa('Sunucu ara')} placeholder={txa('Sunucu veya oda adıyla ara…')} value={search} onChange={e => { setSearch(e.target.value); setPage(0) }} />{error && <p role="alert" className="cv2-error">{error}</p>}
    {loading ? <CommunityLoading /> : rows.length ? rows.slice(0, 20).map(s => <div className="cv2-discover-row" key={s.id}><CommunityAvatar url={s.avatar_url} name={s.name} /><div><strong>{s.name}</strong><p>{s.description || txa('Fansubun okurlarıyla sohbet et.')}</p></div><button className="cv2-primary" disabled={!!busy || s.pending} onClick={() => void join(s.id)}>{s.pending ? txa('Başvuru bekliyor') : busy === s.id ? txa('İşleniyor…') : s.join_mode === 'request' ? txa('Katılım iste') : txa('Katıl')}</button></div>) : <p className="cv2-hint">{txa('Katılabileceğin bir sunucu bulunamadı.')}</p>}
    <div className="cv2-pagination"><button disabled={!page} onClick={() => setPage(p => p - 1)}>{txa('Önceki')}</button><span>{txa('Sayfa {v1}', { v1: page + 1 })}</span><button disabled={rows.length <= 20} onClick={() => setPage(p => p + 1)}>{txa('Sonraki')}</button></div>
  </CommunityModal>
}
