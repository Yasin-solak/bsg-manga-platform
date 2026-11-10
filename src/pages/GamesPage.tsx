import { useEffect, useState, type ReactNode } from 'react'
import { Link } from '@/i18n/router'
import { Clock3, Coins, Lock, ShieldCheck, Shuffle, Sparkles } from 'lucide-react'
import { ArcadeShell, AttemptPips, CoinMeter } from '@/components/games/ArcadeKit'
import { useGameDayCountdown } from '@/hooks/useGameDayCountdown'
import { MyMurek } from '@/components/murek/MyMurek'
import { useAuth } from '@/contexts/AuthContext'
import { maxTierCoin } from '@/lib/gameClock'
import { DAILY_COVER_REWARDS } from '@/lib/murek'
import { cn } from '@/lib/utils'
import {
  getDailyGame,
  getDailyRunStatus,
  type DailyGameSnapshot,
  type DailyRunStatus,
} from '@/services/dailyGameService'
import { txa } from '@/i18n/activeLocale'

/*
 * Mürek's Game Corner: daily puzzles (Today's Cover, Panel Hunt) and arcade games (Mürek
 * Run, Cover Match). Rules: no paid entry or luck, a shared daily coin cap, scores and
 * guesses are validated on the server.
 */

type Overview = {
  cover: DailyGameSnapshot | null
  panel: DailyGameSnapshot | null
  runner: DailyRunStatus | null
  match: DailyRunStatus | null
}

function GuessDots({ game }: { game: DailyGameSnapshot }) {
  return (
    <span className='inline-flex gap-1' aria-label={txa('{current}/{max} tahmin', { current: game.guesses.length, max: game.maxGuesses })}>
      {Array.from({ length: game.maxGuesses }, (_, index) => {
        const guess = game.guesses[index]
        return <span key={index} className='px-dot' data-state={guess ? (guess.correct ? 'good' : 'bad') : undefined} />
      })}
    </span>
  )
}

/* --- Card art: small scenes that explain the game at a glance. --- */

function CoverArt() {
  return (
    <div className='relative h-[150px] w-full' aria-hidden='true'>
      {[-10, 6, 0].map((rotate, index) => (
        <span
          key={index}
          className='absolute left-1/2 top-1/2 h-[118px] w-[80px] border-[3px] border-[var(--arcade-line)]'
          style={{
            transform: `translate(-50%, -50%) rotate(${rotate}deg) translateX(${(index - 1) * 26}px)`,
            background: index === 2
              ? 'linear-gradient(160deg, color-mix(in srgb, var(--arcade-ink) 70%, #000), color-mix(in srgb, #ff7aa8 60%, #000))'
              : 'color-mix(in srgb, var(--foreground) 10%, var(--card))',
            filter: index === 2 ? 'blur(1.5px)' : undefined,
          }}
        />
      ))}
      <span className='absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-4xl font-black text-white drop-shadow-[0_3px_0_rgb(0_0_0/0.4)]'>?</span>
    </div>
  )
}

function PanelArt() {
  return (
    <div className='relative mx-auto grid h-[124px] w-[100px] grid-cols-2 grid-rows-3 gap-1 border-[3px] border-[var(--arcade-line)] bg-[color-mix(in_srgb,var(--foreground)_6%,var(--card))] p-1' aria-hidden='true'>
      <span className='col-span-2 bg-[color-mix(in_srgb,var(--foreground)_14%,transparent)]' />
      <span className='bg-[color-mix(in_srgb,var(--foreground)_14%,transparent)]' />
      <span className='row-span-2 bg-[color-mix(in_srgb,var(--arcade-ink)_55%,transparent)] outline outline-[3px] outline-offset-2 outline-[var(--arcade-coin)]' />
      <span className='bg-[color-mix(in_srgb,var(--foreground)_14%,transparent)]' />
    </div>
  )
}

function RunnerArt() {
  return (
    <div className='relative flex h-full w-full items-end justify-center overflow-hidden pb-3' aria-hidden='true'>
      <div className='relative w-full max-w-[220px]'>
        <div className='flex items-end justify-between px-3'>
          <MyMurek mood='happy' motion='walk' size={54} />
          <span className='mb-[6px] h-[18px] w-[18px] bg-[var(--arcade-ink)] [clip-path:polygon(50%_0,100%_60%,80%_100%,20%_100%,0_60%)]' />
          <span className='mb-[6px] h-[28px] w-[16px] bg-[color-mix(in_srgb,var(--arcade-ink)_70%,#000)]' />
        </div>
        <div className='arcade-ground' data-moving='true' />
      </div>
    </div>
  )
}

