import { useEffect, useState } from 'react'
import { communityRooms, type CommunityJoinRequest } from '@/services/communityPersonalService'
import { CommunityIdentity, CommunityLoading } from '../CommunityShared'
import { communityError } from '../communityHelpers'
import type { ManagerProps } from './types'
import { txa } from '@/i18n/activeLocale'

export function JoinRequestsPanel({ serverId, refresh }: ManagerProps) {
  const [rows, setRows] = useState<CommunityJoinRequest[]>([]), [page, setPage] = useState(0), [revision, setRevision] = useState(0)
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(''), [error, setError] = useState(''), [status, setStatus] = useState('')
  useEffect(() => { let live = true; setLoading(true); void communityRooms.requests(serverId, page * 50).then(v => { if (live) { setRows(v); setError('') } }).catch(e => { if (live) setError(communityError(e)) }).finally(() => { if (live) setLoading(false) }); return () => { live = false } }, [serverId, page, revision])
  async function decide(userId: string, approve: boolean) {
    setBusy(userId); setError(''); setStatus('')
    try { await communityRooms.write('decide_request', { server_id: serverId, user_id: userId, approve }); setStatus(approve ? txa('Başvuru onaylandı.') : txa('Başvuru reddedildi.')); setRevision(v => v + 1); await refresh() }
    catch (e) { setError(communityError(e)) } finally { setBusy('') }
  }
  return <><button disabled={loading} onClick={() => setRevision(v => v + 1)}>{txa('Başvuruları yenile')}</button>{error && <p role="alert" className="cv2-error">{error}</p>}{status && <p role="status">{status}</p>}{loading ? <CommunityLoading /> : rows.slice(0, 50).map(r => <div className="cv2-discover-row" key={r.user_id}><CommunityIdentity user={r} /><button disabled={!!busy} onClick={() => void decide(r.user_id, true)}>{txa('Onayla')}</button><button disabled={!!busy} onClick={() => void decide(r.user_id, false)}>{txa('Reddet')}</button></div>)}{!loading && !rows.length && <p>{txa('Bekleyen başvuru yok.')}</p>}<div className="cv2-pagination"><button disabled={!page || loading} onClick={() => setPage(p => p - 1)}>{txa('Önceki')}</button><button disabled={rows.length <= 50 || loading} onClick={() => setPage(p => p + 1)}>{txa('Sonraki')}</button></div></>
}
