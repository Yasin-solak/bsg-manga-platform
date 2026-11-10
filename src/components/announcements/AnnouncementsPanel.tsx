import { useEffect, useState } from 'react'
import { Link } from '@/i18n/router'
import { ArrowRight, Megaphone } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/contexts/AuthContext'
import { kindLabels, respondToAnnouncement, safeAnnouncementUrl, type Announcement } from '@/services/announcementV2'
import { AnnouncementContent, AnnouncementInlineText } from './AnnouncementContent'
import { AnnouncementActions } from './AnnouncementActions'
import { useAnnouncements } from './useAnnouncements'
import { intlLocale, txa } from '@/i18n/activeLocale'

export function AnnouncementSkeleton() {
  return <div role="status" aria-label={txa('Duyurular yükleniyor')} className="space-y-3 py-3"><div className="h-3 w-20 rounded bg-muted motion-safe:animate-pulse" /><div className="h-4 w-4/5 rounded bg-muted motion-safe:animate-pulse" /><div className="h-3 w-full rounded bg-muted motion-safe:animate-pulse" /></div>
}
export function AnnouncementSummary({ item, onOpen }: { item: Announcement; onOpen: () => void }) {
  const { currentUser } = useAuth()
  const text = item.document.find(b => b.type === 'text')
  const image = item.document.find(b => b.type === 'image')
  const [failedImage, setFailedImage] = useState<string | null>(null)
  const className = "absolute inset-0 z-0 rounded-lg focus-visible:outline-primary"
  const content = <>
    <div className="mb-1.5 flex items-center gap-2 text-[10px] font-semibold"><span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary">{kindLabels[item.kind]}</span>
      {item.priority > 0 && <span className="text-muted-foreground">{txa('Sabitlendi')}</span>}<time className="ml-auto text-muted-foreground" dateTime={item.startsAt}>{new Date(item.startsAt).toLocaleDateString(intlLocale(), { day: 'numeric', month: 'short' })}</time></div>
    <div className="flex gap-3">
      {image?.type === 'image' && image.url !== failedImage && safeAnnouncementUrl(image.url) && <img src={image.url} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailedImage(image.url)} className="size-16 shrink-0 rounded-lg object-cover" />}
      <div className="min-w-0 flex-1"><h3 className="line-clamp-2 break-words text-sm font-bold group-hover:text-primary">{txa(item.title)}</h3>
      {text?.type === 'text' && <div className={`mt-1 line-clamp-2 break-words text-xs leading-5 ${text.highlight ? 'rounded bg-primary/10 px-2 text-foreground' : 'text-muted-foreground'}`}><AnnouncementInlineText text={txa(text.text)} references={item.references} /></div>}</div>
    </div>
    {(item.kind === 'reward' || item.kind === 'invitation') && <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary">{item.kind === 'reward' ? txa('Ödülü incele') : txa('Daveti aç')}<ArrowRight className="size-3" /></span>}
  </>
  const direct = item.action.type === 'link' && item.action.direct && safeAnnouncementUrl(item.action.url)
  const track = () => { if (currentUser) { void respondToAnnouncement(item.id, 'click').catch(() => {}); if (direct) void respondToAnnouncement(item.id, 'link').catch(() => {}) } }
  const trigger = direct && item.action.type === 'link'
    ? item.action.url.startsWith('/') ? <Link to={item.action.url} className={className} onClick={track} aria-label={txa(item.title)} />
      : <a href={item.action.url} target="_blank" rel="noopener noreferrer" className={className} onClick={track} aria-label={txa('{title} (yeni sekme)', { title: item.title })} />
    : <button type="button" onClick={() => { track(); onOpen() }} className={className} aria-label={txa(item.title)} />
  return <div className="group relative w-full min-w-0 py-3 text-left">{trigger}<div className="pointer-events-none relative">{content}
    {direct && item.action.type === 'link' && <span className="mt-2 block text-xs text-primary">{txa(item.action.label)} →</span>}
  </div></div>
}
export function AnnouncementDetail({ id }: { id: string }) {
  const { items, loading, error, refresh } = useAnnouncements({ id, limit: 1 })
  const { currentUser } = useAuth()
  const a = items[0]
  const entryId = a?.id
  const userId = currentUser?.id
  useEffect(() => { if (entryId && userId) void respondToAnnouncement(entryId, 'view').catch(() => { /* Görüntüleme sayacı içeriği engellemez. */ }) }, [entryId, userId])
  if (!a && loading) return <AnnouncementSkeleton />
  if (error) return <div role="alert"><p>{error}</p><Button variant="outline" onClick={refresh}>{txa('Tekrar dene')}</Button></div>
  if (!a) return <p className="py-8 text-sm text-muted-foreground">{txa('Bu duyuru sona ermiş veya hesabına açık olmayabilir.')}</p>
  return <article><div className="mb-3 text-xs font-semibold text-primary">{kindLabels[a.kind]}</div><h2 className="mb-4 break-words text-2xl font-bold">{txa(a.title)}</h2>
    <AnnouncementContent announcement={a} /><AnnouncementActions announcement={a} refresh={refresh} />
    {a.endsAt && <p className="mt-4 text-xs text-muted-foreground">{txa('Bitiş: {v1}', { v1: new Date(a.endsAt).toLocaleString(intlLocale()) })}</p>}</article>
}
export function AnnouncementDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  return <Dialog open={!!id} onOpenChange={open => { if (!open) onClose() }}><DialogContent className="max-h-[90dvh] overflow-y-auto pb-[calc(1.5rem+env(safe-area-inset-bottom))] max-lg:top-auto max-lg:bottom-0 max-lg:max-w-full max-lg:translate-y-0 max-lg:rounded-b-none sm:max-w-full lg:max-w-xl">
    <DialogTitle className="sr-only">{txa('Duyuru ayrıntıları')}</DialogTitle>{id && <AnnouncementDetail id={id} />}
  </DialogContent></Dialog>
}
export function AnnouncementsPanel({ mobile = false }: { mobile?: boolean }) {
  const { items, loading, error, refresh } = useAnnouncements({ home: true, limit: 3 })
  const [selected, setSelected] = useState<string | null>(null)
  if (!loading && !error && !items.length) return null
  return <section className={mobile ? 'mx-4 mt-4 rounded-xl border border-border/60 bg-card px-4 py-3' : 'rounded-xl border border-border/60 bg-card p-4 shadow-sm'} aria-label={txa('Duyurular')}>
    <header className="flex items-center justify-between gap-2"><h2 className="flex items-center gap-2 text-sm font-bold"><Megaphone className="size-4 text-primary" />{txa('DUYURULAR')}</h2>
      <Link to="/duyurular" className="inline-flex items-center gap-1 py-1 text-xs text-muted-foreground hover:text-primary">{txa('Tümünü gör')}<ArrowRight className="size-3" /></Link></header>
    {loading && !items.length ? <AnnouncementSkeleton /> : error ? <div className="py-3 text-xs" role="alert">{error}<Button variant="ghost" size="sm" onClick={refresh}>{txa('Tekrar dene')}</Button></div> : <div className={mobile ? 'flex snap-x snap-mandatory gap-4 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden' : 'divide-y divide-border/60'}>
      {items.map(a => <div key={a.id} className={mobile ? `${items.length > 1 ? 'w-[85%]' : 'w-full'} shrink-0 snap-start` : ''}><AnnouncementSummary item={a} onOpen={() => setSelected(a.id)} /></div>)}
    </div>}<AnnouncementDialog id={selected} onClose={() => setSelected(null)} />
  </section>
}
