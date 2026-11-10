import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from '@/i18n/router'
import { Check, Clock3, Copy, Loader2, Search, X } from 'lucide-react'
import { ArcadeShell, GameTopBar, MurekSays } from '@/components/games/ArcadeKit'
import { useGameDayCountdown } from '@/hooks/useGameDayCountdown'
import type { MurekMood, MurekMotion } from '@/components/murek/Murek'
import { useAuth } from '@/contexts/AuthContext'
import { buildDailyGameShareText, dailyCoverRewardFor } from '@/lib/murek'
import { buildPublicMangaPath } from '@/lib/routes'
import { cn } from '@/lib/utils'
import { listMangas } from '@/services/mangaService'
import {
  fetchDailyGameImage,
  getDailyGame,
  submitDailyGameGuess,
  toDailyGameErrorMessage,
  type DailyGameKind,
  type DailyGameSnapshot,
} from '@/services/dailyGameService'
import { toast } from '@/services/toastService'
import { txa } from '@/i18n/activeLocale'

/*
 * Daily guessing games (Today's Cover, Panel Hunt): the same image for everyone, 6 tries. On each wrong guess
 * the server sharpens the image a bit. The suggestion list shows NO COVER (so the answer cannot be
 * found by matching images); title only.
 */

type Suggestion = { id: string, title: string }

const COPY: Record<DailyGameKind, { title: string, question: string, imageAlt: string, aspect: string }> = {
  cover: { get title() { return txa('Günün Kapağı') }, get question() { return txa('Bu kapak hangi seriye ait?') }, get imageAlt() { return txa('Bulanık kapak') }, aspect: 'aspect-[2/3]' },
  panel: { get title() { return txa('Panel Avı') }, get question() { return txa('Bu kare hangi seriden?') }, get imageAlt() { return txa('Bulanık bölüm karesi') }, aspect: 'aspect-[3/4]' },
}

function useDebouncedSearch(query: string, excludeIds: Set<string>) {
  const [results, setResults] = useState<Suggestion[]>([])
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) { setResults([]); setLoading(false); return }
    let cancelled = false
    setLoading(true)
    const timer = window.setTimeout(() => {
      void listMangas({ search: q, sort: 'popular', page: 1, limit: 8 })
        .then((page) => {
          if (cancelled) return
          setResults((page.data || []).filter((manga) => !excludeIds.has(manga.id)).map((manga) => ({ id: manga.id, title: manga.title })))
        })
        .catch(() => { if (!cancelled) setResults([]) })
        .finally(() => { if (!cancelled) setLoading(false) })
    }, 220)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [query, excludeIds])
  return { results, loading }
}

function ClarityMeter({ stage, max, finished }: { stage: number, max: number, finished: boolean }) {
  const lit = finished ? max : stage + 1
  return (
    <div className='flex items-center gap-2'>
      <span className='text-[10.5px] font-black uppercase tracking-wider text-white/80'>{txa('Netlik')}</span>
      <span className='flex gap-[3px]'>
        {Array.from({ length: max }, (_, index) => (
          <span key={index} className={cn('h-2.5 w-4', index < lit ? 'bg-[var(--arcade-coin)]' : 'bg-white/20')} />
        ))}
      </span>
    </div>
  )
}

