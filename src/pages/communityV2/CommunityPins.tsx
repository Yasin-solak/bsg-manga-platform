import { useCallback, useEffect, useState } from 'react'
import { communityV2, type CommunityMessage } from '@/services/communityV2Service'
import { CommunityIdentity, CommunityLoading, CommunityModal } from './CommunityShared'
import { CommunityMessageBody } from './CommunityMessageBody'
import { communityError } from './communityHelpers'
import { intlLocale, txa } from '@/i18n/activeLocale'

export function CommunityPins({ channelId, onClose, onJump }: { channelId: string; onClose: () => void; onJump: (id: string) => void }) {
  const [rows, setRows] = useState<CommunityMessage[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState(''), [revision, setRevision] = useState(0)
  const refresh = useCallback(() => setRevision(v => v + 1), [])
  useEffect(() => {
    let live = true
    void communityV2.pins(channelId).then(next => { if (live) { setRows(next); setError('') } }).catch(e => { if (live) { setRows([]); setError(communityError(e)) } }).finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [channelId, revision])
  useEffect(() => {
    const unsub = communityV2.subscribe('channel', channelId, refresh)
    const timer = setInterval(refresh, 30000)
    return () => { unsub(); clearInterval(timer) }
  }, [channelId, refresh])
  return <CommunityModal title={txa('Sabitlenen mesajlar')} description={txa('Bu kanalın önemli mesajları. Bir kanalda en fazla 50 mesaj sabitlenebilir.')} onClose={onClose}>
    {error && <p className="cv2-error" role="alert">{error} <button onClick={refresh}>{txa('Yenile')}</button></p>}
    {loading ? <CommunityLoading /> : <div className="cv2-pins">{rows.map(row => <article key={row.id}>
      <CommunityIdentity user={{ ...row, user_id: row.author_id }} /><CommunityMessageBody message={row} />
      {!!row.attachments.length && <p>📎 {row.attachments.length}{' '}{txa('dosya ·')}{' '}{row.attachments.map(file=>file.name).join(', ')}</p>}
      <time dateTime={row.created_at}>{new Date(row.created_at).toLocaleString(intlLocale())}</time><button className="cv2-secondary" onClick={() => onJump(row.id)}>{txa('Mesaja git')}</button>
    </article>)}{!rows.length && !error && <p>{txa('Henüz sabitlenen mesaj yok.')}</p>}</div>}
  </CommunityModal>
}
