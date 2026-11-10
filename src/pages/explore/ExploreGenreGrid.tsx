import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { ExploreGenreItem } from './explorePageShared'
import { intlLocale, txa } from '@/i18n/activeLocale'

/**
 * "BY GENRE" grid (prototype: Explore).
 *
 * Two columns, each card with icon + genre name + SERIES COUNT. The count comes from
 * `getGenreCounts()`, so it is a real catalog count, not text like the prototype's
 * "412 series" based on nothing.
 *
 * A genre with ZERO count is not drawn: a button leading to an empty door is worse
 * than no door.
 *
 * Measures from the prototype: card min-h 56 r14, icon box 32x32 r10, name
 * 12.5/800, count 10.5/700.
 */

const PREVIEW_COUNT = 6

interface ExploreGenreGridProps {
  genres: ExploreGenreItem[]
  selectedGenres: string[]
  onSelectGenre: (genreId: string) => void
}

export function ExploreGenreGrid({ genres, selectedGenres, onSelectGenre }: ExploreGenreGridProps) {
  const [expanded, setExpanded] = useState(false)

  const withSeries = genres.filter((genre) => (genre.count || 0) > 0)
  if (withSeries.length === 0) return null

  const visible = expanded ? withSeries : withSeries.slice(0, PREVIEW_COUNT)
  const hiddenCount = withSeries.length - PREVIEW_COUNT

  return (
    <section data-testid="explore-genre-grid">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="m-0 text-[14px] font-extrabold uppercase tracking-[0.045em]">{txa('Türlere göre')}</h2>
        {hiddenCount > 0 ? (
          <button
            type="button"
            data-testid="explore-genre-grid-toggle"
            onClick={() => setExpanded((previous) => !previous)}
            className="min-h-11 shrink-0 pl-2.5 text-[13px] font-bold text-primary transition-opacity hover:opacity-75"
          >
            {expanded ? txa('Daha az') : txa('Tümü ({count})', { count: withSeries.length })}
          </button>
        ) : null}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-[9px] sm:grid-cols-3 lg:grid-cols-4">
        {visible.map((genre) => {
          const selected = selectedGenres.includes(genre.id)
          return (
            <button
              key={genre.id}
              type="button"
              aria-pressed={selected}
              data-testid={`explore-genre-card-${genre.id}`}
              onClick={() => onSelectGenre(genre.id)}
              className={cn(
                'flex min-h-14 items-center gap-2.5 rounded-[14px] border px-3 py-2.5 text-left transition-colors',
                selected
                  ? 'border-primary bg-primary/10'
                  : 'border-border bg-card hover:border-primary/50 hover:bg-accent',
              )}
            >
              <span
                aria-hidden="true"
                className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-muted text-[17px]"
              >
                {genre.icon || '📖'}
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn(
                  'block truncate text-[12.5px] font-extrabold leading-tight tracking-[-0.01em]',
                  selected && 'text-primary',
                )}>
                  {txa(genre.name)}
                </span>
                <span className="mt-[3px] block text-[10.5px] font-bold text-muted-foreground">
                  {txa('{count} seri', { count: (genre.count || 0).toLocaleString(intlLocale()) })}
                </span>
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
