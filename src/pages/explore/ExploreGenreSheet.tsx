import { ChevronDown, Search, SlidersHorizontal, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import type { ExploreGenreGroupKey, ExploreGenreItem } from './explorePageShared'
import { txa } from '@/i18n/activeLocale'

interface ExploreGenreSheetProps {
  isMobile: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  activeCount: number
  genreSearchQuery: string
  onGenreSearchChange: (value: string) => void
  groupedGenres: Record<ExploreGenreGroupKey, ExploreGenreItem[]>
  selectedGenres: string[]
  expandedCategories: Set<ExploreGenreGroupKey>
  onToggleCategory: (group: ExploreGenreGroupKey) => void
  onToggleGenre: (genreId: string) => void
  groupLabels: Record<ExploreGenreGroupKey, string>
}

function GenreChip({
  genre,
  selected,
  onClick,
}: {
  genre: ExploreGenreItem
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all',
        selected
          ? 'bg-primary text-primary-foreground shadow-sm'
          : 'bg-muted/70 text-foreground hover:bg-muted',
      )}
      onClick={onClick}
    >
      <span>{genre.icon}</span>
      <span>{txa(genre.name)}</span>
      {(genre.count ?? 0) > 0 ? (
        <span
          className={cn(
            'rounded-full px-1.5 py-0 text-[10px]',
            selected ? 'bg-primary-foreground/20' : 'bg-foreground/10',
          )}
        >
          {genre.count}
        </span>
      ) : null}
    </button>
  )
}

function GenrePanelBody({
  genreSearchQuery,
  onGenreSearchChange,
  groupedGenres,
  selectedGenres,
  expandedCategories,
  onToggleCategory,
  onToggleGenre,
  groupLabels,
}: Omit<ExploreGenreSheetProps, 'isMobile' | 'open' | 'onOpenChange' | 'activeCount'>) {
  const hasAnyGenre = Object.values(groupedGenres).some((items) => items.length > 0)

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="text"
          placeholder={txa('Tür ara...')}
          value={genreSearchQuery}
          onChange={(event) => onGenreSearchChange(event.target.value)}
          className="h-10 rounded-xl border-border/80 bg-background pl-9 pr-9 text-sm"
        />
        {genreSearchQuery ? (
          <button
            type="button"
            className="absolute right-2.5 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
            onClick={() => onGenreSearchChange('')}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>

      {selectedGenres.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {selectedGenres.map((genreId) => (
            <Badge key={genreId} variant="secondary" className="gap-1 py-1 text-[11px]">
              {genreId.replace(/-/g, ' ')}
            </Badge>
          ))}
        </div>
      ) : null}

      {hasAnyGenre ? (
        <div className="space-y-2 overflow-y-auto pr-1 md:max-h-[calc(100vh-13rem)]">
          {(Object.keys(groupLabels) as ExploreGenreGroupKey[]).map((groupKey) => {
            const items = groupedGenres[groupKey]
            if (items.length === 0) return null
            const isOpen = expandedCategories.has(groupKey)
            return (
              <div key={groupKey} className="overflow-hidden rounded-2xl border border-border/80 bg-background/70">
                <button
                  type="button"
                  className="flex w-full items-center justify-between px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground transition hover:bg-muted/60"
                  onClick={() => onToggleCategory(groupKey)}
                >
                  <span>
                    {groupLabels[groupKey]} <span className="text-muted-foreground/70">({items.length})</span>
                  </span>
                  <ChevronDown className={cn('h-4 w-4 transition-transform', isOpen && 'rotate-180')} />
                </button>
                {isOpen ? (
                  <div className="flex flex-wrap gap-2 border-t border-border/70 p-3">
                    {items.map((genre) => (
                      <GenreChip
                        key={genre.id}
                        genre={genre}
                        selected={selectedGenres.includes(genre.id)}
                        onClick={() => onToggleGenre(genre.id)}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-border/80 bg-background/70 px-4 py-5 text-sm text-muted-foreground">
          {txa('Tür bulunamadı.')}
        </div>
      )}
    </div>
  )
}

export function ExploreGenreSheet({
  isMobile,
  open,
  onOpenChange,
  activeCount,
  ...props
}: ExploreGenreSheetProps) {
  const trigger = (
    <Button
      type="button"
      variant={open || activeCount > 0 ? 'default' : 'outline'}
      className="h-10 rounded-full px-4"
    >
      <SlidersHorizontal className="mr-2 h-4 w-4" />
      {txa('Türler')}
      {activeCount > 0 ? (
        <span className="ml-1 rounded-full bg-primary-foreground/15 px-1.5 py-0.5 text-[10px]">
          {activeCount}
        </span>
      ) : null}
    </Button>
  )

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        {trigger}
      </SheetTrigger>
      <SheetContent
        side={isMobile ? 'bottom' : 'right'}
        className={cn(
          'px-0 pb-0',
          isMobile
            ? 'max-h-[86vh] rounded-t-[2rem]'
            : 'w-full max-w-[430px] border-l border-border/80 bg-background/98 shadow-2xl',
        )}
      >
        <SheetHeader className="border-b border-border/70 px-5 pb-4 pt-5 text-left">
          <SheetTitle>{txa('Tür filtreleri')}</SheetTitle>
          <SheetDescription>{txa('Keşfet akışına sağ taraftan müdahale et.')}</SheetDescription>
        </SheetHeader>
        <div className="px-5 py-4">
          <GenrePanelBody {...props} />
        </div>
      </SheetContent>
    </Sheet>
  )
}
