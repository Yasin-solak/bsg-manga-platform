import { Link } from '@/i18n/router'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { BookOpen, Clock3, Play } from 'lucide-react'
import { intlLocale, txa } from '@/i18n/activeLocale'

type MangaContinueReadingCardProps = {
  chapterNumber: number
  continueUrl: string
  readAt: string | null
  title?: string
}

function formatReadAt(value: string | null) {
  if (!value) return txa('Son okuduğun bölüm')
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return txa('Son okuduğun bölüm')
  return parsed.toLocaleString(intlLocale())
}

export default function MangaContinueReadingCard({
  chapterNumber,
  continueUrl,
  readAt,
  title,
}: MangaContinueReadingCardProps) {
  return (
    <Card className="border-primary/20 bg-[radial-gradient(circle_at_top_left,hsl(var(--primary)/0.12),transparent_42%),linear-gradient(180deg,hsl(var(--card)),hsl(var(--muted)/0.28))] shadow-none">
      <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="inline-flex items-center gap-2">
            <BookOpen className="size-4.5 text-primary" />
            <span className="text-base font-semibold text-foreground">{txa('Devam Et / Kaldığın Yerden Oku')}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{txa('{v1}. Bolum', { v1: chapterNumber })}</Badge>
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Clock3 className="size-3.5" />
              {formatReadAt(readAt)}
            </span>
          </div>
          <p className="m-0 text-sm leading-6 text-muted-foreground">
            {title
              ? txa('"{title}" bölümünden devam edebilirsin.', { title })
              : txa('En son açtığın bölüm burada hatırlanıyor.')}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          <Button asChild className="gap-1.5">
            <Link to={continueUrl}>
              <Play className="size-3.5" />
              {txa('Kaldığın Yerden Oku')}
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to={`${continueUrl}#chapter-list`}>{txa('Bölüm Listesine Git')}</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
