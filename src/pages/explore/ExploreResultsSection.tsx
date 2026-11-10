import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import type { Manga } from '@/types'
import { ExploreEmptyStateIllustration } from './ExploreEmptyStateIllustration'
import { ExploreSeriesCard } from './ExploreSeriesCard'
import { txa } from '@/i18n/activeLocale'

interface ExploreResultsSectionProps {
  mangas: Manga[]
  /** Only for the skeleton count; the title is now in the page's CATALOG tabs. */
  totalMangas: number
  loading: boolean
  isLoadingMore: boolean
  loadError: string | null
  loadMoreError: string | null
  hasMoreMangas: boolean
  hasActiveFilters: boolean
  toolbar?: ReactNode
  onLoadMore: () => void
  onClearFilters: () => void
}

function ExploreMangaCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-[0_18px_38px_-34px_rgba(15,23,42,0.18)] dark:bg-card/70 dark:shadow-none">
      <div className="aspect-[3/4] animate-pulse bg-muted" />
      <div className="flex flex-col gap-3 px-3.5 py-3.5">
        <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
        <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
        <div className="h-10 animate-pulse rounded-xl bg-muted" />
      </div>
    </div>
  )
}

function ErrorIcon() {
  return (
    <span className="text-xl font-semibold text-destructive">
      x
    </span>
  )
}

export function ExploreResultsSection({
  mangas,
  loading,
  isLoadingMore,
  loadError,
  loadMoreError,
  hasMoreMangas,
  hasActiveFilters,
  toolbar,
  onLoadMore,
  onClearFilters,
}: ExploreResultsSectionProps) {
  return (
    <section className="flex flex-col gap-4">
      {toolbar ? <div>{toolbar}</div> : null}

      {loadError ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-destructive/20 bg-destructive/5 px-6 py-14 text-center">
          <div className="mb-4 inline-flex size-14 items-center justify-center rounded-full bg-destructive/10">
            <ErrorIcon />
          </div>
          <h3 className="text-lg font-semibold text-foreground">{txa('Liste yüklenemedi')}</h3>
          <p className="mt-2 text-sm text-muted-foreground">{loadError}</p>
        </div>
      ) : null}

      {!loadError && !loading && mangas.length === 0 ? (
        <div data-explore-empty-state className="flex min-h-[1220px] flex-col items-center justify-center rounded-xl border border-border/80 bg-card/90 px-6 py-14 text-center shadow-[0_20px_45px_-38px_rgba(15,23,42,0.16)] dark:bg-card/60 dark:shadow-none 2xl:min-h-[940px]">
          <ExploreEmptyStateIllustration />
          <h3 className="text-lg font-semibold text-foreground">{txa('Ejderha arşivi biraz fazla yaktı')}</h3>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            {txa('Bu filtrelerle eşleşen seri kalmadı. Birkaç filtreyi gevşetirsen ejderhayı sakinleştirebiliriz.')}
          </p>
          {hasActiveFilters ? (
            <Button className="mt-5 rounded-full px-5" onClick={onClearFilters}>
              {txa('Filtreleri Temizle')}
            </Button>
          ) : null}
        </div>
      ) : null}

      {mangas.length > 0 || (loading && !loadError) ? (
        <div className="flex flex-col gap-5">
          <div data-hover-card-boundary className="grid min-h-[1220px] content-start grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 2xl:min-h-[940px] 2xl:grid-cols-5">
            {mangas.map((manga) => (
              <ExploreSeriesCard key={manga.id} manga={manga} />
            ))}

            {loading && mangas.length === 0
              ? Array.from({ length: 10 }).map((_, index) => (
                <ExploreMangaCardSkeleton key={`skeleton-${index}`} />
              ))
              : null}
          </div>

          {loadMoreError ? (
            <p className="text-center text-sm text-destructive">{loadMoreError}</p>
          ) : null}

          {hasMoreMangas ? (
            <div className="flex justify-center pt-1">
              <Button
                type="button"
                variant="outline"
                className="rounded-full px-5"
                onClick={onLoadMore}
                disabled={isLoadingMore}
              >
                {isLoadingMore ? txa('Yukleniyor...') : txa('Daha fazla yükle')}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
