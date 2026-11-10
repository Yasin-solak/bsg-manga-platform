import { Link } from '@/i18n/router'
import { ChevronRight } from 'lucide-react'
import { buildExplorePath } from '@/lib/routes'
import type { RecommendedManga } from '@/services/recommendationService'
import { ExploreSeriesCard } from './ExploreSeriesCard'
import { txa } from '@/i18n/activeLocale'

/**
 * "FOR YOU" horizontal rail (prototype: first section of Explore).
 *
 * REASONS ARE NOT INVENTED. `get_recommended_mangas` (migration 271) returns which
 * genres matched; the line under the card is exactly that.
 * With no match personalization is not faked: same rule as "Similar
 * series" on the series page and onboarding.
 *
 * The section title feeds from the same source ("From your Action · Fantasy
 * interests"): in the prototype the text there is not fixed but the user's
 * own genres.
 */

interface ExploreForYouRailProps {
  items: RecommendedManga[]
  loading?: boolean
}

function reasonFor(matchedGenres: string[]): string | undefined {
  if (matchedGenres.length === 0) return txa('Şu an çok okunuyor')
  return txa('{genre} sevenlere', { genre: txa(matchedGenres[0]) })
}

export function ExploreForYouRail({ items, loading = false }: ExploreForYouRailProps) {
  if (loading) {
    return (
      <section data-testid="explore-for-you-loading">
        <div className="h-4 w-32 animate-pulse rounded bg-muted" />
        <div className="mt-3 flex gap-3 overflow-hidden">
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="aspect-[3/4] w-[150px] shrink-0 animate-pulse rounded-[14px] bg-muted" />
          ))}
        </div>
      </section>
    )
  }

  if (items.length === 0) return null

  // Basligin alt satiri: motorun GERCEKTEN eslestirdigi turler.
  const interestGenres = Array.from(new Set(
    items.flatMap((item) => item.matchedGenres),
  )).slice(0, 2)

  return (
    <section data-testid="explore-for-you">
      <div className="flex items-baseline justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="m-0 text-[13px] font-black uppercase tracking-[0.045em]">{txa('Sana özel')}</h2>
          <p className="m-0 mt-1 truncate text-[11.5px] font-bold text-muted-foreground">
            {interestGenres.length > 0
              ? txa('{genres} ilgi alanlarından', { genres: interestGenres.map((genre) => txa(genre)).join(' · ') })
              : txa('Şu an çok okunanlardan')}
          </p>
        </div>
        <Link
          to={buildExplorePath({})}
          className="inline-flex min-h-11 shrink-0 items-center pl-2.5 text-[12.5px] font-bold text-primary"
        >
          {txa('Tümü')}
          <ChevronRight className="size-[15px]" />
        </Link>
      </div>

      <div className="hide-scrollbar mt-3 flex gap-3 overflow-x-auto">
        {items.map(({ manga, matchedGenres }) => (
          <ExploreSeriesCard
            key={manga.id}
            manga={manga}
            reason={reasonFor(matchedGenres)}
            variant="rail"
          />
        ))}
      </div>
    </section>
  )
}
