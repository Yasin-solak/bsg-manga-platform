import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from '@/i18n/router'
import { Bookmark, BookmarkCheck, Play, Star } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { userService } from '@/services/userService'
import { toast } from '@/services/toastService'
import type { Manga } from '@/types'
import { buildPublicMangaPath } from '@/lib/routes'
import { optimizePublicImageUrl } from '@/lib/optimizedPublicImageUrl'
import { buildCoverPlaceholder } from '@/lib/coverPlaceholder'
import { cn } from '@/lib/utils'
import { useReadyHeroManga } from '../useReadyHeroManga'
import { useTx } from '@/i18n/LocaleProvider'
import { txa } from '@/i18n/activeLocale'

/**
 * Mobile hero: in the handoff, text DOES NOT overlap the image.
 *
 * On the desktop hero title and description sit over the cover; on a phone the same
 * layout makes text unreadable when the cover is dark or busy and
 * squeezed tappable areas onto the image.
 *
 * Handoff layout: a 201px cover on top (badge and rating chip on the cover),
 * below it on the card background title / genre chips / two-line description, at the bottom a
 * full-width "Read now" + 48px bookmark button. The dot indicator is outside the
 * card, with a 44px touch target.
 */

interface HomeMobileHeroProps {
  mangas: Manga[]
  loading?: boolean
}

