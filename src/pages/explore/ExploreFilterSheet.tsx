import BottomSheet from '@/components/common/BottomSheet'
import { cn } from '@/lib/utils'
import { STATUS_OPTIONS, type ExploreGenreItem, type ExploreStatusId } from './explorePageShared'
import { txa } from '@/i18n/activeLocale'

/**
 * 'Filter' bottom sheet (prototype: Explore > filter button).
 *
 * In the prototype the filter is a bottom sheet opened by a separate button RIGHT OF the search box.
 * Here status and sort chips were spread over the page and the genre
 * panel was a separate surface; all three are now in one place.
 *
 * The shell is the shared `BottomSheet`, the same language as the ⋯ menu and report sheet.
 *
 * RESET on the title's right, "Show results" at full width: as in the prototype.
 * Selection applies INSTANTLY (the page already filters live), the button
 * only closes the sheet: setting up a two-stage "apply" expectation and
 * then acting instantly would mislead the user.
 */

interface ExploreFilterSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  genres: ExploreGenreItem[]
  selectedGenres: string[]
  selectedStatus: ExploreStatusId
  onToggleGenre: (genreId: string) => void
  onStatusChange: (status: ExploreStatusId) => void
  onReset: () => void
  resultCount: number
}

export function ExploreFilterSheet({
  open,
  onOpenChange,
  genres,
  selectedGenres,
  selectedStatus,
  onToggleGenre,
  onStatusChange,
  onReset,
  resultCount,
}: ExploreFilterSheetProps) {
  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={txa('Filtrele')}
      titleTone="heading"
      description={txa('Tur ve durum secerek katalogu daralt')}
      cancelLabel={null}
      testId="explore-filter-sheet"
      contentClassName="max-h-[86dvh]"
    >
      <button
        type="button"
        data-testid="explore-filter-reset"
        onClick={onReset}
        className="absolute right-5 top-[26px] text-[12.5px] font-bold text-primary transition-opacity hover:opacity-75"
      >
        {txa('Sıfırla')}
      </button>

      <div className="max-h-[56dvh] overflow-y-auto px-5 pt-4">
        <p className="m-0 text-[11.5px] font-bold uppercase tracking-[0.04em] text-muted-foreground">
          {txa('Tür')}
        </p>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {genres.map((genre) => {
            const selected = selectedGenres.includes(genre.id)
            return (
              <button
                key={genre.id}
                type="button"
                aria-pressed={selected}
                data-testid={`explore-filter-genre-${genre.id}`}
                onClick={() => onToggleGenre(genre.id)}
                className={cn(
                  'rounded-[12px] border px-3.5 py-2 text-[13px] font-bold transition-colors',
                  selected
                    ? 'border-primary bg-primary/15 text-primary'
                    : 'border-border text-foreground/85 hover:bg-accent',
                )}
              >
                {txa(genre.name)}
              </button>
            )
          })}
        </div>

        <p className="m-0 mt-6 text-[11.5px] font-bold uppercase tracking-[0.04em] text-muted-foreground">
          {txa('Durum')}
        </p>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {STATUS_OPTIONS.map((status) => {
            const selected = selectedStatus === status.id
            return (
              <button
                key={status.id}
                type="button"
                aria-pressed={selected}
                data-testid={`explore-filter-status-${status.id}`}
                onClick={() => onStatusChange(status.id)}
                className={cn(
                  'rounded-[12px] border px-3.5 py-2 text-[13px] font-bold transition-colors',
                  selected
                    ? 'border-primary bg-primary/15 text-primary'
                    : 'border-border text-foreground/85 hover:bg-accent',
                )}
              >
                {txa(status.name)}
              </button>
            )
          })}
        </div>
      </div>

      <button
        type="button"
        data-testid="explore-filter-apply"
        onClick={() => onOpenChange(false)}
        className="mx-4 mb-[calc(1rem_+_env(safe-area-inset-bottom))] mt-4 h-[52px] rounded-[14px] bg-primary text-[15px] font-bold text-primary-foreground transition-[filter] hover:brightness-110"
      >
        {txa('Sonuçları göster ({v1})', { v1: resultCount })}
      </button>
    </BottomSheet>
  )
}
