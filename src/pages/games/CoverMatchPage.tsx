import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from '@/i18n/router'
import { Play, RotateCcw, Timer } from 'lucide-react'
import { ArcadeShell, AttemptPips, GameTopBar, MurekSays } from '@/components/games/ArcadeKit'
import { Murek } from '@/components/murek/Murek'
import { useAuth } from '@/contexts/AuthContext'
import { MATCH_TIERS, matchTierCoin, type MatchTier } from '@/lib/gameClock'
import { cn } from '@/lib/utils'
import { listMangas } from '@/services/mangaService'
import {
  finishDailyRun,
  getDailyRunStatus,
  matchTiersOf,
  startDailyRun,
  toDailyGameErrorMessage,
  type DailyRunCard,
  type DailyRunStatus,
} from '@/services/dailyGameService'
import { toast } from '@/services/toastService'
import { txa } from '@/i18n/activeLocale'

/*
 * Cover Match: 6 cover pairs. Time is measured on the server (the client timer is display only); the reward
 * is tiered by time and incremental. When attempts run out / signed out it is practice (no coins).
 */

type Tile = { key: string, card: DailyRunCard }
type Phase = 'ready' | 'playing' | 'done'

function shuffle<T>(items: T[]): T[] {
  const copy = [...items]
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1))
    ;[copy[index], copy[swap]] = [copy[swap], copy[index]]
  }
  return copy
}

function buildTiles(cards: DailyRunCard[]): Tile[] {
  return shuffle(cards.flatMap((card) => [{ key: `${card.id}:a`, card }, { key: `${card.id}:b`, card }]))
}

