/**
 * ProfileGenreRings: genre distribution showcase card for the profile right sidebar.
 *
 * v8.1 design decisions (per a user's visual):
 * - Info grouped in one outer card (border + bg-card/40); the "Genres" title at
 * top left has its own identity, apart from content.
 * - "Favorite Genre" top row: a small "Favorite Genre" label → large typography
 * genre name (e.g. 'Aksiyon') + a large red (primary) "%X" number on the right.
 * - **One** donut chart (multi-segment) at bottom left; a 4-5 genre legend list to its right,
 * each row a colored dot + genre name + %X on the right.
 * - v8's two separate donuts (FavoriteGenreRing + GenreDistributionRing)
 * merged into one visualization: the favorite genre is no longer in the donut center
 * but shown as a large title ABOVE the donut (Spotify
 * "Top Genre" feel).
 *
 * Color palette: primary (red), chart-1 (pink), chart-2 (yellow),
 * chart-3 (blue), chart-4 (purple/dark). Fallback for a 5th genre. Colors come from theme
 * tokens.
 */
import { Star } from 'lucide-react'

import { cn } from '@/lib/utils'
import type { FavoriteGenre } from './types'
import { txa } from '@/i18n/activeLocale'

type ProfileGenreRingsProps = {
  favoriteGenres: FavoriteGenre[]
  className?: string
}

const SEGMENT_COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
]

export default function ProfileGenreRings({ favoriteGenres, className }: ProfileGenreRingsProps) {
  if (!favoriteGenres || favoriteGenres.length === 0) {
    return null
  }

  const sorted = favoriteGenres.slice().sort((a, b) => (b.percent || 0) - (a.percent || 0))
  const topGenre = sorted[0]
  const topPercent = Math.round(topGenre?.percent || 0)

  // Donut: all genres + "Other" (if the total < 100)
  const radius = 32
  const circumference = 2 * Math.PI * radius
  const safeGenres = sorted.slice(0, 5)
  const sumPercents = safeGenres.reduce((sum, g) => sum + Math.max(0, g.percent || 0), 0)
  const otherPercent = Math.max(0, 100 - Math.min(100, sumPercents))

  // strokeDasharray/Offset calculation per segment
  let cumulative = 0
  const segments = safeGenres.map((g, idx) => {
    const fraction = Math.max(0, g.percent || 0) / 100
    const length = circumference * fraction
    const seg = {
      key: g.name,
      color: SEGMENT_COLORS[idx % SEGMENT_COLORS.length],
      dashArray: `${length} ${circumference - length}`,
      dashOffset: -cumulative,
    }
    cumulative += length
    return seg
  })

  // "Other" segment (if any)
  const otherSegment = otherPercent > 0 ? {
    key: '__other',
    color: 'hsl(var(--muted-foreground) / 0.4)',
    dashArray: `${circumference * (otherPercent / 100)} ${circumference - circumference * (otherPercent / 100)}`,
    dashOffset: -cumulative,
  } : null

  return (
    <section
      className={cn(
        'rounded-xl border border-border/55 bg-card/40 p-4',
        className,
      )}
      aria-label={txa('Tür istatistikleri')}
    >
      {/* Başlık */}
      <div className="flex items-center gap-2">
        <Star className="size-4 text-primary" fill="currentColor" />
        <h3 className="text-sm font-bold tracking-tight text-foreground">{txa('Türler')}</h3>
      </div>

      {/* Favori tür büyük başlık */}
      <div className="mt-4">
        <p className="text-[11px] font-medium text-muted-foreground">{txa('Favori Tür')}</p>
        <div className="mt-0.5 flex items-baseline justify-between gap-3">
          <h4 className="line-clamp-1 break-words text-2xl font-black tracking-tight text-foreground">
            {topGenre?.name || '—'}
          </h4>
          <span className="shrink-0 text-2xl font-black tracking-tight text-primary">
            %{topPercent}
          </span>
        </div>
      </div>

      {/* Donut + Legend */}
      <div className="mt-4 flex items-center gap-4">
        {/* Donut chart (sol) */}
        <div className="relative flex shrink-0 items-center justify-center">
          <svg width="88" height="88" viewBox="0 0 88 88" className="-rotate-90">
            <circle
              cx="44"
              cy="44"
              r={radius}
              fill="none"
              stroke="hsl(var(--muted) / 0.25)"
              strokeWidth="8"
            />
            {segments.map((seg) => (
              <circle
                key={seg.key}
                cx="44"
                cy="44"
                r={radius}
                fill="none"
                stroke={seg.color}
                strokeWidth="8"
                strokeLinecap="butt"
                strokeDasharray={seg.dashArray}
                strokeDashoffset={seg.dashOffset}
                className="transition-[stroke-dashoffset,stroke-dasharray] duration-700 ease-out"
              />
            ))}
            {otherSegment ? (
              <circle
                cx="44"
                cy="44"
                r={radius}
                fill="none"
                stroke={otherSegment.color}
                strokeWidth="8"
                strokeLinecap="butt"
                strokeDasharray={otherSegment.dashArray}
                strokeDashoffset={otherSegment.dashOffset}
              />
            ) : null}
          </svg>
        </div>

        {/* Legend (sağ) — düz liste, kart yok */}
        <ul className="min-w-0 flex-1 space-y-1">
          {safeGenres.map((g, idx) => (
            <li
              key={g.name}
              className="flex items-center justify-between gap-2 text-[12px]"
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <span
                  className="size-1.5 shrink-0 rounded-full"
                  style={{ background: SEGMENT_COLORS[idx % SEGMENT_COLORS.length] }}
                />
                <span className="truncate text-foreground/90">{g.name}</span>
              </span>
              <span className="shrink-0 font-semibold text-muted-foreground">{txa('%{v1}', { v1: Math.round(g.percent || 0) })}</span>
            </li>
          ))}
          {otherPercent > 0 ? (
            <li className="flex items-center justify-between gap-2 text-[12px]">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="size-1.5 shrink-0 rounded-full bg-muted-foreground/40" />
                <span className="truncate text-muted-foreground">{txa('Diğer')}</span>
              </span>
              <span className="shrink-0 font-semibold text-muted-foreground">{txa('%{v1}', { v1: otherPercent })}</span>
            </li>
          ) : null}
        </ul>
      </div>
    </section>
  )
}