function MatchArt() {
  const tiles = ['ink', 'back', 'coin', 'back', 'ink', 'back']
  return (
    <div className='grid grid-cols-3 gap-1.5' aria-hidden='true'>
      {tiles.map((tile, index) => (
        <span
          key={index}
          className='h-[52px] w-[38px] border-[3px] border-[var(--arcade-line)]'
          style={{
            background: tile === 'back'
              ? 'repeating-linear-gradient(45deg, color-mix(in srgb, var(--arcade-ink) 35%, var(--card)) 0 4px, var(--card) 4px 8px)'
              : tile === 'ink' ? 'color-mix(in srgb, var(--arcade-ink) 75%, #000)' : 'var(--arcade-coin)',
          }}
        />
      ))}
    </div>
  )
}

const CLOSED_TEXT = 'Bu oyun şu an kapalı.'

function GameCard({ to, locked, art, title, tagline, reward, footer, tone = 'default', testId }: {
  to: string
  locked?: string
  art: ReactNode
  title: string
  tagline: string
  reward: string
  footer?: ReactNode
  tone?: 'default' | 'ink'
  testId: string
}) {
  const body = (
    <>
      <div className='arcade-stage relative flex h-[150px] items-center justify-center overflow-hidden border-b-[3px] border-[var(--arcade-line)]'>
        {art}
        {locked && (
          <span className='absolute inset-0 flex items-center justify-center bg-[color-mix(in_srgb,var(--card)_72%,transparent)] backdrop-blur-[2px]'>
            <span className='inline-flex items-center gap-1.5 bg-foreground px-2.5 py-1 text-[11px] font-black uppercase tracking-wider text-background'><Lock className='size-3' />{locked === txa(CLOSED_TEXT) ? txa('Kapalı') : txa('Yakında')}</span>
          </span>
        )}
      </div>
      <div className='flex flex-1 flex-col gap-2 p-4'>
        <div className='flex items-start justify-between gap-3'>
          <h3 className='m-0 text-lg font-black tracking-tight text-foreground'>{title}</h3>
          <span className='inline-flex shrink-0 items-center gap-1 bg-[color-mix(in_srgb,var(--arcade-coin)_18%,transparent)] px-2 py-0.5 text-[11px] font-black text-[color-mix(in_srgb,var(--arcade-coin)_65%,var(--foreground))]'>
            <Coins className='size-3' />{reward}
          </span>
        </div>
        <p className='m-0 text-[13px] leading-snug text-muted-foreground'>{locked ?? tagline}</p>
        {footer && <div className='mt-auto flex min-h-6 items-center justify-between gap-2 pt-1'>{footer}</div>}
      </div>
    </>
  )
  const className = 'px-frame flex flex-col text-left'
  return locked
    ? <div className={cn(className, 'opacity-80')} data-testid={testId} aria-disabled='true'>{body}</div>
    : <Link to={to} className={className} data-testid={testId} data-tone={tone === 'ink' ? 'ink' : undefined}>{body}</Link>
}

function guessFooter(game: DailyGameSnapshot | null, signedIn: boolean) {
  if (!game) return null
  const label = !signedIn
    ? txa('Giriş yapınca oyna')
    : game.finished
      ? (game.solved ? txa('Bildin · +{coin}', { coin: game.coinAwarded }) : txa('Yarın tekrar'))
      : game.guesses.length > 0 ? txa('Devam et') : txa('Oyna')
  return (
    <>
      <GuessDots game={game} />
      <span className={cn('text-xs font-black', game.finished && game.solved ? 'text-[var(--arcade-good)]' : 'text-[var(--arcade-ink)]')}>{label} →</span>
    </>
  )
}

function runFooter(status: DailyRunStatus | null, signedIn: boolean, scoreLabel: (score: number) => string) {
  if (!status) return null
  return (
    <>
      <span className='inline-flex items-center gap-2'>
        <AttemptPips left={signedIn ? status.attemptsLeft : status.maxAttempts} max={status.maxAttempts} />
        {status.bestScore !== null && <span className='font-mono text-[11px] font-bold text-muted-foreground'>{txa('En iyi {v1}', { v1: scoreLabel(status.bestScore) })}</span>}
      </span>
      <span className='text-xs font-black text-[var(--arcade-ink)]'>{signedIn && status.attemptsLeft === 0 ? txa('Antrenman →') : txa('Oyna →')}</span>
    </>
  )
}

