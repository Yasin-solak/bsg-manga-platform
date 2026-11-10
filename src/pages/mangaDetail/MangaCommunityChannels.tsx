import { useEffect, useState } from 'react'
import { Link } from '@/i18n/router'
import { MessageCircle, LockKeyhole } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useCommunityAvailability } from '@/contexts/CommunityAvailabilityContext'
import { communityV2, type CommunityChannelEntry } from '@/services/communityV2Service'
import { communityChannelPath } from '@/lib/communityNavigation'
import { communityError } from '@/pages/communityV2/communityHelpers'
import { txa } from '@/i18n/activeLocale'

export default function MangaCommunityChannels({ mangaId }: { mangaId: string }) {
  const { enabled } = useCommunityAvailability()
  return enabled ? <EnabledMangaCommunityChannels mangaId={mangaId} /> : null
}

function EnabledMangaCommunityChannels({ mangaId }: { mangaId: string }) {
  const { currentUser, loading: authLoading } = useAuth()
  const userId = currentUser?.id
  const [rows, setRows] = useState<CommunityChannelEntry[]>([]), [page, setPage] = useState(0), [revision, setRevision] = useState(0)
  const [loading, setLoading] = useState(true), [error, setError] = useState('')
  useEffect(() => {
    if (authLoading) return
    const controller = new AbortController()
    setRows([]); setLoading(true); setError('')
    void communityV2.seriesChannels(mangaId, page * 20, controller.signal).then(data => { if (!controller.signal.aborted) setRows(data) })
      .catch(e => { if (!controller.signal.aborted) setError(communityError(e)) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [mangaId, userId, authLoading, page, revision])
  if (!loading && !error && !rows.length && !page) return null
  return <section aria-label={txa('Serinin topluluk kanalları')} className="rounded-xl border border-border bg-card p-4">
    <h2 className="mb-3 flex items-center gap-2 font-semibold"><MessageCircle size={18} /> {txa('Seri sohbetleri')}</h2>
    {loading ? <div className="h-12 animate-pulse rounded-lg bg-muted" role="status" aria-label={txa('Sohbetler yükleniyor')} /> : error ? <p role="alert" className="text-sm text-destructive">{error} <button onClick={() => setRevision(v => v + 1)} className="underline">{txa('Yeniden dene')}</button></p> : <div className="space-y-2">{rows.slice(0, 20).map(row => <Link key={row.channel_id} to={communityChannelPath(row.server_id, row.channel_id)} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3 hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
      <span className="min-w-0"><strong className="block break-words text-sm">{row.fansub_name}</strong><span className="flex items-center gap-1 break-words text-xs text-muted-foreground">{row.is_private && <LockKeyhole size={12} />}#{row.channel_name}</span></span>
      <span className="text-sm text-primary">{row.is_member ? txa('Sohbeti aç') : txa('Katıl ve sohbet et')} →</span>
    </Link>)}</div>}
    {(page > 0 || rows.length > 20) && <div className="mt-3 flex justify-between text-sm"><button disabled={!page || loading} onClick={() => setPage(v => v - 1)}>{txa('Önceki')}</button><span>{txa('Sayfa {v1}', { v1: page + 1 })}</span><button disabled={rows.length <= 20 || loading} onClick={() => setPage(v => v + 1)}>{txa('Sonraki')}</button></div>}
  </section>
}
