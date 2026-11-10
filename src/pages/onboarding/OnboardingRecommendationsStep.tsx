import { useCallback, useEffect, useState } from 'react'
import { Link } from '@/i18n/router'
import { BookOpen, Check, Loader2, Plus, Sparkles, Star } from 'lucide-react'
import { getRecommendedMangas, type RecommendedManga } from '@/services/recommendationService'
import { userService } from '@/services/userService'
import { toUserFacingErrorMessage } from '@/services/userFacingError'
import { createScopedLogger } from '@/services/logger'
import { buildPublicMangaPath } from '@/lib/routes'
import { toast } from '@/services/toastService'
import { cn } from '@/lib/utils'
import { txa } from '@/i18n/activeLocale'

/**
 * Recommendation step (prototype screen 4, second half).
 *
 * Onboarding used to end with genre selection and the PAYOFF only showed
 * on reaching Explore: the user picked three genres and moved on with nothing.
 * This step pays for the choice right away.
 *
 * **The reason (`why`) is not invented.** `get_recommended_mangas` (migration 271)
 * returns `matched_genres`; what the row says is what the engine REALLY matched.
 * With no match it says "popular", with no fake personalization:
 * the same rule applies on the /sans screen.
 *
 * Following is NOT REQUIRED: as in the prototype it says "these series appear on
 * your home page even if you do not follow". Requiring it would push the user to
 * click without understanding.
 */

const recommendationsLogger = createScopedLogger('OnboardingRecommendations')

interface OnboardingRecommendationsStepProps {
  /** Tur secimi kaydedildikten SONRA true olmali; motor profili okuyor. */
  ready: boolean
  userId: string
  onCountChange?: (count: number) => void
}

function reasonLabel(matchedGenres: string[]): string {
  if (matchedGenres.length === 0) return txa('Şu an çok okunuyor')
  if (matchedGenres.length === 1) return txa('{genre} sevdiğin için', { genre: txa(matchedGenres[0]) })
  return txa('{a} ve {b} sevdiğin için', { a: txa(matchedGenres[0]), b: txa(matchedGenres[1]) })
}

export default function OnboardingRecommendationsStep({
  ready,
  userId,
  onCountChange,
}: OnboardingRecommendationsStepProps) {
  const [items, setItems] = useState<RecommendedManga[]>([])
  const [loading, setLoading] = useState(true)
  const [followed, setFollowed] = useState<Set<string>>(new Set())
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    if (!ready) return
    let cancelled = false
    setLoading(true)
    void (async () => {
      const rows = await getRecommendedMangas(8)
      if (cancelled) return
      setItems(rows)
      setLoading(false)
      onCountChange?.(rows.length)
    })()
    return () => { cancelled = true }
  }, [onCountChange, ready])

  const handleFollow = useCallback(async (mangaId: string) => {
    setBusyId(mangaId)
    try {
      await userService.followManga(userId, mangaId)
      setFollowed((prev) => new Set(prev).add(mangaId))
    } catch (error) {
      recommendationsLogger.warn({
        event: 'onboarding-follow',
        message: toUserFacingErrorMessage(error, txa('Takip edilemedi.')),
        context: { mangaId },
        error,
      })
      toast.error(toUserFacingErrorMessage(error, txa('Takip edilemedi. Lütfen tekrar dene.')))
    } finally {
      setBusyId(null)
    }
  }, [userId])

  if (loading) {
    return (
      <div className="space-y-2" data-testid="onboarding-recommendations-loading">
        {[0, 1, 2].map((index) => (
          <div key={index} className="h-[92px] animate-pulse rounded-2xl bg-muted" />
        ))}
      </div>
    )
  }

  if (items.length === 0) {
    /*
     * The engine can return empty (flag off, narrow catalog, or no series in chosen genres).
     * Rather than show an empty list we say what happened.
     */
    return (
      <div
        className="rounded-2xl border border-dashed border-border/70 p-6 text-center"
        data-testid="onboarding-recommendations-empty"
      >
        <BookOpen className="mx-auto size-6 text-muted-foreground" aria-hidden="true" />
        <p className="m-0 mt-3 text-sm font-bold text-foreground">{txa('Şimdilik öneri çıkaramadık')}</p>
        <p className="m-0 mt-1 text-xs text-muted-foreground">
          {txa('Seçtiğin türler kaydedildi; ana sayfan okudukça şekillenecek.')}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3" data-testid="onboarding-recommendations">
      <div className="space-y-2">
        {items.map(({ manga, matchedGenres }) => {
          const to = buildPublicMangaPath({ id: manga.id, slug: manga.slug, title: manga.title })
          const isFollowed = followed.has(manga.id)
          return (
            <div
              key={manga.id}
              className="flex items-center gap-3 rounded-2xl border border-border/70 bg-background/60 p-3"
              data-testid="onboarding-recommendation-row"
            >
              <Link to={to} className="shrink-0">
                <img
                  src={manga.coverImage}
                  alt=""
                  loading="lazy"
                  className="h-[74px] w-[52px] rounded-[10px] object-cover"
                />
              </Link>
              <Link to={to} className="min-w-0 flex-1">
                <p className="m-0 truncate text-sm font-black text-foreground">{manga.title}</p>
                <p className="m-0 mt-0.5 flex items-center gap-2 text-[11px] font-semibold text-muted-foreground">
                  {typeof manga.rating === 'number' ? (
                    <span className="inline-flex items-center gap-0.5">
                      <Star className="size-3 fill-current" aria-hidden="true" />
                      {manga.rating.toFixed(1)}
                    </span>
                  ) : null}
                  {manga.lastChapter ? <span>{manga.lastChapter}</span> : null}
                </p>
                <p
                  className="m-0 mt-1 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10.5px] font-bold text-primary"
                  data-testid="onboarding-recommendation-reason"
                >
                  <Sparkles className="size-3" aria-hidden="true" />
                  {reasonLabel(matchedGenres)}
                </p>
              </Link>
              <button
                type="button"
                disabled={isFollowed || busyId === manga.id}
                onClick={() => { void handleFollow(manga.id) }}
                data-testid={`onboarding-recommendation-follow-${manga.id}`}
                className={cn(
                  'inline-flex h-10 shrink-0 items-center gap-1.5 rounded-[12px] px-3 text-[13px] font-extrabold transition-colors',
                  isFollowed
                    ? 'border border-primary/40 bg-primary/10 text-primary'
                    : 'bg-primary text-primary-foreground',
                )}
              >
                {busyId === manga.id ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : isFollowed ? (
                  <Check className="size-4" aria-hidden="true" />
                ) : (
                  <Plus className="size-4" aria-hidden="true" />
                )}
                {isFollowed ? txa('Takipte') : txa('Takip et')}
              </button>
            </div>
          )
        })}
      </div>

      <p className="m-0 text-xs leading-5 text-muted-foreground">
        {txa('Takip etmesen de bu seriler ana sayfanda çıkar — öneriler okudukça keskinleşir.')}
      </p>
    </div>
  )
}
