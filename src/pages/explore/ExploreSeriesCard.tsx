import { Link } from '@/i18n/router'
import { CheckCircle2, Sparkles, Star, TrendingUp } from 'lucide-react'
import { buildCoverPlaceholder } from '@/lib/coverPlaceholder'
import { optimizePublicImageUrl } from '@/lib/optimizedPublicImageUrl'
import { buildPublicMangaPath } from '@/lib/routes'
import { cn } from '@/lib/utils'
import type { Manga } from '@/types'
import { intlLocale, txa } from '@/i18n/activeLocale'

/**
 * Explore cover card (prototype: Explore screen).
 *
 * A status badge ON the cover, rating + chapter BELOW; outside the cover the
 * title and a one-line REASON. The old card (ExploreMangaCard) also printed description
 * and genre chips; the prototype's rhythm is tighter since these
 * cards sit side by side on a horizontal rail.
 *
 * IN THE PROTOTYPE BUT NOT HERE: the bookmark button at the cover's top right.
 * Knowing follow state per card needs a separate query; rather than a dead icon
 * we draw none (Phase 2).
 *
 * "Ch. N" rather than "N chapters": our field is the LAST chapter number
 * (`last_chapter_number`), not the total count. The two match on most series
 * but are not the same, and we do not write as if they were.
 */

type ExploreCardBadge = 'new' | 'rising' | 'completed' | null

interface ExploreSeriesCardProps {
  manga: Manga
  /** One-line reason under the cover ("For fantasy fans"). */
  reason?: string
  /**
   * `rail` 150px (For you), `railCompact` 112px (mood results;
   * that panel's cards are narrower in the prototype), `grid` flexible.
   */
  variant?: 'rail' | 'railCompact' | 'grid'
}

function resolveBadge(manga: Manga): ExploreCardBadge {
  if (manga.isNew) return 'new'
  if (manga.status === 'completed') return 'completed'
  // "Rising" measure: no real momentum data, only high
  // views. A plain threshold rather than an invented trend badge.
  if ((manga.views || 0) >= 100000) return 'rising'
  return null
}

const BADGE_PRESETS = {
  new: { get label() { return txa('YENİ') }, icon: Sparkles, className: 'bg-primary text-primary-foreground' },
  rising: { get label() { return txa('YÜKSELİŞTE') }, icon: TrendingUp, className: 'bg-amber-500 text-black' },
  completed: { get label() { return txa('TAMAMLANDI') }, icon: CheckCircle2, className: 'bg-emerald-500 text-black' },
} as const

export function ExploreSeriesCard({ manga, reason, variant = 'grid' }: ExploreSeriesCardProps) {
  const path = buildPublicMangaPath({ id: manga.id, slug: manga.slug, title: manga.title })
  const cover = optimizePublicImageUrl(manga.coverImage) || manga.coverImage || buildCoverPlaceholder(manga.title)
  const badge = resolveBadge(manga)
  const preset = badge ? BADGE_PRESETS[badge] : null
  const BadgeIcon = preset?.icon
  const ratingLabel = typeof manga.rating === 'number' && Number.isFinite(manga.rating)
    ? manga.rating.toLocaleString(intlLocale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 })
    : null

  return (
    <Link
      to={path}
      data-testid="explore-series-card"
      className={cn(
        'group block',
        variant === 'rail' && 'w-[150px] shrink-0',
        variant === 'railCompact' && 'w-28 shrink-0',
      )}
    >
      <div className="relative aspect-[3/4] overflow-hidden rounded-[14px] border border-border bg-muted">
        <img
          src={cover}
          alt={manga.title}
          loading="lazy"
          decoding="async"
          className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.035]"
          onError={(event) => { event.currentTarget.src = buildCoverPlaceholder(manga.title) }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/[.78] from-[6%] to-transparent to-[48%]" />

        {preset && BadgeIcon ? (
          <span
            data-testid="explore-card-badge"
            className={cn(
              'absolute left-2 top-2 inline-flex items-center gap-1 rounded-[7px] px-1.5 py-[3px]',
              'text-[9.5px] font-black tracking-[0.03em]',
              preset.className,
            )}
          >
            <BadgeIcon className="size-2.5" />
            {txa(preset.label)}
          </span>
        ) : null}

        <div className="absolute inset-x-2 bottom-2 flex items-center gap-[5px] text-[10.5px] font-extrabold text-white">
          {ratingLabel ? (
            <span className="inline-flex items-center gap-[3px] text-amber-400">
              <Star className="size-2.5 fill-current" />
              {ratingLabel}
            </span>
          ) : null}
          {manga.lastChapter ? <span className="truncate opacity-75">{manga.lastChapter}</span> : null}
        </div>
      </div>

      <p className="m-0 mt-2 line-clamp-2 text-[13.5px] font-extrabold leading-[1.3] text-foreground group-hover:text-primary">
        {manga.title}
      </p>
      {reason ? (
        <p
          className="m-0 mt-0.5 truncate text-[11.5px] font-bold text-primary"
          data-testid="explore-card-reason"
        >
          {reason}
        </p>
      ) : null}
    </Link>
  )
}
