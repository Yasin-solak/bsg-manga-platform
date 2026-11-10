import { Link } from '@/i18n/router'
import { ChevronRight, Star } from 'lucide-react'
import { buildExplorePath, buildPublicMangaPath } from '@/lib/routes'
import { similarReasonLabel } from './mangaDetailSimilar'
import type { RelatedMangaSuggestion } from '@/services/mangaService'
import { txa } from '@/i18n/activeLocale'

/**
 * The prototype's horizontal 'Similar series' strip. Sits BELOW the chapter list.
 *
 * Why only on narrow screens: on wide screens the same recommendations are fixed in the right
 * column. Showing both would show the same list twice.
 */

interface MangaDetailSimilarStripProps {
  items: RelatedMangaSuggestion[]
  loading?: boolean
  formatGenreLabel: (genre: string) => string
  /** Genres surrounding the series; the 'All' link goes to them. */
  genres?: string[]
}

export default function MangaDetailSimilarStrip({
  items,
  loading = false,
  formatGenreLabel,
  genres,
}: MangaDetailSimilarStripProps) {
  if (loading) {
    return (
      <section className="lg:hidden" data-testid="manga-detail-similar-loading">
        <div className="flex gap-[11px] overflow-hidden">
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="h-[150px] w-28 shrink-0 animate-pulse rounded-[13px] bg-muted" />
          ))}
        </div>
      </section>
    )
  }

  if (items.length === 0) return null

  const exploreTarget = genres && genres.length > 0
    ? buildExplorePath({ genres: genres[0].toLowerCase() })
    : buildExplorePath({})

  return (
    <section className="lg:hidden" data-testid="manga-detail-similar">
      <div className="flex items-baseline justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="m-0 text-[13px] font-black uppercase tracking-[0.045em]">{txa('Benzer seriler')}</h3>
          <p className="m-0 mt-1 truncate text-[11.5px] font-bold text-muted-foreground">
            {txa('Bu serinin türlerinden seçildi')}
          </p>
        </div>
        <Link
          to={exploreTarget}
          className="inline-flex min-h-11 shrink-0 items-center pl-2.5 text-[12.5px] font-bold text-primary"
        >
          {txa('Tümü')}
          <ChevronRight className="size-[15px]" />
        </Link>
      </div>

      <div className="hide-scrollbar mt-2 flex gap-[11px] overflow-x-auto">
        {items.map(({ manga, matchedGenres }) => (
          <Link
            key={manga.id}
            to={buildPublicMangaPath({ id: manga.id, slug: manga.slug, title: manga.title })}
            className="w-28 shrink-0"
            data-testid="manga-detail-similar-card"
          >
            <div className="relative h-[150px] overflow-hidden rounded-[13px] border border-border">
              <img
                src={manga.coverImage}
                alt=""
                loading="lazy"
                decoding="async"
                className="block size-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/[.78] from-[5%] to-transparent to-[46%]" />
              <div className="absolute inset-x-2 bottom-[7px] flex items-center gap-[5px] text-[10.5px] font-extrabold text-white">
                {manga.rating != null ? (
                  <span className="inline-flex items-center gap-[3px] text-amber-400">
                    <Star className="size-2.5 fill-current" />
                    {manga.rating.toFixed(1)}
                  </span>
                ) : null}
                {manga.lastChapter ? <span className="opacity-70">{manga.lastChapter}</span> : null}
              </div>
            </div>
            <p className="m-0 mt-[7px] line-clamp-2 text-xs font-extrabold leading-[1.3]">{manga.title}</p>
            <p
              className="m-0 mt-[3px] truncate text-[10.5px] font-bold text-primary"
              data-testid="manga-detail-similar-reason"
            >
              {similarReasonLabel(matchedGenres, formatGenreLabel)}
            </p>
          </Link>
        ))}
      </div>
    </section>
  )
}
