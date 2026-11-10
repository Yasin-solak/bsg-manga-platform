import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { txa } from '@/i18n/activeLocale'

/**
 * Flag search + filter strip.
 *
 * In the handoff search/filter sits OUTSIDE the card, right above the list.
 * It used to be squeezed into the table header, and the selected filter was visible only
 * by looking inside the table.
 *
 * A narrowed list must SAY so: the filter badge is here, with its way to remove
 * on it.
 */

interface AdminOpsFeatureFlagToolbarProps {
  search: string
  onSearchChange: (value: string) => void
  /** Name of the filter selected from the boxes; empty means no filter. */
  filterLabel: string
  onClearFilter: () => void
  /** "12 / 22 flag gosteriliyor" ozeti. */
  shownCount: number
  totalCount: number
  createOpen: boolean
  onToggleCreate: () => void
  onReload: () => void
  loading: boolean
}

export function AdminOpsFeatureFlagToolbar({
  search,
  onSearchChange,
  filterLabel,
  onClearFilter,
  shownCount,
  totalCount,
  createOpen,
  onToggleCreate,
  onReload,
  loading,
}: AdminOpsFeatureFlagToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
        placeholder={txa('Flag anahtari veya baslik ara...')}
        className="h-10 w-full sm:w-72"
        aria-label={txa('Flag ara')}
      />

      {filterLabel ? (
        <button
          type="button"
          onClick={onClearFilter}
          className="inline-flex items-center gap-1 rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-1.5 text-xs font-semibold text-primary"
        >
          {filterLabel}
          <X className="size-3" aria-hidden="true" />
          <span className="sr-only">{txa('filtreyi kaldır')}</span>
        </button>
      ) : null}

      <span className="text-xs text-muted-foreground">
        {shownCount === totalCount
          ? `${totalCount} flag`
          : txa('{v1} / {v2} flag gosteriliyor', { v1: shownCount, v2: totalCount })}
      </span>

      <div className="flex-1" />

      <Button variant="outline" size="sm" onClick={onReload} disabled={loading}>
        {txa('Yenile')}
      </Button>
      <Button size="sm" onClick={onToggleCreate}>
        {createOpen ? (
          txa('Vazgec')
        ) : (
          <>
            <Plus className="mr-1 size-3.5" aria-hidden="true" />
            {txa('Yeni flag')}
          </>
        )}
      </Button>
    </div>
  )
}
