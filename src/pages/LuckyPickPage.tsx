import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from '@/i18n/router'
import { ChevronLeft, Play, Shuffle, Sparkles, Star } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { buildPublicMangaPath } from '@/lib/routes'
import {
  luckyReasonLabel,
  pickLucky,
  type LuckyPickResult,
} from '@/lib/luckyPick'
import { loadLuckyPickContext, type LuckyPickContext } from '@/services/luckyPickService'
import { cn } from '@/lib/utils'
import type { Manga } from '@/types'
import { txa } from '@/i18n/activeLocale'

/**
 * 'Lucky pick' screen: the three states from the design handoff.
 *
 * 1. Draw   : short, ~700ms. Not to make them wait, but to give the feel that the result
 * was "picked". A tap SKIPS it.
 * 2. Result : series + a badge saying WHY it came.
 * 3. Again  : spin again on the same screen.
 *
 * The badge does NOT fake personalization: a series from the surprise slice says "Surprise",
 * with weak signals "Completely random". Luck should not be a black box.
 */

const DRAW_MS = 700

export default function LuckyPickPage() {
  const { currentUser } = useAuth()
  const navigate = useNavigate()

  const [context, setContext] = useState<LuckyPickContext | null>(null)
  const [result, setResult] = useState<LuckyPickResult<Manga> | null>(null)
  const [drawing, setDrawing] = useState(true)
  const timerRef = useRef<number | null>(null)

  const draw = useCallback((ctx: LuckyPickContext) => {
    setDrawing(true)
    setResult(pickLucky<Manga>({
      candidates: ctx.candidates,
      genreSignals: ctx.genreSignals,
      excludeIds: ctx.excludeIds,
      random: Math.random,
    }))
    if (timerRef.current) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => setDrawing(false), DRAW_MS)
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const ctx = await loadLuckyPickContext(currentUser?.id)
      if (cancelled) return
      setContext(ctx)
      draw(ctx)
    })()
    return () => {
      cancelled = true
      if (timerRef.current) window.clearTimeout(timerRef.current)
    }
  }, [currentUser?.id, draw])

  /** The draw can be skipped: the wait is a show, not an obstacle. */
  const skip = () => {
    if (timerRef.current) window.clearTimeout(timerRef.current)
    setDrawing(false)
  }

  const manga = result?.manga ?? null
  const to = manga
    ? buildPublicMangaPath({ id: manga.id, slug: manga.slug, title: manga.title })
    : '/kesfet'

  return (
    <div className="mx-auto w-full max-w-md px-4 pb-10 pt-4 lg:max-w-4xl lg:px-6 lg:pt-8" data-testid="lucky-page">
      <div className="mb-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label={txa('Geri')}
          className="grid size-10 place-items-center rounded-xl text-muted-foreground"
        >
          <ChevronLeft className="size-6" aria-hidden="true" />
        </button>
        <h1 className="m-0 text-lg font-black text-foreground">{txa('Şans')}</h1>
      </div>

      {drawing || !context ? (
        <button
          type="button"
          onClick={skip}
          className="mt-16 flex w-full flex-col items-center"
          data-testid="lucky-drawing"
        >
          {/* Ust uste binmis uc kart: "seciliyor" hissi. */}
          <div className="relative h-[250px] w-[172px]">
            {[0, 1, 2].map((layer) => (
              <span
                key={layer}
                className={cn(
                  'absolute inset-0 rounded-2xl border border-border bg-muted',
                  layer === 0 && '-rotate-[8deg] -translate-x-4 opacity-45',
                  layer === 1 && 'rotate-[6deg] translate-x-3.5 opacity-60',
                  layer === 2 && 'animate-pulse',
                )}
              />
            ))}
          </div>
          <p className="m-0 mt-6 text-[19px] font-black text-foreground">
            {txa('Senin için bir şey seçiyoruz')}
          </p>
          <p className="m-0 mt-1 text-[13px] text-muted-foreground">
            {context && context.genreSignals.length >= 3
              ? txa('Okuduklarına göre biraz ağırlıklı')
              : txa('Katalogdan rastgele')}
          </p>
        </button>
      ) : !manga ? (
        <div className="mt-16 text-center" data-testid="lucky-empty">
          <p className="m-0 text-sm text-muted-foreground">
            {txa('Şu an çekilecek seri bulunamadı.')}
          </p>
          <Link to="/kesfet" className="mt-3 inline-block text-sm font-bold text-primary">
            {txa('Keşfet\'e git')}
          </Link>
        </div>
      ) : (
        <div data-testid="lucky-result">
          <div className="overflow-hidden rounded-[20px] border border-border bg-card lg:grid lg:grid-cols-[minmax(0,320px)_1fr]">
            <Link to={to} className="relative block h-[214px] lg:h-full lg:min-h-[460px]">
              <img src={manga.coverImage} alt="" className="size-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-card to-transparent to-55% lg:hidden" />

              {/* Rozet NEDEN geldigini soyler; "tamamen rastgele" de bir gerekcedir. */}
              <span
                className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-black/60 px-2.5 py-1.5 text-[10.5px] font-black uppercase tracking-[0.05em] text-primary backdrop-blur-sm"
                data-testid="lucky-reason"
              >
                <Sparkles className="size-3" aria-hidden="true" />
                {luckyReasonLabel(result!)}
              </span>

              {typeof manga.rating === 'number' && manga.rating > 0 ? (
                <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-1.5 text-xs font-black text-black">
                  <Star className="size-3 fill-current" aria-hidden="true" />
                  {manga.rating.toFixed(1)}
                </span>
              ) : null}
            </Link>

            <div className="px-4 pb-4 pt-3.5 lg:flex lg:flex-col lg:p-7">
              <h2 className="m-0 text-[21px] font-black leading-[1.15] text-foreground lg:text-3xl">
                {manga.title}
              </h2>

              {manga.genres && manga.genres.length > 0 ? (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {manga.genres.slice(0, 3).map((genre) => (
                    <span
                      key={genre}
                      className="rounded-lg border border-border bg-muted/60 px-2.5 py-1 text-[11px] font-bold text-muted-foreground"
                    >
                      {genre}
                    </span>
                  ))}
                </div>
              ) : null}

              {manga.description ? (
                <p className="m-0 mt-2.5 line-clamp-3 text-[13px] leading-[1.55] text-muted-foreground lg:mt-4 lg:line-clamp-[8] lg:text-sm">
                  {manga.description}
                </p>
              ) : null}

              <div className="lg:mt-auto lg:flex lg:gap-3 lg:pt-6">
              <Link
                to={to}
                className="mt-3.5 flex h-12 lg:mt-0 lg:flex-1 items-center justify-center gap-2 rounded-[14px] bg-primary text-[15px] font-extrabold text-primary-foreground"
              >
                <Play className="size-[18px] fill-current" aria-hidden="true" />
                {txa('Şimdi Oku')}
              </Link>

              <button
                type="button"
                onClick={() => context && draw(context)}
                className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-[14px] border border-border text-sm font-bold text-muted-foreground lg:mt-0 lg:h-12 lg:flex-1"
                data-testid="lucky-again"
              >
                <Shuffle className="size-4" aria-hidden="true" />
                {txa('Bir daha çevir')}
              </button>
              </div>
            </div>
          </div>

          <p className="mt-3.5 rounded-xl border border-dashed border-border p-3 text-[11.5px] leading-[1.55] text-muted-foreground">
            {txa('Zaten takip ettiğin ve okuduğun seriler havuza girmez. Bu yüzden “şans” sana bildiğini geri vermez.')}
          </p>
        </div>
      )}
    </div>
  )
}
