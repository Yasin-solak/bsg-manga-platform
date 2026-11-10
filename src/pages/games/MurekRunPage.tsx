import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from '@/i18n/router'
import { Loader2, Play, RotateCcw } from 'lucide-react'
import { ArcadeShell, AttemptPips, GameTopBar, MurekSays } from '@/components/games/ArcadeKit'
import { MUREK_INK, murekFrame, type MurekRole } from '@/components/murek/murekSprite'
import { useMyMurekLook } from '@/hooks/useMyMurekLook'
import { useAuth } from '@/contexts/AuthContext'
import { RUNNER_TIERS, runnerTierCoin, type RunnerTier } from '@/lib/gameClock'
import { createRunnerState, jump, mixHex, RUNNER_WORLD, runnerScore, stepRunner, type RunnerState } from '@/lib/murekRunner'
import { cn } from '@/lib/utils'
import {
  finishDailyRun,
  getDailyRunStatus,
  runnerTiersOf,
  startDailyRun,
  toDailyGameErrorMessage,
  type DailyRunStatus,
} from '@/services/dailyGameService'
import { toast } from '@/services/toastService'
import { txa } from '@/i18n/activeLocale'

/*
 * Mürek Run: jump over ink blots. 3 rewarded attempts a day; when they run out or
 * signed out it is "practice" (no coins). The score is clipped by time on the server, the reward is incremental.
 */

type Phase = 'ready' | 'countdown' | 'playing' | 'over'

const SCALE = 2
const PIXEL = RUNNER_WORLD.murekSize / 16

function readThemeColor(name: string, fallback: string) {
  if (typeof window === 'undefined') return fallback
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}

function drawFrame(ctx: CanvasRenderingContext2D, state: RunnerState, groundOffset: number, colors: { line: string, ink: string, murek: string, accessory: string | null }) {
  const { width, height, groundY, murekX } = RUNNER_WORLD
  ctx.clearRect(0, 0, width, height)

  // Zemin: kayan kesikli cizgi.
  ctx.fillStyle = colors.line
  for (let x = -(groundOffset % 24); x < width; x += 24) ctx.fillRect(x, groundY, 12, 4)

  // Engeller: murekkep lekesi, sise, cift leke.
  const inkDark = mixHex(colors.ink, '#0b0a1a', 0.7)
  for (const obstacle of state.obstacles) {
    const top = groundY - obstacle.h
    if (obstacle.kind === 'bottle') {
      ctx.fillStyle = inkDark
      ctx.fillRect(obstacle.x, top + 14, obstacle.w, obstacle.h - 14)
      ctx.fillRect(obstacle.x + 7, top + 4, obstacle.w - 14, 10)
      ctx.fillStyle = colors.ink
      ctx.fillRect(obstacle.x + 5, top, obstacle.w - 10, 6)
      ctx.fillRect(obstacle.x + 4, top + 22, obstacle.w - 8, 12)
    } else {
      const blots = obstacle.kind === 'double' ? [0, 32] : [0]
      for (const offset of blots) {
        const x = obstacle.x + offset
        ctx.fillStyle = colors.ink
        ctx.fillRect(x + 6, top, 18, obstacle.h)
        ctx.fillRect(x, top + 8, 30, obstacle.h - 8)
        ctx.fillStyle = inkDark
        ctx.fillRect(x, groundY - 6, 30, 6)
      }
    }
  }

  // Mürek: same pixel data; steps between two frames while running.
  const frame = state.over ? 0 : (Math.floor(state.time * 8) % 2 === 0 ? 0 : 1)
  const palette = {
    body: colors.murek,
    shade: mixHex(colors.murek, '#0b0a1a', 0.72),
    light: mixHex(colors.murek, '#ffffff', 0.45),
    ink: '#15122a',
    blush: '#ff8fb1',
    tear: '#8fd3ff',
  }
  const top = groundY - RUNNER_WORLD.murekSize + state.y + PIXEL * 2
  // Kullanicinin Murek Dolabi gorunumu: renk + aksesuar (aksesuar pikselleri kendi rengini tasir).
  for (const [x, y, paint] of murekFrame(state.over ? 'dizzy' : state.y < 0 ? 'cheer' : 'happy', frame, colors.accessory)) {
    ctx.fillStyle = paint.startsWith('#') ? paint : palette[paint as MurekRole]
    ctx.fillRect(murekX + x * PIXEL, top + y * PIXEL, PIXEL, PIXEL)
  }
}

