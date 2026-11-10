import { useEffect, useMemo, useState } from 'react'
import { Link } from '@/i18n/router'
import { Info, Play, Star } from 'lucide-react'
import type { Manga } from '@/types'
import { Button } from '@/components/ui/button'
import { buildCoverPlaceholder } from '@/lib/coverPlaceholder'
import { buildPublicMangaPath } from '@/lib/routes'
import { optimizePublicImageUrl } from '@/lib/optimizedPublicImageUrl'
import { cn } from '@/lib/utils'
import { useReadyHeroManga } from './useReadyHeroManga'
import { useTx } from '@/i18n/LocaleProvider'
import { intlLocale, txa } from '@/i18n/activeLocale'

interface HomeHeroProps {
  mangas: Manga[]
  loading?: boolean
}

const STATUS_LABELS: Record<NonNullable<Manga['status']>, string> = {
  get completed() { return txa('Tamamlandı') },
  get hiatus() { return txa('Ara Verildi') },
  get ongoing() { return txa('Devam Ediyor') },
}

export function HomeHero({ mangas, loading = false }: HomeHeroProps) {
  const heroMangas = useMemo(
    () => mangas.filter((item) => Boolean(item?.id && item.title)).slice(0, 5),
    [mangas],
  )
  const tx = useTx()
  const [paused, setPaused] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const requestedManga = heroMangas[activeIndex] || null
  const manga = useReadyHeroManga(requestedManga)
  const pending = loading || Boolean(requestedManga && !manga)

  useEffect(() => {
    if (activeIndex >= heroMangas.length) setActiveIndex(0)
  }, [activeIndex, heroMangas.length])

  useEffect(() => {
    if (loading || !manga || manga.id !== requestedManga?.id || paused || window.matchMedia('(prefers-reduced-motion: reduce)').matches || heroMangas.length <= 1) return undefined

    const intervalId = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % heroMangas.length)
    }, 7000)

    return () => window.clearInterval(intervalId)
  }, [heroMangas.length, paused, loading, manga, requestedManga?.id])

  if (pending || !manga) {
    return <section aria-busy={pending} aria-label={tx('Öne çıkan seri')} className="relative h-[500px] overflow-hidden rounded-xl border border-border/60 bg-muted/30 p-9 sm:h-[440px]">
      {pending ? <div role="status" className="motion-safe:animate-pulse">
        <span className="sr-only">{tx('Öne çıkan seri yükleniyor')}</span>
        <div aria-hidden="true" className="mt-5 h-8 w-36 rounded bg-muted" />
        <div aria-hidden="true" className="mt-5 h-16 w-2/3 rounded bg-muted" />
        <div aria-hidden="true" className="mt-5 h-12 w-3/4 rounded bg-muted" />
        <div aria-hidden="true" className="absolute bottom-8 h-11 w-64 rounded bg-muted" />
      </div> : <p className="text-sm text-muted-foreground">{tx('Şu anda gösterilecek öne çıkan seri yok.')}</p>}
    </section>
  }

  const coverImage = optimizePublicImageUrl(manga.coverImage)
    || manga.coverImage
    || buildCoverPlaceholder(manga.title)
  const mangaPath = buildPublicMangaPath({ id: manga.id, slug: manga.slug, title: manga.title })
  const displayRating = typeof manga.rating === 'number' && Number.isFinite(manga.rating)
    ? manga.rating.toFixed(1)
    : null
  const voteLabel = formatVoteLabel(manga.totalRatings)
  const chips = [
    ...(manga.genres || []).slice(0, 3),
    manga.genres?.length ? '' : manga.status ? tx(STATUS_LABELS[manga.status]) : '',
  ].filter(Boolean)

  return (
    <section onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocusCapture={() => setPaused(true)} onBlurCapture={() => setPaused(false)} className="dh-hero group relative h-[500px] overflow-hidden rounded-xl border border-border/60 bg-black shadow-sm sm:h-[440px]">
      <div className="absolute inset-0 bg-black">
        <img
          src={coverImage}
          alt=""
          loading="eager"
          decoding="async"
          className="h-full w-full scale-110 object-cover object-center opacity-40 blur-md"
          onError={(event) => {
            event.currentTarget.src = buildCoverPlaceholder(manga.title)
          }}
        />
        <div className="absolute inset-y-0 right-0 w-full overflow-hidden sm:left-[18%]">
          <img
            src={coverImage}
            alt=""
            fetchPriority="high"
            loading="eager"
            decoding="async"
            className="h-full w-full object-cover object-center transition-transform duration-700 group-hover:scale-[1.025]"
            onError={(event) => {
              event.currentTarget.src = buildCoverPlaceholder(manga.title)
            }}
          />
        </div>
        <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/60 to-black/10" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/72 via-black/10 to-black/20" />
      </div>

      <div className="relative z-10 flex h-full max-w-[640px] flex-col px-6 pb-8 pt-12 sm:px-9 sm:pt-14">
        <div className="inline-flex h-8 w-fit shrink-0 items-center gap-2 rounded-full border border-amber-400/20 bg-black/40 px-3 py-1.5 text-[11px] font-black uppercase tracking-wide text-amber-400 shadow-sm backdrop-blur-md">

          {tx('ÖNE ÇIKAN SERİ')}
        </div>

        <div className="mt-4 flex items-start">
          <h1 className="line-clamp-2 max-w-[560px] font-serif text-5xl font-black leading-[0.95] tracking-normal text-white drop-shadow-xl sm:text-6xl">
            {manga.title}
          </h1>
        </div>

        <div className="mt-3.5 flex h-8 flex-wrap items-start gap-2 overflow-hidden">
          {chips.map((chip) => (
            <span
              key={chip}
              className="rounded-md border border-white/10 bg-white/20 px-3 py-1.5 text-xs font-bold text-white/90 shadow-sm backdrop-blur-md"
            >
              {tx(chip)}
            </span>
          ))}
        </div>

        <div className="mt-4 h-12 max-w-[540px]">
          {manga.description ? (
            <p className="line-clamp-2 text-sm font-medium leading-6 text-white/82 sm:text-base">
              {manga.description}
            </p>
          ) : null}
        </div>

        <div className="dh-hero-actions mt-auto flex h-11 shrink-0 flex-wrap items-center gap-3">
          <Button asChild size="lg" className="h-11 gap-2 rounded-[10px] bg-primary px-[22px] text-primary-foreground shadow-lg shadow-primary/25 hover:bg-primary/90">
            <Link to={mangaPath}>
              <Play className="h-4 w-4 fill-current" />
              {tx('Okumaya Başla')}
            </Link>
          </Button>
          <Button
            asChild
            variant="secondary"
            size="lg"
            className="h-11 gap-2 rounded-[10px] border border-white/20 bg-white/10 px-[22px] text-white hover:bg-white/20"
          >
            <Link to={mangaPath}>
              <Info className="h-4 w-4" />
              {tx('Detaylar')}
            </Link>
          </Button>
          {displayRating && <span className="dh-hero-rating"><Star className="h-4 w-4 fill-current" />{displayRating}<small>{voteLabel}</small></span>}
        </div>

      </div>


      {heroMangas.length > 1 ? (
        <div className="absolute bottom-6 right-6 z-20 flex items-center gap-2">
          {heroMangas.map((item, index) => {
            const selected = item.id === manga.id

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveIndex(index)}
                className={cn(
                  'h-1.5 rounded-full transition-all duration-200',
                  selected ? 'w-6 bg-primary shadow-sm shadow-primary/40' : 'w-3 bg-white/50 hover:bg-white/80',
                )}
                aria-label={tx('{title} vitrinini göster', { title: item.title })}
              />
            )
          })}
        </div>
      ) : null}
    </section>
  )
}

function formatVoteLabel(value?: number) {
  if (!Number.isFinite(Number(value)) || Number(value) <= 0) return null

  return txa('{count} Oy', { count: Number(value).toLocaleString(intlLocale()) })
}
