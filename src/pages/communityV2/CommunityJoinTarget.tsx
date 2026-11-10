import { useEffect, useState } from 'react'
import { communityV2, type CommunityChannelEntry } from '@/services/communityV2Service'
import { CommunityAvatar, CommunityLoading } from './CommunityShared'
import { communityError } from './communityHelpers'
import { txa } from '@/i18n/activeLocale'

export function CommunityJoinTarget({ channelId, serverId, joined, reset }: {
  channelId: string; serverId: string | null; joined: (serverId: string) => Promise<void>; reset: () => void;
}) {
  const [entry, setEntry] = useState<CommunityChannelEntry | null>(null), [error, setError] = useState(''), [loading, setLoading] = useState(true)
  const [pending, setPending] = useState(false)
  const [busy, setBusy] = useState(false), [revision, setRevision] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setEntry(null); setError('')
    if (!channelId) { setError(txa('Sunucu bağlantısı kullanılamıyor. Sunucuları keşfet bölümünden katılabilirsin.')); setLoading(false); return }
    void communityV2.channelEntry(channelId, controller.signal).then(next => {
      if (controller.signal.aborted) return
      if (serverId && next.server_id !== serverId) { setError(txa('Kanal ile sunucu bağlantısı eşleşmiyor.')); return }
      setEntry(next)
    }).catch(e => { if (!controller.signal.aborted) setError(communityError(e)) }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [channelId, serverId, revision])
  async function join() {
    if (!entry || busy) return
    setBusy(true); setError('')
    try {
      if (!entry.is_member) { const result = await communityV2.write('join', { server_id: entry.server_id }); if (result.pending) { setPending(true); return } }
      await joined(entry.server_id)
    } catch (e) { setError(communityError(e)) } finally { setBusy(false) }
  }
  return loading ? <CommunityLoading /> : <div className="cv2-empty">
    {entry && <><CommunityAvatar url={entry.avatar_url} name={entry.fansub_name} /><h1>{entry.fansub_name}</h1><h2>#{entry.channel_name}</h2><p>{entry.is_member ? txa('Bu sunucuya üyesin. Seçilen sohbeti açabilirsin.') : txa('Sohbet etmek için fansubun topluluğuna katıl. Bu işlem çeviri ekibine üyelik veya yönetim yetkisi vermez.')}</p><button className="cv2-primary" disabled={busy || pending} onClick={() => void join()}>{pending ? txa('Başvurun yönetici onayı bekliyor') : busy ? txa('Açılıyor…') : entry.is_member ? txa('Sohbeti aç') : entry.join_mode === 'request' ? txa('Katılım iste') : txa('Sunucuya katıl ve sohbeti aç')}</button></>}
    {error && <p role="alert" className="cv2-error">{error}</p>}
    {!entry && <button onClick={() => setRevision(v => v + 1)}>{txa('Yeniden dene')}</button>}<button disabled={busy} onClick={reset}>{txa('Topluluk ana ekranı')}</button>
  </div>
}
