import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from '@/i18n/router'
import { BookOpen, Eye, Flag, Heart, Info, List, MessageSquare, Play, Plus, Share2, Star, Users } from 'lucide-react'
import { buildExplorePath } from '@/lib/routes'
import { formatCompactCount, formatMangaRating } from './mangaDetailPage.utils'
import { cn } from '@/lib/utils'
import type { Manga } from '@/types'
import { intlLocale, txa } from '@/i18n/activeLocale'

type MangaDetailTab = 'info' | 'comments' | 'chapters'

/** Genres shown before folding (same as the prototype). */
const GENRE_PREVIEW_COUNT = 3

/**
 * The prototype's details are HORIZONTAL ON PHONES too: cover left, identity right.
 * Ours broke to vertical on narrow screens (cover on top, centered):
 * on the exact target screen the cover alone took a screen's height and action
 * buttons fell below the fold.
 *
 * Measures from the prototype: card r16, padding 15, cover 126x168 r11, title
 * 19/900, meta 12/700, description 12.5/600, buttons h44 r12, tab min-h 46.
 */

const METRIC_ICON = 'size-[13px] shrink-0'

interface MangaDetailHeroCardProps {
  manga: Manga
  chaptersCount: number
  startReadingUrl: string | null
  continueReadingUrl: string | null
  isFollowing: boolean
  userRating: number
  selectedTab: MangaDetailTab
  visibleCommentCount?: number
  descExpanded: boolean
  onToggleDescription: () => void
  onSelectedTabChange: (tab: MangaDetailTab) => void
  onFollowToggle: () => void
  onOpenRating: () => void
  onReport?: () => void
  formatGenreLabel: (genre: string) => string
  statusLabel: (status?: string) => string
  statusColor: (status?: string) => string
}

