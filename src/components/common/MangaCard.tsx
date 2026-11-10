import { Link } from '@/i18n/router'
import { BookOpenText } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { MangaHoverCard } from '@/components/common/MangaHoverCard'
import { buildPublicMangaPath } from '@/lib/routes'
import { cn } from '@/lib/utils'
import { optimizePublicImageUrl } from '@/lib/optimizedPublicImageUrl'
import { txa } from '@/i18n/activeLocale'

interface MangaCardProps {
  id: string
  slug?: string
  title: string
  coverImage: string
  lastChapter?: string
  isNew?: boolean
  rating?: number
  hideChapter?: boolean
  description?: string
  status?: 'ongoing' | 'completed' | 'hiatus' | (string & {})
  className?: string
  descriptionFallback?: string
  chapterFallback?: string
  disableHover?: boolean
}

function sanitizeLabel(value?: string) {
  return (value || '').trim()
}

function formatStatusLabel(value?: MangaCardProps['status']) {
  if (value === 'ongoing') return txa('Devam ediyor')
  if (value === 'completed') return txa('Tamamlandı')
  if (value === 'hiatus') return txa('Ara verdi')
  return sanitizeLabel(value)
}

function MangaCard({
  id,
  slug,
  title,
  coverImage,
  lastChapter,
  isNew = false,
  hideChapter = false,
  description,
  status,
  className,
  descriptionFallback,
  chapterFallback = txa('Bölüm bilgisi yakında'),
  disableHover = false,
}: MangaCardProps) {
  const resolvedCoverImage = optimizePublicImageUrl(coverImage) || coverImage
  const chapterLabel = sanitizeLabel(lastChapter)
  const descriptionLabel = sanitizeLabel(description) || sanitizeLabel(descriptionFallback)
  const statusLabel = formatStatusLabel(status)
  const href = buildPublicMangaPath({ id, slug, title })
  const hoverProps = {
    id,
    title,
    coverImage,
    description,
    status,
    openDelayMs: 650,
    closeDelayMs: 180,
  }
  const coverContent = (
    <div className="relative aspect-[3/4] overflow-hidden">
      <img
        src={resolvedCoverImage}
        alt={title}
        loading="lazy"
        decoding="async"
        className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/18 to-black/0" />
      <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
        {statusLabel ? (
          <Badge className="border border-black/10 bg-background/85 text-foreground shadow-sm backdrop-blur-sm dark:border-white/10 dark:bg-black/45 dark:text-white">
            {statusLabel}
          </Badge>
        ) : null}
        {isNew ? (
          <Badge className="bg-primary text-primary-foreground shadow-sm">
            {txa('Yeni')}
          </Badge>
        ) : null}
      </div>
    </div>
  )
  const titleContent = (
    <h3 className="line-clamp-2 text-sm font-semibold leading-6 text-foreground transition group-hover:text-primary">
      {title}
    </h3>
  )

  return (
    <Link to={href} className={cn('block h-full group', className)}>
      <Card className="group relative h-full overflow-hidden rounded-[1.45rem] border border-border/85 bg-card py-0 shadow-[0_24px_50px_-42px_rgba(15,23,42,0.25)] transition duration-300 hover:-translate-y-1 hover:border-primary/35 hover:shadow-[0_26px_52px_-38px_rgba(124,58,237,0.24)] dark:bg-card/70 dark:shadow-none">
        <div className="relative">
          {disableHover ? (
            coverContent
          ) : (
            <MangaHoverCard {...hoverProps} className="block">
              {coverContent}
            </MangaHoverCard>
          )}
        </div>

        <div className="space-y-2.5 px-3.5 py-3">
          <div className="space-y-1.5">
            {disableHover ? (
              titleContent
            ) : (
              <MangaHoverCard {...hoverProps} className="block w-fit max-w-full">
                {titleContent}
              </MangaHoverCard>
            )}

            {descriptionLabel ? (
              <p className="line-clamp-2 text-xs leading-5 text-muted-foreground">
                {descriptionLabel}
              </p>
            ) : null}
          </div>

          {!hideChapter ? (
            <div className="flex items-center gap-2 border-t border-border/75 pt-2.5 text-[11px] text-muted-foreground">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-muted/60 px-2.5 py-1">
                <BookOpenText className="h-3.5 w-3.5 text-primary" />
                <span>{chapterLabel || chapterFallback}</span>
              </div>
            </div>
          ) : null}
        </div>
      </Card>
    </Link>
  )
}

export default MangaCard
