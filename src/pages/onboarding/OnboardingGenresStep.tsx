import { useEffect, useMemo, useState } from 'react'
import { Flame, ShieldCheck } from 'lucide-react'
import { QUICK_GENRES } from '@/components/home/homeUtils'
import { normalizeGenreId, toCanonicalGenreId } from '@/pages/explore/explorePageShared'
import { listGenreStats, type GenreStat } from '@/services/genreStatsService'
import { ADULT_AGE, calculateAge } from '@/lib/birthDate'
import { cn } from '@/lib/utils'
import { txa } from '@/i18n/activeLocale'

/**
 * Genre selection (prototype screen 4, first half).
 *
 * Three differences from the prototype, all deliberate:
 *
 * 1. **At least 3 genres REQUIRED**, as in the prototype. Selection used to be fully
 * optional, yet the next step (recommendations) depends entirely on it.
 * A "for you" list from zero genres would be nothing but
 * popularity order.
 *
 * 2. **NO "Mature content 18+" SWITCH.** The prototype has a preference switch;
 * here the rule depends on AGE: under-18s are not shown it anyway
 * (RLS), 18+ are. A switch would create a lying surface where RLS stays open even
 * when turned off. Instead a line SAYS what happens.
 *
 * 3. **NO "Reading preference" (manga/manhwa/...) filter.** The series type
 * is now in the schema (`mangas.series_type`) but no such preference is kept on the
 * USER side. An unsaved filter would be decorative.
 */

/** Same as the prototype: the recommendation list depends on this number. */
export const MIN_GENRE_COUNT = 3

interface OnboardingGenresStepProps {
  selected: string[]
  onToggle: (slug: string) => void
  /** Kullanicinin dogum tarihi; 18+ satirinin ne diyecegini belirler. */
  birthDate?: string | null
}

export default function OnboardingGenresStep({
  selected,
  onToggle,
  birthDate,
}: OnboardingGenresStepProps) {
  const [stats, setStats] = useState<GenreStat[]>([])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const rows = await listGenreStats()
      if (!cancelled) setStats(rows)
    })()
    return () => { cancelled = true }
  }, [])

  /*
   * Catalog genre names are TURKISH labels (txa('Aksiyon')), the card key is a slug
   * ("aksiyon"). Also the same genre can have two names: the catalog has both "Dram"
   * (38 series) and txa('Drama') (1 series). Only normalizing made the card
   * say "Drama 1 series", hiding 38 series.
   *
   * `toCanonicalGenreId` applies the alias table (drama <- dram) and counts are
   * SUMMED; otherwise one record overwrote the other.
   *
   * BOTH SIDES are canonicalized. Canonical ids are ENGLISH ('action'),
   * card slugs are TURKISH ('aksiyon'); converting only the catalog side matched
   * NO genre except 'drama', the one accidental match.
   */
  const statBySlug = useMemo(() => {
    const map = new Map<string, GenreStat>()
    for (const stat of stats) {
      const key = toCanonicalGenreId(normalizeGenreId(stat.genre))
      const current = map.get(key)
      map.set(key, current
        ? {
            genre: current.genre,
            seriesCount: current.seriesCount + stat.seriesCount,
            isHot: current.isHot || stat.isHot,
          }
        : { ...stat })
    }
    return map
  }, [stats])

  const age = useMemo(() => {
    if (!birthDate) return null
    const parsed = new Date(`${birthDate}T00:00:00`)
    if (Number.isNaN(parsed.getTime())) return null
    return calculateAge(parsed, new Date())
  }, [birthDate])

  const remaining = Math.max(0, MIN_GENRE_COUNT - selected.length)

  return (
    <div className="space-y-4" data-testid="onboarding-genres-step">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
        {QUICK_GENRES.map((genre) => {
          const isSelected = selected.includes(genre.slug)
          const stat = statBySlug.get(toCanonicalGenreId(genre.slug))
          return (
            <button
              key={genre.slug}
              type="button"
              aria-pressed={isSelected}
              onClick={() => onToggle(genre.slug)}
              data-testid={`onboarding-genre-${genre.slug}`}
              className={cn(
                'relative flex items-center gap-2.5 rounded-2xl border px-4 py-3.5 text-left transition-colors',
                isSelected
                  ? 'border-primary/45 bg-primary/10'
                  : 'border-border/70 bg-background/70 hover:bg-muted/50',
              )}
            >
              <span className="text-xl leading-none" aria-hidden>{genre.emoji}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-black text-foreground">{txa(genre.label)}</span>
                {/*
                  Sayi RPC'den gelir ve cagiranin GOREBILDIGI katalogtan
                  sayilir; yasi dogrulanmamis kullaniciya gormeyecegi
                  serileri saymak sayiyi yalanci yapardi.
                */}
                {stat ? (
                  <span className="block text-[11px] font-semibold text-muted-foreground">
                    {txa('{v1} seri', { v1: stat.seriesCount })}
                  </span>
                ) : null}
              </span>
              {stat?.isHot ? (
                <span
                  className="inline-flex items-center gap-0.5 rounded-full bg-orange-500/15 px-1.5 py-0.5 text-[10px] font-black text-orange-500"
                  data-testid={`onboarding-genre-hot-${genre.slug}`}
                >
                  <Flame className="size-3" aria-hidden="true" />
                  {txa('Popüler')}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>

      <p className="text-xs font-semibold text-muted-foreground" data-testid="onboarding-genre-hint">
        {remaining > 0
          ? txa('En az {min} tür seç — {remaining} tane daha. Bir sonraki adımda sana özel seri listesi çıkaracağız.', { min: MIN_GENRE_COUNT, remaining })
          : txa('{count} tür seçildi. İstediğin kadar ekleyebilirsin.', { count: selected.length })}
      </p>

      {/*
        Anahtar degil BILGI: kural yasa bagli ve RLS'te uygulaniyor.
        Kapatilabilir bir anahtar, kapaliyken bile icerigin gorundugu
        (ya da gorunmedigi) bir yalan yuzey uretirdi.
      */}
      {age !== null ? (
        <div
          className="flex items-start gap-2.5 rounded-2xl border border-border/70 bg-background/60 p-3.5"
          data-testid="onboarding-mature-note"
        >
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
          <p className="m-0 text-xs leading-5 text-muted-foreground">
            {age >= ADULT_AGE
              ? txa('18+ etiketli seriler önerilerinde ve katalogda görünür.')
              : txa('18+ etiketli seriler gizli kalır; {age} yaşını doldurduğunda kendiliğinden açılır.', { age: ADULT_AGE })}
          </p>
        </div>
      ) : null}
    </div>
  )
}
