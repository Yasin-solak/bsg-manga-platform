import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion'
import { cn } from '@/lib/utils'
import { catchIstilaSpawn, getIstilaStatus, requestIstilaSpawn, toIstilaErrorMessage, type IstilaSpawn } from '@/services/istilaService'
import { toast } from '@/services/toastService'
import { MurekCousin } from './MurekCousin'
import { MUREK_COUSIN_NAMES } from './murekCousins'
import { txa } from '@/i18n/activeLocale'

/*
 * Mürek Invasion: after a signed-in user stays on a page a while, the server is asked for a cousin spawn;
 * if one spawns it walks in step by step from a screen edge, a click catches it (Coin + counter),
 * otherwise it runs off. Spawn decisions, the daily limit and rewards are on the server; this is display only.
 */

type Phase = 'enter' | 'idle' | 'leave' | 'caught'
interface Shown extends IstilaSpawn { side: 'left' | 'right', top: number }

const DWELL_MIN_MS = 7000
const DWELL_JITTER_MS = 7000
const limitKey = () => `bsg:istila-limit:${new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' })}`

function readLimitFlag() {
  try { return window.localStorage.getItem(limitKey()) === '1' } catch { return false }
}
function writeLimitFlag() {
  try { window.localStorage.setItem(limitKey(), '1') } catch { /* yalniz bu oturum */ }
}

export function IstilaSpawner() {
  const { currentUser, updateCurrentUser } = useAuth()
  const location = useLocation()
  const reducedMotion = usePrefersReducedMotion()
  const [active, setActive] = useState(false)
  const [shown, setShown] = useState<Shown | null>(null)
  const [phase, setPhase] = useState<Phase>('enter')
  const [frame, setFrame] = useState<0 | 1>(0)
  const [reward, setReward] = useState<number | null>(null)
  const busy = useRef(false)
  const userId = currentUser?.id ?? null

  // Is the event on? (once per session)
  useEffect(() => {
    if (!userId) { setActive(false); return undefined }
    let cancelled = false
    void getIstilaStatus().then((status) => { if (!cancelled) setActive(Boolean(status?.active)) }).catch(() => undefined)
    return () => { cancelled = true }
  }, [userId])

  // On page change the wait timer resets; a spawn is requested after staying on the page.
  useEffect(() => {
    if (!active || !userId || shown || readLimitFlag()) return undefined
    const timer = window.setTimeout(async () => {
      if (document.visibilityState !== 'visible' || busy.current) return
      busy.current = true
      try {
        const surface = location.pathname.split('/')[1] || 'ana-sayfa'
        const spawn = await requestIstilaSpawn(surface)
        if (spawn === 'limit') { writeLimitFlag(); return }
        if (!spawn) return
        setReward(null)
        setPhase('enter')
        setShown({ ...spawn, side: Math.random() < 0.5 ? 'left' : 'right', top: 30 + Math.round(Math.random() * 40) })
      } catch {
        // Sessiz: etkinlik ikincil; hata kullaniciyi rahatsiz etmesin.
      } finally {
        busy.current = false
      }
    }, DWELL_MIN_MS + Math.random() * DWELL_JITTER_MS)
    return () => window.clearTimeout(timer)
  }, [active, userId, shown, location.pathname])

  // Enter -> wait -> escape timing and a two-frame walk.
  useEffect(() => {
    if (!shown) return undefined
    const timers = [
      window.setTimeout(() => setPhase((p) => (p === 'enter' ? 'idle' : p)), 450),
      window.setTimeout(() => setPhase((p) => (p === 'caught' ? p : 'leave')), Math.max(1500, shown.ttlMs - 700)),
      window.setTimeout(() => setShown((s) => (s && s.spawnId === shown.spawnId ? null : s)), shown.ttlMs + 300),
    ]
    const walk = window.setInterval(() => setFrame((f) => (f === 0 ? 1 : 0)), 320)
    return () => { timers.forEach((t) => window.clearTimeout(t)); window.clearInterval(walk) }
  }, [shown])

  if (!shown) return null

  const name = txa(MUREK_COUSIN_NAMES[shown.kind])
  const handleCatch = async () => {
    if (phase === 'caught' || phase === 'leave') return
    setPhase('caught')
    try {
      const result = await catchIstilaSpawn(shown.spawnId)
      setReward(result.reward)
      updateCurrentUser({ stones: result.balance })
      toast.success(txa('{v1} yakalandı! +{v2} Coin · bugün {v3}/{v4} · koleksiyon {v5}/5', { v1: name, v2: result.reward, v3: result.today, v4: result.dailyLimit, v5: result.kinds.length }))
      if (result.badgeAwarded) toast.success(txa('Beş kuzenin hepsini yakaladın: İstila Avcısı rozeti senin!'))
      if (result.today >= result.dailyLimit) writeLimitFlag()
    } catch (error) {
      toast.info(toIstilaErrorMessage(error))
    } finally {
      window.setTimeout(() => setShown(null), 900)
    }
  }

  const offscreen = phase === 'enter' || phase === 'leave'
  return (
    <button
      type='button'
      onClick={() => { void handleCatch() }}
      aria-label={txa('{v1} — yakalamak için tıkla', { v1: name })}
      data-testid='istila-spawn'
      data-kind={shown.kind}
      className={cn(
        'fixed z-[300] flex flex-col items-center p-1 outline-none transition-transform duration-[450ms] ease-out focus-visible:ring-2 focus-visible:ring-primary',
        shown.side === 'left' ? 'left-0 lg:left-60' : 'right-0',
        phase === 'caught' ? 'cursor-default' : 'cursor-pointer',
      )}
      style={{
        top: `${shown.top}vh`,
        transform: offscreen ? `translateX(${shown.side === 'left' ? '-110%' : '110%'})` : 'translateX(0)',
      }}
    >
      {reward !== null && (
        <span className='absolute -top-6 text-[15px] font-black text-amber-300 drop-shadow-[0_2px_0_#15122a]'>+{reward}</span>
      )}
      <span className={cn('block', !reducedMotion && phase !== 'caught' && 'animate-[istila-bob_0.64s_steps(1,end)_infinite]', phase === 'caught' && 'scale-110 opacity-70 transition-all duration-500')}>
        <MurekCousin kind={shown.kind} size={58} frame={reducedMotion ? 0 : frame} className={shown.side === 'left' ? '' : '-scale-x-100'} />
      </span>
      <style>{'@keyframes istila-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}'}</style>
    </button>
  )
}
