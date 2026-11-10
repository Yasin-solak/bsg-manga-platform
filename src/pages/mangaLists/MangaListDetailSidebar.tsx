import { ArrowRight, Link2, Lock, Globe } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { MangaListDetail } from '@/services/mangaListService'
import { intlLocale, txa, getActiveLocale } from '@/i18n/activeLocale'
import { localizeHref } from '@/i18n/localizedRoutes'

/* ------------------------------------------------------------------ */
/*  Props                                                             */
/* ------------------------------------------------------------------ */
interface MangaListDetailSidebarProps {
  detail: MangaListDetail
  onShare: () => void
}

/* ------------------------------------------------------------------ */
/* Date helper */
/* ------------------------------------------------------------------ */
function timeAgo(value?: string | null): string {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '-'
  const diff = Date.now() - d.getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return txa('Az önce')
  if (mins < 60) return txa('{count} dk önce', { count: mins })
  const hours = Math.floor(mins / 60)
  if (hours < 24) return txa('{count} saat önce', { count: hours })
  const days = Math.floor(hours / 24)
  if (days < 30) return txa('{count} gün önce', { count: days })
  return d.toLocaleDateString(intlLocale())
}

/* ------------------------------------------------------------------ */
/* Tag extractor: #Fantasy, #Adventure etc. in the visual */
/* ------------------------------------------------------------------ */
function extractTags(detail: MangaListDetail): string[] {
  const tagSet = new Set<string>()
  for (const item of detail.items) {
    if (item.genres) {
      for (const g of item.genres) tagSet.add(g)
    }
  }
  return Array.from(tagSet)
}

/* ------------------------------------------------------------------ */
/* Sidebar component */
/* ------------------------------------------------------------------ */
export function MangaListDetailSidebar({
  detail,
  onShare,
}: MangaListDetailSidebarProps) {
  const tags = extractTags(detail)
  const sharePath = `/listeler/${encodeURIComponent(detail.id)}`
  const shareUrl = typeof window === 'undefined'
    ? sharePath
    : new URL(localizeHref(sharePath, getActiveLocale()), window.location.origin).toString()

  return (
    <div className="space-y-4">
      {/* ────────────────────── Etiketler ────────────────────── */}
      {tags.length > 0 ? <Card className="border-border/50 bg-card/70 p-4">
        <h3 className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
          <span className="text-primary">#</span> {txa('Etiketler')}
        </h3>
        <div className="flex flex-wrap gap-2">
          {tags.slice(0, 6).map((tag) => (
            <Badge
              key={tag}
              variant="outline"
              className="cursor-pointer border-border/60 text-xs transition-colors hover:border-primary/40 hover:text-primary"
            >
              #{tag}
            </Badge>
          ))}
          <span className="text-[11px] text-muted-foreground/70">{txa('Liste türlerinden türetildi')}</span>
        </div>
      </Card> : null}

      {/* ────────────────────── Paylaş ────────────────────── */}
      <Card className="border-border/50 bg-card/70 p-4">
        <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">
          {txa('Paylaş')}
        </h3>
        <div className="flex items-center gap-2">
          {/* Link kopyalama */}
          <Button size="icon" variant="outline" className="h-9 w-9 border-border/60" title={txa('Bağlantı Kopyala')} onClick={onShare}>
            <Link2 className="h-4 w-4" />
          </Button>
          {/* X (Twitter) */}
          <Button size="icon" variant="outline" asChild className="h-9 w-9 border-border/60" title={txa('X\'te Paylaş')}>
            <a href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(detail.title)}`} target="_blank" rel="noreferrer">
              <XIcon className="h-4 w-4" />
            </a>
          </Button>
          {/* Facebook */}
          <Button size="icon" variant="outline" asChild className="h-9 w-9 border-border/60" title="Facebook">
            <a href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`} target="_blank" rel="noreferrer">
              <FacebookIcon className="h-4 w-4" />
            </a>
          </Button>
          {/* Discord */}
          <Button size="icon" variant="outline" className="h-9 w-9 border-border/60" title={txa('Discord')} onClick={onShare}>
            <DiscordIcon className="h-4 w-4" />
          </Button>
          {/* WhatsApp */}
          <Button size="icon" variant="outline" asChild className="h-9 w-9 border-border/60" title="WhatsApp">
            <a href={`https://wa.me/?text=${encodeURIComponent(`${detail.title} ${shareUrl}`)}`} target="_blank" rel="noreferrer">
              <WhatsAppIcon className="h-4 w-4" />
            </a>
          </Button>
        </div>
      </Card>

      {/* ────────────────────── Liste Ayarları ────────────────────── */}
      <Card className="border-border/50 bg-card/70 p-4">
        <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">
          {txa('Liste Ayarları')}
        </h3>
        <div className="space-y-2.5 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">{txa('Gizlilik')}</span>
            <span className="flex items-center gap-1 font-medium text-foreground">
              {detail.isPublic ? (
                <>
                  <Globe className="h-3 w-3" /> {txa('Herkese Açık')}
                  <ArrowRight className="h-3 w-3 text-muted-foreground" />
                </>
              ) : (
                <>
                  <Lock className="h-3 w-3" /> {txa('Özel')}
                </>
              )}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">{txa('Güncelleme')}</span>
            <span className="font-medium text-foreground">{timeAgo(detail.updatedAt)}</span>
          </div>
        </div>
      </Card>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Social share icons (SVG) */
/* ------------------------------------------------------------------ */
function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  )
}

function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  )
}

function DiscordIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  )
}

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z" />
    </svg>
  )
}
