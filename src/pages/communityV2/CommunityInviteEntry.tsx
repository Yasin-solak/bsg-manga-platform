import { useEffect, useRef, useState } from 'react'
import { communityInvites, type CommunityInviteEntry as Entry } from '@/services/communityInvitesService'
import { INVITE_FAILURE } from '@/lib/communityInvites'
import { CommunityAvatar, CommunityLoading } from './CommunityShared'
import { communityError } from './communityHelpers'
import { intlLocale, txa } from '@/i18n/activeLocale'

export function CommunityInviteEntry({ token, joined, reset }: { token: string; joined: (id: string) => void; reset: () => void }) {
  const [entry, setEntry] = useState<Entry | null>(null), [error, setError] = useState(''), [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false), [revision, setRevision] = useState(0), alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError(''); setEntry(null)
    if (!/^[a-f0-9]{64}$/.test(token)) { setError(txa('Davet bağlantısı geçersiz. Bağlantının tamamını açtığından emin ol.')); setLoading(false); return }
    void communityInvites.preview(token, controller.signal).then(v => { if (!controller.signal.aborted) setEntry(v) })
      .catch(e => { if (!controller.signal.aborted) setError(communityError(e)) }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [token, revision])
  async function join() {
    if (busy) return
    setBusy(true); setError('')
    try {
      const result = await communityInvites.redeem(token)
      if (!alive.current) return
      if (result.server_id && (result.status === 'joined' || result.status === 'already_member')) joined(result.server_id)
      else setEntry(result)
    } catch (e) { if (alive.current) setError(communityError(e)) } finally { if (alive.current) setBusy(false) }
  }
  const available = entry?.status === 'ready' || entry?.status === 'already_member'
  const failure = entry && entry.status in INVITE_FAILURE ? INVITE_FAILURE[entry.status as keyof typeof INVITE_FAILURE] : ''
  return loading ? <CommunityLoading /> : <div className="cv2-empty">
    <h1>{txa('Sunucu daveti')}</h1>
    {available && <><CommunityAvatar url={entry.avatar_url ?? null} name={entry.name || txa('Sunucu')} /><h2>{entry.name}</h2><p>{entry.status === 'already_member' ? txa('Bu sunucuya zaten üyesin. Bağlantıyı açmak yeni kullanım harcamaz.') : txa('Katılımın sana sohbet topluluğu üyeliği verir. Özel oda erişimi ve çeviri ekibi rolleri ayrıca belirlenir.')}</p>{entry.expires_at && <p>{txa('Davetin bitişi: {v1}', { v1: new Date(entry.expires_at).toLocaleString(intlLocale()) })}</p>}<button className="cv2-primary" disabled={busy} onClick={() => void join()}>{busy ? txa('Açılıyor…') : entry.status === 'already_member' ? txa('Sunucuyu aç') : txa('Sunucuya katıl')}</button></>}
    {(failure || error) && <p className="cv2-error" role="alert">{error || failure}</p>}
    {!available && <button disabled={busy} onClick={() => setRevision(v => v + 1)}>{txa('Yeniden kontrol et')}</button>}
    <button disabled={busy} onClick={reset}>{txa('Topluluk ana ekranı')}</button>
  </div>
}
