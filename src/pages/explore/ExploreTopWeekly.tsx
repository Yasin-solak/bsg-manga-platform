import { Link } from '@/i18n/router'
import { Star } from 'lucide-react'
import { buildCoverPlaceholder } from '@/lib/coverPlaceholder'
import { optimizePublicImageUrl } from '@/lib/optimizedPublicImageUrl'
import { buildPublicMangaPath } from '@/lib/routes'
import { formatCompactCount, formatMangaRating } from '@/pages/mangaDetail/mangaDetailPage.utils'
import type { Manga } from '@/types'
import { txa } from '@/i18n/activeLocale'

/**
 * "TOP 5 THIS WEEK" (prototype: Explore).
 *
 * DELIBERATE DIFFERENCE FROM THE PROTOTYPE: no RANK CHANGE column on the right (↑+4, ↓−1).
 * In the prototype those values come from a handwritten fixed table
 * (`DC_TREND = { 'Gölge Savaşçı': 4, ... }`), so not real data there either.
 * We keep no record of last week's ranking; rather than draw an invented arrow
 * we leave the column out. If a weekly ranking snapshot is added
 * it plugs in here directly.
 *
 * "Updated on Mondays" is not written either: no such workflow was built.
 * Instead it says WHAT the list is sorted by.
 */

const TOP_COUNT = 5

interface ExploreTopWeeklyProps {
  mangas: Manga[]
  loading?: boolean
}

export function ExploreTopWeekly({ mangas, loading = false }: ExploreTopWeeklyProps) {
  const items = mangas.slice(0, TOP_COUNT)

  if (loading) {
    return (
      <section data-testid="explore-top-loading">
        <div className="h-4 w-36 animate-pulse rounded bg-muted" />
        <div className="mt-3 h-[380px] animate-pulse rounded-[18px] bg-muted" />
      </section>
    )
  }

  if (items.length === 0) return null

  return (
    <section data-testid="explore-top-weekly">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="m-0 text-[14px] font-extrabold uppercase tracking-[0.045em]">{txa('En çok okunan 5')}</h2>
        <span className="shrink-0 text-[11px] font-bold text-muted-foreground">
          {txa('Toplam okunmaya göre')}
        </span>
      </div>

      <div className="mt-3 overflow-hidden rounded-[18px] border border-border bg-card">
        {items.map((manga, index) => (
          <Link
            key={manga.id}
            to={buildPublicMangaPath({ id: manga.id, slug: manga.slug, title: manga.title })}
            data-testid="explore-top-row"
            className="flex items-center gap-3 border-b border-border/60 px-3.5 py-[11px] transition-colors last:border-b-0 hover:bg-accent"
          >
            <span
              className="w-[22px] shrink-0 text-center text-[19px] font-black tracking-[-0.03em] text-primary"
              aria-hidden="true"
            >
              {index + 1}
            </span>
            <img
              src={optimizePublicImageUrl(manga.coverImage) || manga.coverImage || buildCoverPlaceholder(manga.title)}
              alt=""
              loading="lazy"
              decoding="async"
              className="h-[58px] w-11 shrink-0 rounded-[10px] object-cover"
              onError={(event) => { event.currentTarget.src = buildCoverPlaceholder(manga.title) }}
            />
            <div className="min-w-0 flex-1">
              <p className="m-0 truncate text-[13.5px] font-extrabold">{manga.title}</p>
              <div className="mt-1 flex items-center gap-2 text-[11px] font-bold text-muted-foreground">
                {manga.rating != null ? (
                  <span className="inline-flex items-center gap-[3px] text-amber-500">
                    <Star className="size-[11px] fill-current" />
                    {formatMangaRating(manga.rating)}
                  </span>
                ) : null}
                {manga.views != null ? <span>{formatCompactCount(manga.views)}{' '}{txa('okunma')}</span> : null}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}
