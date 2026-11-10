import { useEffect, useRef, useState } from 'react'
import { Clock, Search, X } from 'lucide-react'
import {
  clearRecentSearches,
  forgetRecentSearch,
  readRecentSearches,
  rememberRecentSearch,
} from '@/lib/recentSearches'
import { cn } from '@/lib/utils'
import { txa } from '@/i18n/activeLocale'

/**
 * Explore's search bar.
 *
 * WHY IT EXISTS: search INFRASTRUCTURE was already on the page: `?q=` is read,
 * debounced, sent to `listMangas({ search })` and written back to the URL.
 * The only missing thing was the INPUT: on a page called "Explore" the way to
 * search was the general command palette in the top bar.
 *
 * RECENT SEARCHES appear on focus while the field is EMPTY. They vanish on typing:
 * at that moment the user wants results, not history.
 *
 * A query is remembered AFTER a search RUNS (submit or select), not on every
 * keystroke: otherwise history would fill with "a", "ak", "aks".
 */

interface ExploreSearchBarProps {
  value: string
  onChange: (value: string) => void
  /** Arama kesinlestiginde (Enter ya da gecmisten secim). */
  onCommit?: (value: string) => void
  resultCount?: number
  loading?: boolean
}

export function ExploreSearchBar({
  value,
  onChange,
  onCommit,
  resultCount,
  loading = false,
}: ExploreSearchBarProps) {
  const [recent, setRecent] = useState<string[]>([])
  const [focused, setFocused] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => { setRecent(readRecentSearches()) }, [])

  /*
   * The panel should close on an outside click. `blur` is not enough: pressing a history
   * row first fires blur, closing the panel, and the click lands
   * on nothing.
   */
  useEffect(() => {
    if (!focused) return undefined
    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current) return
      if (containerRef.current.contains(event.target as Node)) return
      setFocused(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [focused])

  const commit = (query: string) => {
    const trimmed = query.trim()
    onChange(trimmed)
    if (trimmed) setRecent(rememberRecentSearch(trimmed))
    onCommit?.(trimmed)
    setFocused(false)
  }

  const showRecent = focused && value.trim().length === 0 && recent.length > 0

  return (
    <div ref={containerRef} className="relative" data-testid="explore-search">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-[17px] -translate-y-1/2 text-muted-foreground" />
        <input
          value={value}
          /*
           * All three events open the panel. `onFocus` ALONE is not enough:
           * after Enter the panel closes but the input stays focused in the DOM,
           * so when the user clears the field no new focus event FIRES and
           * history never reopens.
           */
          onChange={(event) => { onChange(event.target.value); setFocused(true) }}
          onFocus={() => setFocused(true)}
          onClick={() => setFocused(true)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commit(value)
            if (event.key === 'Escape') setFocused(false)
          }}
          placeholder={txa('Seri, çevirmen veya tür ara...')}
          aria-label={txa('Katalogda ara')}
          data-testid="explore-search-input"
          className="h-12 w-full rounded-[14px] border border-border bg-card pl-11 pr-11 text-[14.5px] font-semibold outline-none transition-colors focus:border-primary"
        />
        {value ? (
          <button
            type="button"
            aria-label={txa('Aramayı temizle')}
            data-testid="explore-search-clear"
            onClick={() => { onChange(''); setFocused(true) }}
            className="absolute right-2 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        ) : null}
      </div>

      {value.trim() && !loading && typeof resultCount === 'number' ? (
        <p
          className="m-0 mt-2 text-[12.5px] font-semibold text-muted-foreground"
          data-testid="explore-search-count"
        >
          <span className="font-black text-foreground">{resultCount}</span> {txa('sonuç bulundu')}
        </p>
      ) : null}

      {showRecent ? (
        <div
          data-testid="explore-recent-searches"
          className="absolute inset-x-0 top-[calc(100%_+_8px)] z-30 overflow-hidden rounded-[14px] border border-border bg-card shadow-lg"
        >
          <div className="flex items-center justify-between px-4 pb-1 pt-3">
            <span className="text-[11.5px] font-bold uppercase tracking-[0.04em] text-muted-foreground">
              {txa('Son aramalar')}
            </span>
            <button
              type="button"
              data-testid="explore-recent-clear-all"
              onClick={() => setRecent(clearRecentSearches())}
              className="text-[11.5px] font-bold text-primary transition-opacity hover:opacity-75"
            >
              {txa('Temizle')}
            </button>
          </div>
          {recent.map((query) => (
            <div key={query} className="flex items-center">
              <button
                type="button"
                data-testid="explore-recent-item"
                onClick={() => commit(query)}
                className="flex h-11 min-w-0 flex-1 items-center gap-2.5 px-4 text-left transition-colors hover:bg-accent"
              >
                <Clock className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 truncate text-sm font-semibold">{query}</span>
              </button>
              <button
                type="button"
                aria-label={txa('{query} aramasını geçmişten kaldır', { query })}
                onClick={() => setRecent(forgetRecentSearch(query))}
                className={cn(
                  'mr-2 flex size-9 shrink-0 items-center justify-center rounded-[10px]',
                  'text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
                )}
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
