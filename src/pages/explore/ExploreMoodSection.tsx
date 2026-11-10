import { useEffect, useState } from 'react'
import { Crown, HeartHandshake, MoonStar, X } from 'lucide-react'
import { listMangas } from '@/services/mangaService'
import { cn } from '@/lib/utils'
import type { Manga } from '@/types'
import { EXPLORE_MOODS, findMood, formatMoodCount, type ExploreMood } from './exploreMoods'
import { ExploreSeriesCard } from './ExploreSeriesCard'
import { txa } from '@/i18n/activeLocale'

/**
 * "TODAY'S MOOD" section (prototype: Explore).
 *
 * Picking a mood opens its own results panel BELOW, without changing the main
 * catalog. Same in the prototype: a mood is a short shortcut alongside the catalog,
 * not a replacement for filters.
 *
 * Measures from the prototype: chip 118x64 r15, icon 17px, label 12/900, note
 * 10/700; results panel r18, padding 13, badge 32x32 r11.
 */

const MOOD_ICONS: Record<string, typeof MoonStar> = {
  night: MoonStar,
  soft: HeartHandshake,
  epic: Crown,
}

interface ExploreMoodSectionProps {
  /** So mood results respect open filters too. */
  status?: string
  /**
   * Converts a canonical genre id (`horror`) to values REALLY in the catalog
   * ('Korku', 'korku', ...).
   *
   * This resolver is REQUIRED: `mangas.genres` holds Turkish names, passing the canonical id
   * directly to the query matches nothing and the mood said "no results",
   * as measured.
   */
  resolveGenreQueryValues: (genreIds: string[]) => string[]
}

export function ExploreMoodSection({
  status = 'all',
  resolveGenreQueryValues,
}: ExploreMoodSectionProps) {
  const [activeMoodId, setActiveMoodId] = useState<string | null>(null)
  const [results, setResults] = useState<Manga[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)

  const activeMood: ExploreMood | null = findMood(activeMoodId)

  useEffect(() => {
    if (!activeMood) {
      setResults([])
      setTotal(0)
      return undefined
    }

    let cancelled = false
    const controller = new AbortController()
    setLoading(true)

    void listMangas(
      {
        genres: resolveGenreQueryValues(activeMood.genres),
        status,
        sort: 'popular',
        limit: 12,
      },
      controller.signal,
    )
      .then(({ data, count }) => {
        if (cancelled) return
        setResults(data)
        setTotal(count)
      })
      .catch(() => {
        if (cancelled) return
        // Silently emptying would read as "mood is empty"; we also reset the counter and
        // show the same empty state text.
        setResults([])
        setTotal(0)
      })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [activeMood, resolveGenreQueryValues, status])

  return (
    <section data-testid="explore-mood">
      <div className="flex items-baseline justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="m-0 text-[14px] font-extrabold uppercase tracking-[0.045em]">{txa('Bugün havam')}</h2>
          <p className="m-0 mt-1 truncate text-[11.5px] font-bold text-muted-foreground">
            {txa('Bir hava seç, sana uygun seriler altta çıkar')}
          </p>
        </div>
        {activeMood ? (
          <button
            type="button"
            data-testid="explore-mood-clear"
            onClick={() => setActiveMoodId(null)}
            className="inline-flex min-h-11 shrink-0 items-center gap-1.5 pl-2.5 text-[12.5px] font-extrabold text-foreground/80 transition-colors hover:text-foreground"
          >
            <X className="size-3.5" />
            {txa('Temizle')}
          </button>
        ) : null}
      </div>

      <div className="hide-scrollbar mt-2 flex gap-2 overflow-x-auto">
        {EXPLORE_MOODS.map((mood) => {
          const Icon = MOOD_ICONS[mood.id] || MoonStar
          const selected = activeMoodId === mood.id
          return (
            <button
              key={mood.id}
              type="button"
              aria-pressed={selected}
              data-testid={`explore-mood-${mood.id}`}
              onClick={() => setActiveMoodId(selected ? null : mood.id)}
              className={cn(
                'flex min-h-16 w-[118px] shrink-0 flex-col items-start justify-center gap-[3px] rounded-[15px] border px-3 py-2.5 text-left transition-colors',
                selected
                  ? 'border-primary bg-primary/10'
                  : 'border-border bg-card hover:border-primary/50',
              )}
            >
              <Icon className={cn('size-[17px]', selected ? 'text-primary' : 'text-muted-foreground')} />
              <span className={cn('text-xs font-black tracking-[-0.01em]', selected && 'text-primary')}>
                {txa(mood.label)}
              </span>
              <span className="text-[10px] font-bold text-muted-foreground">{txa(mood.note)}</span>
            </button>
          )
        })}
      </div>

      {activeMood ? (
        <div
          data-testid="explore-mood-results"
          className="mt-3.5 rounded-[18px] border border-primary/30 bg-primary/[.09] p-3.5"
        >
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-[11px] bg-primary text-primary-foreground">
              {(() => {
                const Icon = MOOD_ICONS[activeMood.id] || MoonStar
                return <Icon className="size-[17px]" />
              })()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="m-0 text-[13.5px] font-black tracking-[-0.01em] text-foreground">
                {txa(activeMood.label)}
              </p>
              <p className="m-0 mt-0.5 text-[11px] font-bold text-primary">
                {loading ? txa('Aranıyor...') : formatMoodCount(total)}
              </p>
            </div>
          </div>

          {!loading && results.length === 0 ? (
            <p className="m-0 mt-3 rounded-[14px] bg-card p-4 text-center text-[12.5px] font-bold text-muted-foreground">
              {txa('Bu havada uygun seri kalmadı — başka bir hava dene.')}
            </p>
          ) : null}

          <div className="hide-scrollbar mt-3 flex gap-2.5 overflow-x-auto">
            {loading
              ? [0, 1, 2, 3].map((index) => (
                <div key={index} className="aspect-[3/4] w-28 shrink-0 animate-pulse rounded-[14px] bg-muted" />
              ))
              : results.map((manga) => (
                <ExploreSeriesCard key={manga.id} manga={manga} variant="railCompact" />
              ))}
          </div>
        </div>
      ) : null}
    </section>
  )
}