export function HomeMobileHero({ mangas, loading = false }: HomeMobileHeroProps) {
  const { currentUser } = useAuth()
  const tx = useTx()
  const navigate = useNavigate()
  const [index, setIndex] = useState(0)
  const [followedIds, setFollowedIds] = useState<Set<string>>(() => new Set())
  const [busyId, setBusyId] = useState<string | null>(null)
  /** X where the finger started; for horizontal swipes. */
  const dragStartX = useRef<number | null>(null)
  /** Was the last motion a swipe? To swallow the click after it. */
  const swiped = useRef(false)

  const slides = mangas.slice(0, 5)
  const requestedManga = slides[Math.min(index, slides.length - 1)] || null
  const active = useReadyHeroManga(requestedManga)
  const pending = loading || Boolean(requestedManga && !active)

  useEffect(() => {
    if (!currentUser?.id) { setFollowedIds(new Set()); return }
    let cancelled = false
    void (async () => {
      try {
        const rows = await userService.getFollowedMangas(currentUser.id)
        if (cancelled) return
        /*
         * The `manga` relation arrives as an ARRAY (PostgREST join). A match assuming a
         * single object would not find the id and show every series as "not followed":
         * the button would work correctly but show the wrong state.
         */
        setFollowedIds(new Set(
          (rows || [])
            .map((row) => {
              const related = Array.isArray(row?.manga) ? row.manga[0] : row?.manga
              return String(row?.manga_id || related?.id || '').trim()
            })
            .filter(Boolean),
        ))
      } catch {
        if (!cancelled) setFollowedIds(new Set())
      }
    })()
    return () => { cancelled = true }
  }, [currentUser?.id])

  if (pending || !active) return <section className="px-4" aria-busy={pending} aria-label={tx('Öne çıkan seri')}>
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="h-[201px] bg-muted/60" />
      <div className="min-h-[236px] p-4">
        {pending ? <div role="status" className="space-y-4 motion-safe:animate-pulse">
          <span className="sr-only">{tx('Öne çıkan seri yükleniyor')}</span>
          <div aria-hidden="true" className="h-7 w-2/3 rounded bg-muted" />
          <div aria-hidden="true" className="h-6 w-1/2 rounded bg-muted" />
          <div aria-hidden="true" className="h-10 rounded bg-muted" />
          <div aria-hidden="true" className="h-12 rounded-xl bg-muted" />
        </div> : <p className="text-sm text-muted-foreground">{tx('Şu anda gösterilecek öne çıkan seri yok.')}</p>}
      </div>
    </div>
    <div className="h-[46px]" aria-hidden="true" />
  </section>

  const to = buildPublicMangaPath({ id: active.id, slug: active.slug, title: active.title })
  const isFollowed = followedIds.has(active.id)

  const step = (delta: number) => {
    setIndex((current) => {
      const next = current + delta
      if (next < 0) return slides.length - 1
      if (next >= slides.length) return 0
      return next
    })
  }

  /*
   * Horizontal swipe on the WHOLE CARD.
   *
   * In the first version handlers were only on the cover image; a swipe starting over the title, genre
   * chips or buttons did not work and the
   * card felt like it "sometimes swipes, sometimes not". If half the card swipes,
   * for the user it does not swipe.
   *
   * 40px threshold: slight horizontal drift while scrolling vertically should not
   * change the slide.
   */
  const onPointerDown = (event: React.PointerEvent) => {
    dragStartX.current = event.clientX
    swiped.current = false
  }
  const onPointerUp = (event: React.PointerEvent) => {
    const startX = dragStartX.current
    dragStartX.current = null
    if (startX === null || slides.length < 2) return
    const delta = event.clientX - startX
    if (Math.abs(delta) < 40) return
    swiped.current = true
    step(delta < 0 ? 1 : -1)
  }

  /*
   * Swallow the CLICK after a swipe.
   *
   * The card is a link; swiping and releasing also produces a click in the browser,
   * and a user trying to change slides landed on the manga page.
   * This was the second cause of the "swiping does not work" feeling.
   */
  const onClickCapture = (event: React.MouseEvent) => {
    if (!swiped.current) return
    event.preventDefault()
    event.stopPropagation()
    swiped.current = false
  }

  const toggleFollow = async () => {
    if (!currentUser?.id) {
      // Misafiri sessizce birakmak yerine kapiyi gosteriyoruz.
      toast.warning(tx('Takip etmek için giriş yapmalısın.'))
      navigate('/giris')
      return
    }
    if (busyId) return
    setBusyId(active.id)
    const wasFollowed = isFollowed
    // Iyimser guncelleme: dokunusun karsiligi ANINDA gorunmeli.
    setFollowedIds((current) => {
      const next = new Set(current)
      if (wasFollowed) next.delete(active.id)
      else next.add(active.id)
      return next
    })
    try {
      if (wasFollowed) await userService.unfollowManga(currentUser.id, active.id)
      else await userService.followManga(currentUser.id, active.id)
    } catch {
      // Roll back on failure: the user SHOULD NOT THINK they are following.
      setFollowedIds((current) => {
        const next = new Set(current)
        if (wasFollowed) next.add(active.id)
        else next.delete(active.id)
        return next
      })
      toast.error(txa('Takip durumu güncellenemedi.'))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="px-4" data-testid="home-mobile-hero">
      <div
        className="overflow-hidden rounded-2xl border border-border bg-card touch-pan-y select-none"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onClickCapture={onClickCapture}
      >
        <Link to={to} className="relative block h-[201px]" draggable={false}>
          <img
            src={optimizePublicImageUrl(active.coverImage) || active.coverImage || buildCoverPlaceholder(active.title)}
            fetchPriority="high"
            loading="eager"
            decoding="async"
            onError={(event) => { event.currentTarget.src = buildCoverPlaceholder(active.title) }}
            alt=""
            className="size-full object-cover object-[center_28%]"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-card to-transparent to-45%" />

          {active.isNew ? (
            <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-black/55 px-2.5 py-1.5 text-[10px] font-black tracking-[0.09em] text-primary backdrop-blur-sm">
              {tx('YENİ')}
            </span>
          ) : null}

          {typeof active.rating === 'number' && active.rating > 0 ? (
            <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-1.5 text-xs font-black text-black">
              <Star className="size-3 fill-current" aria-hidden="true" />
              {active.rating.toFixed(1)}
            </span>
          ) : null}
        </Link>

        <div className="min-h-[236px] px-4 pb-4 pt-3">
          <h2 className="m-0 line-clamp-2 text-[22px] font-black leading-[1.15] tracking-[-0.01em] text-foreground">
            {active.title}
          </h2>

          {active.genres && active.genres.length > 0 ? (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {active.genres.slice(0, 3).map((genre) => (
                <span
                  key={genre}
                  className="rounded-lg border border-border bg-muted/60 px-2.5 py-1 text-[11px] font-bold text-muted-foreground"
                >
                  {tx(genre)}
                </span>
              ))}
            </div>
          ) : null}

          {active.description ? (
            <p className="m-0 mt-2.5 line-clamp-2 text-[13px] leading-[1.55] text-muted-foreground">
              {active.description}
            </p>
          ) : null}

          <div className="mt-3.5 flex gap-2.5">
            <Link
              to={to}
              className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-[14px] bg-primary text-[15px] font-extrabold text-primary-foreground"
            >
              <Play className="size-[18px] fill-current" aria-hidden="true" />
              {tx('Şimdi Oku')}
            </Link>
            {/*
              Handoff'ta ikinci dugme "Detaylar" degil YER IMI — ve artik
              GERCEKTEN takip ediyor. Onceki halde yalnizca manga sayfasina
              gidiyordu: "Kitapligima ekle" yazip hicbir sey eklemeyen bir
              dugme, calismayan dugmeden daha kotudur.
            */}
            <button
              type="button"
              onClick={() => { void toggleFollow() }}
              disabled={busyId === active.id}
              aria-pressed={isFollowed}
              aria-label={isFollowed ? tx('Takibi bırak') : tx('Takip et')}
              className={cn(
                'grid size-12 shrink-0 place-items-center rounded-[14px] border transition-colors',
                isFollowed
                  ? 'border-primary/40 bg-primary/10 text-primary'
                  : 'border-border text-foreground',
              )}
            >
              {isFollowed ? (
                <BookmarkCheck className="size-5" aria-hidden="true" />
              ) : (
                <Bookmark className="size-5" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
      </div>

      <div className="min-h-[46px]">{slides.length > 1 ? (
        <div className="mt-0.5 flex items-center justify-center">
          {slides.map((slide, slideIndex) => (
            <button
              key={slide.id}
              type="button"
              onClick={() => setIndex(slideIndex)}
              aria-label={tx('{number}. seri', { number: slideIndex + 1 })}
              aria-current={slide.id === active.id ? 'true' : undefined}
              // 44px touch target; the visible dot is small but the tappable area is not.
              className="grid size-11 place-items-center"
            >
              <span
                className={cn(
                  'block h-1.5 rounded-full transition-all',
                  slide.id === active.id ? 'w-5 bg-primary' : 'w-1.5 bg-muted-foreground/40',
                )}
              />
            </button>
          ))}
        </div>
      ) : null}</div>
    </section>
  )
}
