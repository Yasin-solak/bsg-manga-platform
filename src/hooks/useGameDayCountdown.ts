import { useEffect, useState } from 'react'
import { formatCountdown, msUntilNextGameDay } from '@/lib/gameClock'

/** Time left until the new game day (Istanbul midnight), updated every second. */
export function useGameDayCountdown() {
  const [ms, setMs] = useState(() => msUntilNextGameDay())
  useEffect(() => {
    const timer = window.setInterval(() => setMs(msUntilNextGameDay()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  return formatCountdown(ms)
}