export default function CoverMatchPage() {
  const { currentUser } = useAuth()
  const [status, setStatus] = useState<DailyRunStatus | null>(null)
  const [phase, setPhase] = useState<Phase>('ready')
  const [tiles, setTiles] = useState<Tile[]>([])
  const [open, setOpen] = useState<number[]>([])
  const [matched, setMatched] = useState<Set<string>>(new Set())
  const [moves, setMoves] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [result, setResult] = useState<{ seconds: number, coin: number, practice: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const runIdRef = useRef<string | null>(null)
  const startedAtRef = useRef(0)

  useEffect(() => {
    let cancelled = false
    void getDailyRunStatus('match').then((next) => { if (!cancelled) setStatus(next) }).catch(() => {})
    return () => { cancelled = true }
  }, [currentUser?.id])

  // If an admin closed the game there are no rewarded attempts; practice stays open.
  const disabled = status?.enabled === false
  const canEarn = Boolean(currentUser) && !disabled && (status?.attemptsLeft ?? 0) > 0
  const tiers: ReadonlyArray<MatchTier> = [...(matchTiersOf(status) ?? MATCH_TIERS)].sort((a, b) => a.seconds - b.seconds)
  const finishCoin = status?.finishCoin ?? 2

  useEffect(() => {
    if (phase !== 'playing') return
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000)), 250)
    return () => window.clearInterval(timer)
  }, [phase])

  const start = useCallback(async () => {
    if (busy) return
    setBusy(true)
    setResult(null)
    try {
      let cards: DailyRunCard[] = []
      runIdRef.current = null
      if (canEarn) {
        const started = await startDailyRun('match')
        runIdRef.current = started.runId ?? null
        cards = started.board ?? []
        setStatus(started)
      } else {
        // Antrenman: populer serilerden rastgele 6 kapak.
        const page = await listMangas({ sort: 'popular', page: 1, limit: 30 })
        cards = shuffle((page.data || []).filter((manga) => manga.coverImage))
          .filter((manga, index, list) => list.findIndex((other) => other.coverImage === manga.coverImage) === index)
          .slice(0, 6)
          .map((manga) => ({ id: manga.id, title: manga.title, coverImage: manga.coverImage ?? null }))
      }
      if (cards.length < 6) throw new Error('GAME_UNAVAILABLE')
      setTiles(buildTiles(cards))
      setOpen([])
      setMatched(new Set())
      setMoves(0)
      setElapsed(0)
      startedAtRef.current = Date.now()
      setPhase('playing')
    } catch (error) {
      toast.error(toDailyGameErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }, [busy, canEarn])

  const complete = useCallback(async (finalMoves: number) => {
    const seconds = Math.floor((Date.now() - startedAtRef.current) / 1000)
    setPhase('done')
    const runId = runIdRef.current
    runIdRef.current = null
    if (!runId) { setResult({ seconds, coin: 0, practice: true }); return }
    try {
      const finished = await finishDailyRun(runId, 0, finalMoves)
      setStatus(finished)
      setResult({ seconds: finished.score ?? seconds, coin: finished.coinAwarded ?? 0, practice: false })
    } catch (error) {
      toast.error(toDailyGameErrorMessage(error))
      setResult({ seconds, coin: 0, practice: false })
    }
  }, [])

  const flip = (index: number) => {
    if (phase !== 'playing' || open.length >= 2 || open.includes(index) || matched.has(tiles[index].card.id)) return
    const nextOpen = [...open, index]
    setOpen(nextOpen)
    if (nextOpen.length < 2) return
    const nextMoves = moves + 1
    setMoves(nextMoves)
    const [first, second] = nextOpen.map((tileIndex) => tiles[tileIndex].card.id)
    if (first === second) {
      const nextMatched = new Set(matched).add(first)
      setMatched(nextMatched)
      setOpen([])
      if (nextMatched.size === tiles.length / 2) void complete(nextMoves)
    } else {
      window.setTimeout(() => setOpen([]), 650)
    }
  }

  const murekMood = phase === 'done' ? (result && result.coin > 0 ? 'cheer' : 'happy') : phase === 'playing' ? (matched.size >= 4 ? 'happy' : 'think') : 'idle'

  return (
    <ArcadeShell testId='cover-match-page'>
      <GameTopBar
        title={txa('Kapak Eşle')}
        subtitle={txa('Aynı kapakları eşleştir; ne kadar hızlı, o kadar coin')}
        earned={currentUser && status ? status.dailyCoinEarned : undefined}
        cap={currentUser && status ? status.dailyCoinCap : undefined}
      />

      <div className='grid gap-5 lg:grid-cols-[1fr_260px]'>
        <div className='px-frame arcade-stage relative p-3 sm:p-5' data-tone='ink'>
          <div className='mb-3 flex items-center justify-between font-mono text-sm font-black tabular-nums'>
            <span className='inline-flex items-center gap-1.5 text-foreground'><Timer className='size-4 text-[var(--arcade-ink)]' />{txa('{score} sn', { score: elapsed })}</span>
            <span className='text-muted-foreground'>{txa('{v1} hamle · {v2}/6', { v1: moves, v2: matched.size })}</span>
          </div>
          <div className='mx-auto grid max-w-[760px] grid-cols-4 gap-2 sm:grid-cols-6 sm:gap-3' data-testid='cover-match-grid'>
            {(tiles.length ? tiles : Array.from({ length: 12 }, () => null)).map((tile, index) => {
              const isOpen = tile ? open.includes(index) || matched.has(tile.card.id) : false
              const isMatched = tile ? matched.has(tile.card.id) : false
              return (
                <button
                  key={tile?.key ?? index}
                  type='button'
                  className={cn('flip-card aspect-[2/3] w-full', !tile && 'pointer-events-none opacity-60')}
                  data-open={isOpen}
                  onClick={() => flip(index)}
                  disabled={!tile || phase !== 'playing'}
                  aria-label={isOpen && tile ? tile.card.title : txa('Kapalı kart')}
                  data-testid='cover-match-tile'
                >
                  <span className='flip-card-inner block'>
                    <span className='flip-card-face flip-card-back grid place-items-center border-[3px] border-[var(--arcade-line)] [background:repeating-linear-gradient(45deg,color-mix(in_srgb,var(--arcade-ink)_30%,var(--card))_0_6px,var(--card)_6px_12px)]'>
                      <Murek mood='idle' motion='none' size={30} />
                    </span>
                    <span className={cn('flip-card-face flip-card-front overflow-hidden border-[3px]', isMatched ? 'border-[var(--arcade-good)]' : 'border-[var(--arcade-ink)]')}>
                      {tile?.card.coverImage && <img src={tile.card.coverImage} alt='' className='size-full object-cover' draggable={false} />}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>

          {phase !== 'playing' && (
            <div className='absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[color-mix(in_srgb,var(--card)_78%,transparent)] p-4 text-center backdrop-blur-[2px]'>
              {phase === 'done' && result ? (
                <>
                  <p className='m-0 text-[11px] font-black uppercase tracking-[0.2em] text-muted-foreground'>{result.practice ? txa('Antrenman bitti') : txa('Tamamlandı')}</p>
                  <p className='m-0 font-mono text-4xl font-black tabular-nums text-foreground'>{txa('{score} sn', { score: result.seconds })}</p>
                  <p className='m-0 text-xs text-muted-foreground'>{moves}{' '}{txa('hamle')}</p>
                  {!result.practice && (
                    <p className={cn('m-0 text-sm font-black', result.coin > 0 ? 'text-[var(--arcade-good)]' : 'text-muted-foreground')}>
                      {result.coin > 0 ? txa('+{coin} coin!', { coin: result.coin }) : txa("Bu süre {coin} coin'lik; bugün o kadarını almıştın.", { coin: matchTierCoin(result.seconds, tiers, finishCoin) })}
                    </p>
                  )}
                </>
              ) : (
                <p className='m-0 max-w-xs text-sm font-bold text-foreground'>{txa('Kartlar karışık. Aynı iki kapağı bulup eşleştir!')}</p>
              )}
              {currentUser ? (
                <button type='button' className='px-btn' onClick={() => void start()} disabled={busy} data-testid='cover-match-start'>
                  {phase === 'done' ? <RotateCcw className='size-4' /> : <Play className='size-4' />}
                  {canEarn ? (phase === 'done' ? txa('Tekrar dene') : txa('Başla')) : txa('Antrenman yap')}
                </button>
              ) : (
                <div className='flex flex-wrap justify-center gap-2'>
                  <button type='button' className='px-btn' data-variant='ghost' onClick={() => void start()} data-testid='cover-match-start'>{txa('Antrenman yap')}</button>
                  <Link to='/giris' className='px-btn'>{txa('Coin için giriş yap')}</Link>
                </div>
              )}
              {currentUser && status && (
                <span className='inline-flex items-center gap-2 text-xs text-muted-foreground'>
                  <AttemptPips left={status.attemptsLeft} max={status.maxAttempts} /> {disabled ? txa('Ödüllü denemeler şu an kapalı') : status.attemptsLeft > 0 ? txa('{count} ödüllü deneme', { count: status.attemptsLeft }) : txa('Ödüllü denemeler bitti')}
                </span>
              )}
            </div>
          )}
        </div>

        <aside className='space-y-4'>
          <div className='px-frame p-4'>
            <MurekSays mood={murekMood} size={56}>
              {phase === 'playing' ? (matched.size >= 4 ? txa('Az kaldı!') : txa('Hafızana güveniyorum.')) : phase === 'done' ? txa('Harika iş!') : txa('Hazır olunca başla.')}
            </MurekSays>
          </div>
          <div className='px-frame p-4'>
            <p className='m-0 mb-2 text-[10.5px] font-black uppercase tracking-wider text-muted-foreground'>{txa('Ödül kademeleri')}</p>
            <ul className='m-0 list-none space-y-1.5 p-0 font-mono text-sm text-muted-foreground'>
              {tiers.map((tier) => (
                <li key={tier.seconds} className='flex items-center justify-between'><span>≤ {txa('{score} sn', { score: tier.seconds })}</span><span>{txa('+{v1} coin', { v1: tier.coin })}</span></li>
              ))}
              <li className='flex items-center justify-between'><span>{txa('Bitirmek')}</span><span>{txa('+{coin} coin', { coin: finishCoin })}</span></li>
            </ul>
            <p className='m-0 mt-3 text-[11.5px] leading-snug text-muted-foreground'>{txa('Süreyi sunucu ölçer. Coin günün en iyi kademesine göre verilir.')}</p>
            {status?.bestScore !== null && status?.bestScore !== undefined && <p className='m-0 mt-2 text-xs font-bold text-foreground'>{txa('Bugünkü en iyin:')} <span className='font-mono'>{txa('{score} sn', { score: status.bestScore })}</span></p>}
          </div>
        </aside>
      </div>
    </ArcadeShell>
  )
}