export function DailyGuessGamePage({ kind }: { kind: DailyGameKind }) {
  const copy = COPY[kind]
  const { currentUser } = useAuth()
  const countdown = useGameDayCountdown()
  const [game, setGame] = useState<DailyGameSnapshot | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [imageError, setImageError] = useState(false)
  const [query, setQuery] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [reaction, setReaction] = useState<{ mood: MurekMood, motion: MurekMotion, key: number }>({ mood: 'think', motion: 'bob', key: 0 })
  const imageUrlRef = useRef<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoadError(null)
    void getDailyGame(kind)
      .then((snapshot) => {
        if (cancelled) return
        setGame(snapshot)
        if (snapshot.finished) setReaction({ mood: snapshot.solved ? 'cheer' : 'sad', motion: 'bob', key: 0 })
      })
      .catch((error) => { if (!cancelled) setLoadError(toDailyGameErrorMessage(error)) })
    return () => { cancelled = true }
  }, [currentUser?.id, kind])

  // The image depends on stage: requested again only when the stage changes.
  const stage = game?.stage
  const available = game?.available
  useEffect(() => {
    if (stage === undefined || !available) return
    const controller = new AbortController()
    setImageError(false)
    void fetchDailyGameImage(kind, controller.signal)
      .then((url) => {
        if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current)
        imageUrlRef.current = url
        setImageUrl(url)
      })
      .catch(() => { if (!controller.signal.aborted) setImageError(true) })
    return () => controller.abort()
  }, [stage, available, kind])

  useEffect(() => () => { if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current) }, [])

  const guessedIds = useMemo(() => new Set((game?.guesses ?? []).map((guess) => guess.mangaId)), [game?.guesses])
  const { results, loading: searching } = useDebouncedSearch(query, guessedIds)

  const submit = useCallback(async (suggestion: Suggestion) => {
    if (!game || submitting) return
    setSubmitting(true)
    try {
      const next = await submitDailyGameGuess(kind, suggestion.id)
      setGame(next)
      setQuery('')
      if (next.lastGuessCorrect) {
        setReaction((prev) => ({ mood: 'cheer', motion: 'jump', key: prev.key + 1 }))
      } else {
        setReaction((prev) => ({ mood: next.finished ? 'sad' : 'dizzy', motion: 'wobble', key: prev.key + 1 }))
      }
    } catch (error) {
      toast.error(toDailyGameErrorMessage(error))
    } finally {
      setSubmitting(false)
    }
  }, [game, kind, submitting])

  const remaining = game ? game.maxGuesses - game.guesses.length : 0
  const capLeft = game ? Math.max(0, game.dailyCoinCap - game.dailyCoinEarned) : 0
  // Rewards can change from the admin panel; the default table if the server has no list.
  const rewardFor = (guessNumber: number) => game?.rewards?.[guessNumber - 1] ?? dailyCoverRewardFor(guessNumber)
  const nextReward = game && !game.finished ? Math.min(rewardFor(game.guesses.length + 1), capLeft) : 0

  const bubble = !game ? '...' : game.finished
    ? game.solved
      ? (game.coinAwarded > 0 ? txa('Evet! {count}. tahminde bildin. +{coin} coin!', { count: game.guesses.length, coin: game.coinAwarded }) : txa('Bildin! Bugünkü oyun coinlerini zaten toplamıştın.'))
      : txa('Bu sefer olmadı. Cevaba bak, yarın yeni bir tane var!')
    : game.guesses.length === 0
      ? txa('{question} İlk tahminde bilirsen {coin} coin.', { question: txa(copy.question), coin: nextReward })
      : txa('Hmm, o değil. Görsel biraz netleşti. {count} hakkın kaldı.', { count: remaining })

  const copyShare = async () => {
    if (!game) return
    try {
      await navigator.clipboard.writeText(buildDailyGameShareText({ ...game, title: txa(copy.title) }))
      toast.success(txa('Sonuç kopyalandı'))
    } catch {
      toast.error(txa('Kopyalanamadı'))
    }
  }

  return (
    <ArcadeShell testId={`daily-${kind}-page`}>
      <GameTopBar
        title={txa(copy.title)}
        subtitle={game ? txa('{date} · herkese aynı bulmaca', { date: game.date }) : undefined}
        earned={currentUser && game ? game.dailyCoinEarned : undefined}
        cap={currentUser && game ? game.dailyCoinCap : undefined}
      />

      {loadError ? (
        <div className='px-frame p-8 text-center text-sm text-muted-foreground'>{loadError}</div>
      ) : !game ? (
        <div className='flex justify-center py-24'><Loader2 className='size-6 animate-spin text-muted-foreground' /></div>
      ) : !game.available ? (
        <div className='px-frame arcade-stage mx-auto max-w-xl p-8'>
          <MurekSays mood='think' size={88}>{game.disabled ? txa('Bu oyun şu an kapalı. Yakında tekrar açılacak!') : txa('Bu oyun için henüz yeterli içerik yok. Bölüm sayfaları biriktikçe kendiliğinden açılacak!')}</MurekSays>
        </div>
      ) : (
        <div className='grid gap-6 lg:grid-cols-[minmax(0,380px)_1fr] lg:items-start'>
          <div className='mx-auto w-full max-w-[240px] sm:max-w-[320px] lg:max-w-none'>
            <div className={cn('px-frame relative overflow-hidden bg-black', copy.aspect)} data-tone={game.finished ? (game.solved ? 'good' : 'bad') : 'ink'} data-testid='daily-guess-image'>
              {imageUrl && !imageError ? (
                <img src={imageUrl} alt={game.finished && game.answer ? `${game.answer.title}` : txa(copy.imageAlt)} className='size-full object-cover' draggable={false} />
              ) : (
                <div className='flex size-full items-center justify-center p-6 text-center text-xs text-white/70'>
                  {imageError ? txa('Görsel şu anda yüklenemedi.') : <Loader2 className='size-5 animate-spin' />}
                </div>
              )}
              <div className='absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-3 pb-3 pt-8'>
                <ClarityMeter stage={game.stage} max={game.maxGuesses} finished={game.finished} />
              </div>
            </div>
            <p className='m-0 mt-3 flex items-center justify-center gap-1.5 text-xs text-muted-foreground'>
              <Clock3 className='size-3.5' /> {txa('Yeni bulmaca')} <span className='font-mono font-black tabular-nums text-foreground'>{countdown}</span>
            </p>
          </div>

          <div className='min-w-0 space-y-4'>
            <MurekSays mood={reaction.mood} motion={reaction.motion} reactionKey={reaction.key} size={76}>{bubble}</MurekSays>

            {!game.finished && (
              currentUser ? (
                <div className='relative'>
                  <label className='px-frame flex items-center gap-3 px-4' data-tone='ink'>
                    <Search className='size-5 shrink-0 text-[var(--arcade-ink)]' />
                    <input
                      value={query}
                      onChange={(event) => setQuery(event.currentTarget.value)}
                      placeholder={txa('Seri adını yaz…')}
                      className='h-14 w-full bg-transparent text-base font-bold outline-none placeholder:font-medium'
                      disabled={submitting}
                      data-testid='daily-guess-input'
                      aria-label={txa('Tahmin')}
                      autoComplete='off'
                    />
                    {(searching || submitting) && <Loader2 className='size-4 shrink-0 animate-spin text-muted-foreground' />}
                  </label>
                  {results.length > 0 && (
                    <ul className='px-frame absolute inset-x-0 top-full z-20 mt-2 max-h-72 list-none overflow-auto p-1.5' role='listbox'>
                      {results.map((suggestion) => (
                        <li key={suggestion.id}>
                          <button
                            type='button'
                            onClick={() => void submit(suggestion)}
                            disabled={submitting}
                            className='w-full px-3 py-2.5 text-left text-sm font-bold text-foreground hover:bg-[color-mix(in_srgb,var(--arcade-ink)_14%,transparent)]'
                            data-testid='daily-guess-suggestion'
                          >
                            {suggestion.title}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : (
                <Link to='/giris' className='px-btn w-[calc(100%-6px)]'>{txa('Oynamak için giriş yap')}</Link>
              )
            )}

            <ol className='m-0 grid list-none gap-2 p-0' data-testid='daily-guess-list'>
              {Array.from({ length: game.maxGuesses }, (_, index) => {
                const guess = game.guesses[index]
                const reward = rewardFor(index + 1)
                return (
                  <li
                    key={index}
                    className={cn('px-frame flex h-11 items-center gap-3 pr-3 text-sm', !guess && 'opacity-60')}
                    data-tone={guess ? (guess.correct ? 'good' : 'bad') : undefined}
                  >
                    <span className={cn(
                      'grid h-full w-11 shrink-0 place-items-center font-mono text-xs font-black',
                      guess?.correct ? 'bg-[var(--arcade-good)] text-white' : guess ? 'bg-[var(--arcade-bad)] text-white' : 'bg-[color-mix(in_srgb,var(--foreground)_8%,transparent)] text-muted-foreground',
                    )}>
                      {guess ? (guess.correct ? <Check className='size-4' /> : <X className='size-4' />) : index + 1}
                    </span>
                    <span className={cn('min-w-0 flex-1 truncate font-bold', guess && !guess.correct && 'text-muted-foreground line-through')}>{guess?.title ?? ''}</span>
                    {!guess && <span className='font-mono text-[11px] font-bold text-muted-foreground'>{reward} coin</span>}
                  </li>
                )
              })}
            </ol>

            {game.finished && game.answer && (
              <div className='px-frame arcade-stage flex flex-wrap items-center gap-3 p-4' data-tone={game.solved ? 'good' : undefined}>
                <div className='min-w-0 flex-1'>
                  <p className='m-0 text-[10.5px] font-black uppercase tracking-wider text-muted-foreground'>{txa('Cevap')}</p>
                  <p className='m-0 truncate text-lg font-black text-foreground'>{game.answer.title}</p>
                </div>
                <Link to={buildPublicMangaPath({ id: game.answer.id, slug: game.answer.slug ?? undefined, title: game.answer.title })} className='px-btn'>{txa('Seriye git')}</Link>
                <button type='button' onClick={() => void copyShare()} className='px-btn' data-variant='ghost'>
                  <Copy className='size-4' />{txa('Paylaş')}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </ArcadeShell>
  )
}