export default function MangaDetailHeroCard({
  manga,
  chaptersCount,
  startReadingUrl,
  continueReadingUrl,
  isFollowing,
  userRating,
  selectedTab,
  visibleCommentCount,
  descExpanded,
  onToggleDescription,
  onSelectedTabChange,
  onFollowToggle,
  onOpenRating,
  onReport,
  formatGenreLabel,
  statusLabel,
  statusColor,
}: MangaDetailHeroCardProps) {
  /*
   * The prototype shows only 3 genres and folds the rest. Ours printed all genres;
   * on an 8-genre series the details swelled and pushed action buttons
   * down.
   */
  const [genresExpanded, setGenresExpanded] = useState(false)
  const allGenres = manga.genres || []
  const visibleGenres = genresExpanded ? allGenres : allGenres.slice(0, GENRE_PREVIEW_COUNT)
  const hiddenGenreCount = allGenres.length - GENRE_PREVIEW_COUNT

  const description = manga.description || ''

  /*
   * The "More" button decides by REAL OVERFLOW, not CHARACTER COUNT.
   * On a phone details are a narrow column (~170px): even a 107-character summary spread over five
   * lines, so a length threshold measured the wrong question here.
   */
  const descriptionRef = useRef<HTMLParagraphElement | null>(null)
  const [isDescriptionClamped, setIsDescriptionClamped] = useState(false)

  const measureDescription = useCallback(() => {
    const node = descriptionRef.current
    if (!node) return
    // Acikken zaten tam metin duruyor; olcum yalnizca katli halde anlamli.
    if (descExpanded) return
    setIsDescriptionClamped(node.scrollHeight > node.clientHeight + 1)
  }, [descExpanded])

  useEffect(() => {
    measureDescription()
    window.addEventListener('resize', measureDescription)
    return () => window.removeEventListener('resize', measureDescription)
  }, [description, measureDescription])
  const tabs = [
    { id: 'chapters' as const, label: txa('Bölümler'), icon: List, count: chaptersCount },
    { id: 'comments' as const, label: txa('Yorumlar'), icon: MessageSquare, count: visibleCommentCount },
    { id: 'info' as const, label: txa('Detaylar'), icon: Info },
  ]

  return (
    <div className="overflow-hidden rounded-[16px] border border-border bg-card">
      <div className="flex gap-3.5 p-[15px]">
        <Link to={manga.coverImage} target="_blank" className="group shrink-0">
          <img
            loading="lazy"
            decoding="async"
            src={manga.coverImage}
            alt={manga.title}
            className="h-[168px] w-[126px] rounded-[11px] object-cover shadow-[0_12px_26px_-14px_rgba(0,0,0,.85)] transition-transform group-hover:scale-[1.02] sm:h-[200px] sm:w-[150px]"
          />
        </Link>

        <div className="flex min-w-0 flex-1 flex-col">
          <h1 className="m-0 text-[19px] font-black leading-[1.2] tracking-[-0.02em] sm:text-[22px]">
            {manga.title}
          </h1>

          <div className="mt-[9px] flex flex-wrap items-center gap-x-[11px] gap-y-1 text-xs font-bold">
            {manga.status ? (
              <span className={statusColor(manga.status)}>{statusLabel(manga.status)}</span>
            ) : null}
            {manga.rating != null ? (
              <span className="inline-flex items-center gap-1 text-amber-500">
                <Star className={cn(METRIC_ICON, 'fill-current')} />
                {formatMangaRating(manga.rating)}
              </span>
            ) : null}
            {manga.views != null ? (
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                <Eye className={METRIC_ICON} />
                {formatCompactCount(manga.views)}
              </span>
            ) : null}
            {manga.followerCount != null ? (
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                <Users className={METRIC_ICON} />
                {manga.followerCount.toLocaleString(intlLocale())}
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <BookOpen className={METRIC_ICON} />
              {txa('{v1} Bölüm', { v1: chaptersCount })}
            </span>
          </div>

          {allGenres.length > 0 ? (
            <div className="mt-2.5 flex flex-wrap items-center gap-[5px]" data-testid="manga-detail-genres">
              {visibleGenres.map((genre, index) => (
                <Link
                  key={index}
                  to={buildExplorePath({ genres: genre.toLowerCase() })}
                  className="rounded-[8px] bg-secondary px-[9px] py-1 text-[11px] font-extrabold text-secondary-foreground transition-colors hover:bg-primary/15 hover:text-primary"
                >
                  {txa(formatGenreLabel(genre))}
                </Link>
              ))}
              {hiddenGenreCount > 0 ? (
                <button
                  type="button"
                  data-testid="manga-detail-genres-toggle"
                  onClick={() => setGenresExpanded((previous) => !previous)}
                  className="inline-flex items-center gap-[3px] rounded-[8px] border border-border px-[9px] py-1 text-[11px] font-black text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                >
                  {genresExpanded ? null : <Plus className="size-3" />}
                  {genresExpanded ? txa('Daha az') : txa('{count} daha', { count: hiddenGenreCount })}
                </button>
              ) : null}
            </div>
          ) : null}

          {description ? (
            <>
              <p
                ref={descriptionRef}
                data-testid="manga-detail-description"
                className={cn(
                  'm-0 mt-[11px] text-[12.5px] font-semibold leading-[1.55] text-muted-foreground',
                  !descExpanded && 'line-clamp-3',
                )}
              >
                {description}
              </p>
              {isDescriptionClamped || descExpanded ? (
                <button
                  type="button"
                  onClick={onToggleDescription}
                  className="mt-1 self-start py-1.5 text-[11.5px] font-extrabold text-primary transition-opacity hover:opacity-75"
                >
                  {descExpanded ? txa('Daha az') : '...devami'}
                </button>
              ) : null}
            </>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 px-[15px] pb-[15px]">
        {continueReadingUrl || startReadingUrl ? (
          <Link
            to={(continueReadingUrl || startReadingUrl) as string}
            className="inline-flex h-11 items-center gap-[7px] rounded-[12px] bg-primary px-[15px] text-[13.5px] font-black text-primary-foreground transition-[filter] hover:brightness-110"
          >
            <Play className="size-[15px] fill-current" />
            {continueReadingUrl ? txa('Kaldığın Yerden Oku') : txa('Okumaya Başla')}
          </Link>
        ) : (
          <span className="inline-flex h-11 cursor-not-allowed items-center gap-[7px] rounded-[12px] bg-muted px-[15px] text-[13.5px] font-black text-muted-foreground">
            <Play className="size-[15px]" />
            {txa('Bölüm Yok')}
          </span>
        )}

        <button
          type="button"
          onClick={onFollowToggle}
          className={cn(
            'inline-flex h-11 items-center gap-[7px] rounded-[12px] border px-3.5 text-[13px] font-extrabold transition-colors',
            isFollowing
              ? 'border-primary/40 bg-primary/10 text-primary'
              : 'border-border text-foreground/90 hover:border-primary',
          )}
        >
          <Heart className={cn('size-[15px]', isFollowing && 'fill-current')} />
          {isFollowing ? txa('Takipte') : txa('Takip Et')}
        </button>

        <button
          type="button"
          onClick={onOpenRating}
          className="inline-flex h-11 items-center gap-[7px] rounded-[12px] border border-border px-3.5 text-[13px] font-extrabold text-foreground/90 transition-colors hover:border-primary hover:text-primary"
        >
          <Star className="size-[15px]" />
          {userRating > 0 ? `${userRating}/5` : txa('Puanla')}
        </button>

        {/*
          Paylas MOBILDE ust cubuga tasindi (prototipteki yeri) -- boylece bu
          satir prototiple ayni dort dugmeden olusuyor. Genis ekranda o cubuk
          yok (`lg:hidden`), o yuzden dugme orada burada duruyor: metin
          gizlemek degil, ayni kontrolu breakpoint'e gore TEK yerde tutmak.
        */}
        <button
          type="button"
          aria-label={txa('Manga sayfasını paylaş')}
          data-testid="manga-hero-share"
          onClick={() => navigator.share?.({ title: manga.title, url: window.location.href })}
          className="hidden h-11 items-center gap-1.5 rounded-[12px] px-2.5 text-[12.5px] font-extrabold text-muted-foreground transition-colors hover:text-foreground lg:inline-flex"
        >
          <Share2 className="size-[15px]" />
        </button>

        {onReport ? (
          <button
            type="button"
            onClick={onReport}
            data-testid="manga-report-button"
            className="inline-flex h-11 items-center gap-1.5 rounded-xl px-2.5 text-[12.5px] font-extrabold text-muted-foreground transition-colors hover:text-destructive"
          >
            <Flag className="size-[15px]" />
            {txa('Raporla')}
          </button>
        ) : null}
      </div>

      <div className="flex border-t border-border bg-muted/30">
        {tabs.map((tab) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              type="button"
              className={cn(
                'flex min-h-[46px] flex-1 items-center justify-center gap-1.5 border-b-2 px-1 text-[13px] font-extrabold transition-colors',
                selectedTab === tab.id
                  ? 'border-primary bg-background text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
              onClick={() => onSelectedTabChange(tab.id)}
            >
              <Icon className="size-4 shrink-0" />
              {txa(tab.label)}
              {tab.count != null ? (
                <span
                  className={cn(
                    'rounded-[6px] px-1.5 py-px text-[10.5px] font-black',
                    selectedTab === tab.id ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground',
                  )}
                >
                  {tab.count}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}