export default function GamesPage() {
  const { currentUser } = useAuth()
  const countdown = useGameDayCountdown()
  const [overview, setOverview] = useState<Overview>({ cover: null, panel: null, runner: null, match: null })

  useEffect(() => {
    let cancelled = false
    const settle = <T,>(promise: Promise<T>) => promise.catch(() => null)
    void Promise.all([
      settle(getDailyGame('cover')),
      settle(getDailyGame('panel')),
      settle(getDailyRunStatus('runner')),
      settle(getDailyRunStatus('match')),
    ]).then(([cover, panel, runner, match]) => {
      if (!cancelled) setOverview({ cover, panel, runner, match })
    })
    return () => { cancelled = true }
  }, [currentUser?.id])

  const signedIn = Boolean(currentUser)
  // Reward labels and closed states come from admin settings (in the server response).
  const guessTop = overview.cover?.rewards?.[0] ?? DAILY_COVER_REWARDS[0]
  const runnerTop = maxTierCoin(overview.runner?.tiers ?? [{ coin: 8 }])
  const matchTop = maxTierCoin(overview.match?.tiers ?? [{ coin: 8 }], overview.match?.finishCoin ?? 0)
  const closedText = txa(CLOSED_TEXT)
  const runLocked = (status: DailyRunStatus | null) => (status?.enabled === false ? closedText : undefined)
  const earned = Math.max(
    overview.cover?.dailyCoinEarned ?? 0,
    overview.runner?.dailyCoinEarned ?? 0,
    overview.match?.dailyCoinEarned ?? 0,
  )
  const cap = overview.cover?.dailyCoinCap ?? overview.runner?.dailyCoinCap ?? 30
  const capFull = signedIn && earned >= cap
  const greeting = !signedIn
    ? txa('Selam! Giriş yaparsan bildikçe coin kazanırsın.')
    : capFull
      ? txa('Bugünkü coinleri topladın! İstersen yine oynayabilirsin.')
      : overview.cover && !overview.cover.finished
        ? txa('Günün Kapağı seni bekliyor. Bakalım tanıyacak mısın?')
        : txa('Bugün ne oynuyoruz?')

  return (
    <ArcadeShell testId='games-page'>
      {/* Kahraman: Murek sahnede, gunun ozeti yaninda. */}
      <section className='px-frame arcade-stage overflow-hidden' data-tone='ink'>
        <div className='grid gap-6 p-5 sm:p-7 md:grid-cols-[1fr_auto] md:items-end'>
          <div className='flex items-end gap-4'>
            <div className='shrink-0'>
              <MyMurek mood={capFull ? 'full' : 'happy'} motion='bob' size={124} title={txa('Mürek')} />
              {signedIn && <Link to='/magaza/murek' className='mt-1 block text-center text-[11px] font-black text-[var(--arcade-ink)] hover:underline' data-testid='games-murek-wardrobe'>{txa('Mürek\'ini giydir →')}</Link>}
            </div>
            <div className='min-w-0 pb-3'>
              <p className='m-0 text-[11px] font-black uppercase tracking-[0.22em] text-[var(--arcade-ink)]'>{txa('Mürek\'in Oyun Köşesi')}</p>
              <h1 className='m-0 mt-1 text-3xl font-black leading-[1.05] tracking-tight text-foreground sm:text-4xl'>{txa('Günün oyunları')}</h1>
              <div className='px-bubble mt-3 max-w-md text-sm font-bold'>{greeting}</div>
            </div>
          </div>
          <div className='grid gap-3 md:min-w-[240px]'>
            {signedIn && (
              <div className='px-frame p-3'>
                <p className='m-0 mb-2 text-[10.5px] font-black uppercase tracking-wider text-muted-foreground'>{txa('Bugün kazandığın')}</p>
                <CoinMeter earned={earned} cap={cap} />
              </div>
            )}
            <div className='px-frame flex items-center gap-2.5 p-3'>
              <Clock3 className='size-4 text-muted-foreground' />
              <div>
                <p className='m-0 text-[10.5px] font-black uppercase tracking-wider text-muted-foreground'>{txa('Yeni bulmacalara')}</p>
                <p className='m-0 font-mono text-base font-black tabular-nums text-foreground'>{countdown}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <h2 className='mb-3 mt-8 text-[11px] font-black uppercase tracking-[0.2em] text-muted-foreground'>{txa('Günün bulmacaları')}</h2>
      <div className='grid gap-4 sm:grid-cols-2'>
        <GameCard
          to='/oyunlar/gunun-kapagi'
          testId='game-card-cover'
          tone='ink'
          art={<CoverArt />}
          title={txa('Günün Kapağı')}
          tagline={txa('Bulanık kapaktan seriyi bil. 6 hakkın var; her yanlışta kapak biraz netleşir.')}
          reward={txa('en fazla {coin}', { coin: guessTop })}
          locked={overview.cover?.disabled ? closedText : undefined}
          footer={guessFooter(overview.cover, signedIn)}
        />
        <GameCard
          to='/oyunlar/panel-avi'
          testId='game-card-panel'
          art={<PanelArt />}
          title={txa('Panel Avı')}
          tagline={txa('Bölüm sayfasından tek bir kare: hangi seri? 6 hakta bul.')}
          reward={txa('en fazla {coin}', { coin: guessTop })}
          locked={overview.panel?.disabled ? closedText : overview.panel && !overview.panel.available ? txa('Yeterli bölüm sayfası birikince kendiliğinden açılacak.') : undefined}
          footer={overview.panel?.available ? guessFooter(overview.panel, signedIn) : null}
        />
      </div>

      <h2 className='mb-3 mt-8 text-[11px] font-black uppercase tracking-[0.2em] text-muted-foreground'>{txa('Atari')}</h2>
      <div className='grid gap-4 sm:grid-cols-2'>
        <GameCard
          to='/oyunlar/murek-kosusu'
          testId='game-card-runner'
          art={<RunnerArt />}
          title={txa('Mürek Koşusu')}
          tagline={txa('Mürekkep lekelerinin üstünden zıpla, ne kadar uzağa gidebilirsin? Günde {count} deneme.', { count: overview.runner?.maxAttempts ?? 3 })}
          reward={txa('en fazla {coin}', { coin: runnerTop })}
          locked={runLocked(overview.runner)}
          footer={runFooter(overview.runner, signedIn, (score) => `${score}`)}
        />
        <GameCard
          to='/oyunlar/kapak-esle'
          testId='game-card-match'
          art={<MatchArt />}
          title={txa('Kapak Eşle')}
          tagline={txa('6 kapak çifti, bir sayaç. Ne kadar hızlı eşleştirirsen o kadar coin. Günde {count} deneme.', { count: overview.match?.maxAttempts ?? 3 })}
          reward={txa('en fazla {coin}', { coin: matchTop })}
          locked={runLocked(overview.match)}
          footer={runFooter(overview.match, signedIn, (score) => txa('{score} sn', { score }))}
        />
      </div>

      <Link to='/sans' className='px-frame mt-6 flex items-center gap-4 p-4' data-testid='game-card-luck'>
        <span className='grid size-11 shrink-0 place-items-center bg-[var(--arcade-ink)] text-white'><Shuffle className='size-5' /></span>
        <span className='min-w-0 flex-1'>
          <span className='block text-[15px] font-black text-foreground'>{txa('Şans')}</span>
          <span className='block text-[13px] text-muted-foreground'>{txa('Ne okusam? Okuduklarına göre sana yeni bir seri çeksin.')}</span>
        </span>
        <span className='text-xs font-black text-[var(--arcade-ink)]'>{txa('Çek →')}</span>
      </Link>

      <div className='mt-8 grid gap-3 text-[12.5px] text-muted-foreground sm:grid-cols-3'>
        <p className='m-0 flex items-start gap-2'><Coins className='mt-0.5 size-4 shrink-0 text-[var(--arcade-coin)]' />{txa('Oyunlardan günde en fazla {cap} coin; hepsi ortak bir tavana sayılır.', { cap })}</p>
        <p className='m-0 flex items-start gap-2'><Sparkles className='mt-0.5 size-4 shrink-0 text-[var(--arcade-ink)]' />{txa('Coin ile giriş yok, rastgele ödül yok. Bilgin ve becerin konuşur.')}</p>
        <p className='m-0 flex items-start gap-2'><ShieldCheck className='mt-0.5 size-4 shrink-0 text-[var(--arcade-good)]' />{txa('Tahminler ve skorlar sunucuda kontrol edilir.')}</p>
      </div>
    </ArcadeShell>
  )
}
