import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { Link } from '@/i18n/router'
import { Button } from '@/components/ui/button'
import { kindLabels } from '@/services/announcementV2'
import { useAnnouncements } from '@/components/announcements/useAnnouncements'
import { AnnouncementDetail, AnnouncementDialog, AnnouncementSkeleton, AnnouncementSummary } from '@/components/announcements/AnnouncementsPanel'
import { txa } from '@/i18n/activeLocale'

export function AnnouncementsPage() {
  const { id } = useParams()
  return <section aria-label={txa('Duyuru merkezi')} className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-8 sm:py-10">
    <header className="mb-6"><h1 className="text-2xl font-bold">{txa('Duyurular')}</h1><p className="mt-2 text-sm text-muted-foreground">{txa('BSG Manga’dan haberler, ödüller ve davetler.')}</p></header>
    {id ? <><Link className="mb-5 inline-block text-sm text-primary" to="/duyurular">{txa('← Tüm duyurular')}</Link><AnnouncementDetail key={id} id={id} /></> : <AnnouncementFeed />}
  </section>
}
function AnnouncementFeed() {
  const [kind, setKind] = useState('')
  const [offset, setOffset] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const { items, loading, error, refresh } = useAnnouncements({ kind: kind || undefined, offset, limit: 20 })
  return <>
      <div className="mb-5 flex flex-wrap gap-2" aria-label={txa('Duyuru türü')}>{[['', txa('Tümü')], ...Object.entries(kindLabels)].map(([key, label]) => <Button key={key} size="sm" variant={kind === key ? 'default' : 'outline'} aria-pressed={kind === key} onClick={() => { setKind(key); setOffset(0) }}>{label}</Button>)}</div>
      <div className="rounded-xl border bg-card p-4 sm:p-6">{loading && !items.length ? <><AnnouncementSkeleton /><AnnouncementSkeleton /></> : error ? <div role="alert">{error}<Button onClick={refresh}>{txa('Tekrar dene')}</Button></div> : !items.length ? <p className="py-8 text-sm text-muted-foreground">{txa('Bu bölümde aktif duyuru bulunmuyor.')}</p> : <div className="divide-y">{items.map(a => <AnnouncementSummary key={a.id} item={a} onOpen={() => setSelected(a.id)} />)}</div>}</div>
      <nav className="mt-4 flex justify-between" aria-label={txa('Duyuru sayfaları')}><Button variant="outline" disabled={offset === 0 || loading} onClick={() => setOffset(o => Math.max(0, o - 20))}>{txa('Önceki')}</Button><Button variant="outline" disabled={items.length < 20 || loading} onClick={() => setOffset(o => o + 20)}>{txa('Sonraki')}</Button></nav>
      <AnnouncementDialog id={selected} onClose={() => setSelected(null)} />
    </>
}
export default AnnouncementsPage