export default function MurekRunPage() {
  const { currentUser } = useAuth()
  const look = useMyMurekLook(currentUser?.id)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const stateRef = useRef<RunnerState>(createRunnerState())
  const runIdRef = useRef<string | null>(null)
  const [phase, setPhase] = useState<Phase>('ready')
  const [count, setCount] = useState(3)
  const [score, setScore] = useState(0)
  const [status, setStatus] = useState<DailyRunStatus | null>(null)
  const [result, setResult] = useState<{ score: number, coin: number, practice: boolean } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    void getDailyRunStatus('runner').then((next) => { if (!cancelled) setStatus(next) }).catch(() => {})
    return () => { cancelled = true }
  }, [currentUser?.id])

  // If an admin closed the game there are no rewarded attempts; practice stays open.
  const disabled = status?.enabled === false
  const canEarn = Boolean(currentUser) && !disabled && (status?.attemptsLeft ?? 0) > 0
  const tiers: ReadonlyArray<RunnerTier> = runnerTiersOf(status) ?? RUNNER_TIERS
  const ascendingTiers = [...tiers].sort((a, b) => a.score - b.score)

  // Ilk kare: Murek sahnede beklerken de gorunsun.
  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx || phase === 'playing') return
    ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0)
    ctx.imageSmoothingEnabled = false
    drawFrame(ctx, stateRef.current, 0, { line: readThemeColor('--muted-foreground', '#888'), ink: MUREK_INK, murek: look.colorHex, accessory: look.accessory })
  }, [phase, look.colorHex, look.accessory])

  const start = useCallback(async () => {
    if (busy) return
    setBusy(true)
    setResult(null)
    try {
      runIdRef.current = null
      if (canEarn) {
        const started = await startDailyRun('runner')
        runIdRef.current = started.runId ?? null
        setStatus(started)
      }
      stateRef.current = createRunnerState()
      setScore(0)
      setCount(3)
      setPhase('countdown')
    } catch (error) {
      toast.error(toDailyGameErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }, [busy, canEarn])

  // Geri sayim.
  useEffect(() => {
    if (phase !== 'countdown') return
    if (count <= 0) { setPhase('playing'); return }
    const timer = window.setTimeout(() => setCount((value) => value - 1), 550)
    return () => window.clearTimeout(timer)
  }, [phase, count])

  const finish = useCallback(async (finalScore: number) => {
    const runId = runIdRef.current
    if (!runId) {
      setResult({ score: finalScore, coin: 0, practice: true })
      return
    }
    try {
      const finished = await finishDailyRun(runId, finalScore, 0)
      setStatus(finished)
      setResult({ score: finished.score ?? finalScore, coin: finished.coinAwarded ?? 0, practice: false })
    } catch (error) {
      toast.error(toDailyGameErrorMessage(error))
      setResult({ score: finalScore, coin: 0, practice: false })
    } finally {
      runIdRef.current = null
    }
  }, [])

  // Oyun dongusu.
  useEffect(() => {
    if (phase !== 'playing') return
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!ctx) return
    ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0)
    ctx.imageSmoothingEnabled = false
    const colors = { line: readThemeColor('--muted-foreground', '#888'), ink: MUREK_INK, murek: look.colorHex, accessory: look.accessory }
    const state = stateRef.current
    let last = performance.now()
    let frameId = 0
    let lastHud = 0

    const loop = (now: number) => {
      stepRunner(state, (now - last) / 1000)
      last = now
      drawFrame(ctx, state, state.distance, colors)
      if (now - lastHud > 100) { setScore(runnerScore(state)); lastHud = now }
      if (state.over) {
        const finalScore = runnerScore(state)
        setScore(finalScore)
        setPhase('over')
        void finish(finalScore)
        return
      }
      frameId = requestAnimationFrame(loop)
    }
    frameId = requestAnimationFrame(loop)

    const onKey = (event: KeyboardEvent) => {
      if (event.code === 'Space' || event.code === 'ArrowUp' || event.code === 'KeyW') {
        event.preventDefault()
        jump(state)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => { cancelAnimationFrame(frameId); window.removeEventListener('keydown', onKey) }
  }, [phase, finish, look.colorHex, look.accessory])

  const best = status?.bestScore ?? null
  const nextTier = ascendingTiers.find((tier) => score < tier.score)

  return (
    <ArcadeShell testId='murek-run-page'>
      <GameTopBar
        title={txa('Mürek Koşusu')}
        subtitle={txa('Boşluk, ↑ ya da dokun: zıpla')}
        earned={currentUser && status ? status.dailyCoinEarned : undefined}
        cap={currentUser && status ? status.dailyCoinCap : undefined}
      />

      <div className='grid gap-5 lg:grid-cols-[1fr_260px]'>
        <div className='min-w-0'>
          <div
            className='px-frame arcade-stage relative flex min-h-[230px] select-none items-center overflow-hidden sm:min-h-0'
            data-tone='ink'
            onPointerDown={() => { if (phase === 'playing') jump(stateRef.current) }}
            data-testid='murek-run-stage'
          >
            <canvas
              ref={canvasRef}
              width={RUNNER_WORLD.width * SCALE}
              height={RUNNER_WORLD.height * SCALE}
              className='block h-auto w-full [image-rendering:pixelated]'
              aria-label={txa('Mürek Koşusu oyun alanı')}
            />
            <div className='pointer-events-none absolute right-3 top-3 font-mono text-lg font-black tabular-nums text-foreground' data-testid='murek-run-score'>
              {String(score).padStart(5, '0')}
            </div>

            {phase === 'countdown' && (
              <div className='absolute inset-0 grid place-items-center bg-[color-mix(in_srgb,var(--card)_40%,transparent)]'>
                <span className='font-mono text-6xl font-black text-[var(--arcade-ink)]'>{count > 0 ? count : txa('Koş!')}</span>
              </div>
            )}

            {(phase === 'ready' || phase === 'over') && (
              <div className='absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[color-mix(in_srgb,var(--card)_72%,transparent)] p-3 text-center backdrop-blur-[1px] sm:gap-3 sm:p-4'>
                {phase === 'over' && result ? (
                  <>
                    <p className='m-0 text-[11px] font-black uppercase tracking-[0.2em] text-muted-foreground'>{result.practice ? txa('Antrenman bitti') : txa('Deneme bitti')}</p>
                    <p className='m-0 font-mono text-3xl font-black tabular-nums text-foreground sm:text-4xl'>{result.score}</p>
                    {!result.practice && (
                      <p className={cn('m-0 text-sm font-black', result.coin > 0 ? 'text-[var(--arcade-good)]' : 'text-muted-foreground')}>
                        {result.coin > 0 ? txa('+{coin} coin!', { coin: result.coin }) : runnerTierCoin(result.score, tiers) > 0 ? txa('Bu kademenin coinini zaten almıştın.') : txa('Coin için {score} puan geç.', { score: ascendingTiers[0]?.score ?? 0 })}
                      </p>
                    )}
                  </>
                ) : phase === 'over' ? (
                  <Loader2 className='size-6 animate-spin text-muted-foreground' />
                ) : (
                  <p className='m-0 max-w-sm text-sm font-bold text-foreground'>{txa('Lekelere değmeden ne kadar uzağa gidebilirsin?')}</p>
                )}
                {currentUser ? (
                  <button type='button' className='px-btn' onClick={() => void start()} disabled={busy || (phase === 'over' && !result)} data-testid='murek-run-start'>
                    {phase === 'over' ? <RotateCcw className='size-4' /> : <Play className='size-4' />}
                    {canEarn ? (phase === 'over' ? txa('Tekrar dene') : txa('Başla')) : txa('Antrenman yap')}
                  </button>
                ) : (
                  <div className='flex flex-wrap justify-center gap-2'>
                    <button type='button' className='px-btn' data-variant='ghost' onClick={() => void start()} data-testid='murek-run-start'>{txa('Antrenman yap')}</button>
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
          <p className='m-0 mt-3 text-xs text-muted-foreground'>{txa('Masaüstünde boşluk tuşu ya da yukarı ok; telefonda oyun alanına dokun.')}</p>
        </div>

        <aside className='space-y-4'>
          <div className='px-frame p-4'>
            <MurekSays mood={phase === 'over' ? 'dizzy' : phase === 'playing' ? 'cheer' : 'happy'} size={56}>
              {phase === 'playing'
                ? (nextTier ? txa('{score} puanda +{coin}!', { score: nextTier.score, coin: nextTier.coin }) : txa('Efsane koşu!'))
                : phase === 'over' ? txa('Ah, leke! Bir daha?') : txa('Hazır mısın?')}
            </MurekSays>
          </div>
          <div className='px-frame p-4'>
            <p className='m-0 mb-2 text-[10.5px] font-black uppercase tracking-wider text-muted-foreground'>{txa('Ödül kademeleri')}</p>
            <ul className='m-0 list-none space-y-1.5 p-0'>
              {ascendingTiers.map((tier) => {
                const reached = (best ?? 0) >= tier.score
                return (
                  <li key={tier.score} className={cn('flex items-center justify-between font-mono text-sm', reached ? 'font-black text-[var(--arcade-good)]' : 'text-muted-foreground')}>
                    <span>{tier.score}+</span><span>{txa('+{v1} coin', { v1: tier.coin })}</span>
                  </li>
                )
              })}
            </ul>
            <p className='m-0 mt-3 text-[11.5px] leading-snug text-muted-foreground'>{txa('Coin gün içindeki en iyi kademene göre verilir; aynı kademe iki kez ödüllenmez.')}</p>
            {best !== null && <p className='m-0 mt-2 text-xs font-bold text-foreground'>{txa('Bugünkü en iyin:')} <span className='font-mono'>{best}</span></p>}
          </div>
        </aside>
      </div>
    </ArcadeShell>
  )
}
