import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  SORT_OPTIONS,
  STATUS_OPTIONS,
  prettifyGenreName,
  type ExploreGenreItem,
  type ExploreSortId,
  type ExploreStatusId,
} from './explorePageShared'
import { txa } from '@/i18n/activeLocale'

interface ExploreToolbarProps {
  selectedStatus: ExploreStatusId
  selectedSort: ExploreSortId
  selectedGenres: string[]
  genresById: Map<string, ExploreGenreItem>
  activeFilterCount: number
  genrePanelOpen: boolean
  genreControl: ReactNode
  onStatusChange: (status: ExploreStatusId) => void
  onSortChange: (sort: ExploreSortId) => void
  onToggleGenre: (genreId: string) => void
  onClearFilters: () => void
  onOpenGenrePanel: (open: boolean) => void
}

export function ExploreToolbar({
  selectedStatus,
  selectedSort,
  selectedGenres,
  genresById,
  activeFilterCount,
  genrePanelOpen,
  genreControl,
  onStatusChange,
  onSortChange,
  onToggleGenre,
  onClearFilters,
}: ExploreToolbarProps) {
  return (
    <section className="flex flex-col gap-4 rounded-xl border border-border/80 bg-card/95 px-4 py-4 shadow-[0_20px_45px_-38px_rgba(15,23,42,0.2)] dark:bg-card/70 dark:shadow-none">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-2">
          {STATUS_OPTIONS.map((status) => (
            <button
              key={status.id}
              type="button"
              className={cn(
                'rounded-full px-3.5 py-2 text-xs font-medium transition-all',
                selectedStatus === status.id
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
              onClick={() => onStatusChange(status.id)}
            >
              {txa(status.name)}
            </button>
          ))}
        </div>

        <div className="hidden h-6 w-px bg-border lg:block" />

        <div className="flex flex-wrap gap-2">
          {SORT_OPTIONS.map((sort) => {
            const Icon = sort.icon
            return (
              <button
                key={sort.id}
                type="button"
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-medium transition-all',
                  selectedSort === sort.id
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
                onClick={() => onSortChange(sort.id)}
              >
                <Icon className="size-3.5" />
                {txa(sort.name)}
              </button>
            )
          })}
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {activeFilterCount > 0 ? (
            <Button type="button" variant="ghost" size="sm" className="rounded-full" onClick={onClearFilters}>
              {txa('Temizle')}
            </Button>
          ) : null}
        </div>
      </div>

      {genreControl ? (
        <div className="border-t border-border/70 pt-3">
          {genreControl}
        </div>
      ) : null}

      <div className="flex min-h-7 flex-wrap gap-1.5">
        {selectedGenres.map((genreId) => {
          const genre = genresById.get(genreId)
          return (
            <Badge
              key={genreId}
              variant="secondary"
              className={cn(
                'gap-1 rounded-full border border-border/80 bg-background/80 py-1 text-[11px] shadow-sm',
                genrePanelOpen && 'border-primary/30',
              )}
            >
              <span>{genre?.icon || '📖'}</span>
              <span>{txa(genre?.name || prettifyGenreName(genreId))}</span>
              <button
                type="button"
                className="ml-0.5 inline-flex size-4 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
                onClick={() => onToggleGenre(genreId)}
              >
                <X className="size-3" />
              </button>
            </Badge>
          )
        })}
      </div>
    </section>
  )
}
