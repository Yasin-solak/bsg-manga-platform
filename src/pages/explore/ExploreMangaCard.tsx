import { Link } from '@/i18n/router'
import { BookOpenText, Star } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { Manga } from '@/types'
import { buildCoverPlaceholder } from '@/lib/coverPlaceholder'
import { optimizePublicImageUrl } from '@/lib/optimizedPublicImageUrl'
import { buildPublicMangaPath } from '@/lib/routes'
import { txa } from '@/i18n/activeLocale'

interface ExploreMangaCardProps {
  manga: Manga
}

function formatStatusLabel(status?: Manga['status']) {
  if (status === 'ongoing') return txa('Devam ediyor')
  if (status === 'completed') return txa('Tamamlandı')
  if (status === 'hiatus') return txa('Ara verdi')
  return ''
}

export function ExploreMangaCard({ manga }: ExploreMangaCardProps) {
  const path = buildPublicMangaPath({ id: manga.id, slug: manga.slug, title: manga.title })
  const cover = optimizePublicImageUrl(manga.coverImage) || manga.coverImage || buildCoverPlaceholder(manga.title)
  const statusLabel = formatStatusLabel(manga.status)
  const ratingLabel = typeof manga.rating === 'number' && Number.isFinite(manga.rating)
    ? manga.rating.toFixed(1)
    : null
  const chapterLabel = manga.lastChapterTitle || manga.lastChapter || txa('Bölüm bilgisi yakında')
  const descriptionFallback = txa('Bu seri icin henuz kisa aciklama eklenmedi.')

  return (
    <Link
      to={path}
      className="group block h-full overflow-hidden rounded-xl border border-border/75 bg-card transition-colors hover:border-primary/35 hover:bg-card/90"
    >
      <div className="relative aspect-[3/4] overflow-hidden bg-muted">
        <img
          src={cover}
          alt={manga.title}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.035]"
          onError={(event) => {
            event.currentTarget.src = buildCoverPlaceholder(manga.title)
          }}
        />
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/85 to-transparent" />
        <div className="absolute left-2 top-2 flex flex-wrap gap-1.5">
          {statusLabel ? (
            <Badge className="border border-white/10 bg-black/55 text-[10px] font-bold text-white backdrop-blur">
              {statusLabel}
            </Badge>
          ) : null}
          {manga.isNew ? (
            <Badge className="border-0 bg-primary text-[10px] font-black text-primary-foreground">{txa('Yeni')}</Badge>
          ) : null}
        </div>
        {ratingLabel ? (
          <div className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-black/65 px-2 py-1 text-xs font-black text-amber-400">
            <Star className="size-3.5 fill-current" />
            {ratingLabel}
          </div>
        ) : null}
      </div>

      <div className="flex min-h-[128px] flex-col gap-2 p-3">
        <div>
          <h3 className="line-clamp-2 text-sm font-black leading-5 text-foreground group-hover:text-primary">
            {manga.title}
          </h3>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
            {manga.description || descriptionFallback}
          </p>
        </div>

        {manga.genres?.length ? (
          <div className="flex flex-wrap gap-1">
            {manga.genres.slice(0, 2).map((genre) => (
              <span key={genre} className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                {txa(genre)}
              </span>
            ))}
          </div>
        ) : null}

        <div className="mt-auto flex min-w-0 items-center gap-1.5 border-t border-border/65 pt-2 text-[11px] font-semibold text-muted-foreground">
          <BookOpenText className="size-3.5 shrink-0 text-primary" />
          <span className="truncate">{chapterLabel}</span>
        </div>
      </div>
    </Link>
  )
}
