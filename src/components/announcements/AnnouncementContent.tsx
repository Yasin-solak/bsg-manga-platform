import { Fragment, useState, type ReactNode } from 'react'
import { Link } from '@/i18n/router'
import { ArrowUpRight, FileText } from 'lucide-react'
import { type Announcement, type AnnouncementReference, safeAnnouncementUrl } from '@/services/announcementV2'
import { AnnouncementMention } from './AnnouncementMention'
import { txa } from '@/i18n/activeLocale'

export function AnnouncementInlineText({ text, references, depth = 0, links = true }: { text: string; references: Announcement['references']; depth?: number; links?: boolean }) {
  if (depth > 3) return <>{text}</>
  const parts: ReactNode[] = []
  const pattern = /@\[(user|fansub):([\da-f-]{36})\]|\*\*([\s\S]+?)\*\*|==([\s\S]+?)==|\*([^*\n]+?)\*/gi
  let cursor = 0
  for (const match of text.matchAll(pattern)) {
    const at = match.index || 0
    parts.push(text.slice(cursor, at))
    if (match[1]) {
      const ref = references[`${match[1]}:${match[2]}`]
      parts.push(ref ? links ? <AnnouncementMention key={at} reference={ref} /> : <span key={at} className="font-semibold text-primary">{ref.title}</span> : <span key={at} className="text-muted-foreground">{txa('Kullanıcı')}</span>)
    } else {
      const value = <AnnouncementInlineText text={match[3] || match[4] || match[5]} references={references} depth={depth + 1} links={links} />
      parts.push(match[3] ? <strong key={at}>{value}</strong> : match[4] ? <mark key={at} className="rounded bg-primary/15 px-0.5 text-foreground">{value}</mark> : <em key={at}>{value}</em>)
    }
    cursor = at + match[0].length
  }
  parts.push(text.slice(cursor))
  return <>{parts}</>
}
function AnnouncementImage({ url, alt }: { url: string; alt: string }) {
  const [failed, setFailed] = useState(false)
  if (failed || !safeAnnouncementUrl(url)) return <p className="rounded-xl bg-muted p-4 text-xs text-muted-foreground">{txa('Görsel açılamadı: {v1}', { v1: alt })}</p>
  return <img src={url} alt={alt} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} className="max-h-80 w-full rounded-xl object-contain" />
}
function ReferenceCard({ reference, preview }: { reference: AnnouncementReference | null | undefined; preview: boolean }) {
  if (!reference) return <div className="rounded-xl border border-dashed p-3 text-xs text-muted-foreground">{txa('Bu içerik artık erişilebilir değil.')}</div>
  if (preview) return <div className="flex items-center gap-3 rounded-xl border bg-muted/20 p-3"><FileText className="size-5 shrink-0 text-primary" /><span className="break-words text-sm font-semibold">{reference.title}</span></div>
  if (reference.kind === 'user' || reference.kind === 'fansub') return <div className="rounded-xl border bg-muted/20 p-3"><AnnouncementMention reference={reference} /></div>
  return <Link to={reference.href} className="flex min-w-0 items-center gap-3 rounded-xl border bg-muted/20 p-3 transition-colors hover:bg-muted/60">
    <FileText className="size-5 shrink-0 text-primary" aria-hidden="true" /><span className="min-w-0 flex-1 break-words text-sm font-semibold">{reference.title}</span><ArrowUpRight className="size-4 shrink-0" aria-hidden="true" />
  </Link>
}
export function AnnouncementContent({ announcement, preview = false }: { announcement: Announcement; preview?: boolean }) {
  return <div className="space-y-3 break-words text-sm leading-6">
    {announcement.document.map((b, i) => <Fragment key={i}>
      {b.type === 'text' && <div className={`whitespace-pre-wrap ${b.highlight ? 'rounded-xl border-l-4 border-primary bg-primary/10 px-4 py-3 font-medium' : ''}`}><AnnouncementInlineText text={txa(b.text)} references={announcement.references} links={!preview} /></div>}
      {b.type === 'image' && <AnnouncementImage key={b.url} url={b.url} alt={b.alt} />}
      {b.type === 'reference' && <ReferenceCard reference={announcement.references[`${b.kind}:${b.id}`]} preview={preview} />}
    </Fragment>)}
  </div>
}
