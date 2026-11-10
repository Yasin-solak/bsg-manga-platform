import { useEffect, useState } from 'react'
import { slowmodeDeadline, slowmodeRemaining } from '@/lib/communitySlowmode'

export function useCommunitySlowmode(nextSend: string | null, serverNow: string) {
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    const deadline = slowmodeDeadline(nextSend, serverNow, performance.now())
    const update = () => setSeconds(slowmodeRemaining(deadline, performance.now()))
    update()
    const interval = setInterval(update, 250)
    return () => clearInterval(interval)
  }, [nextSend, serverNow])
  return seconds
}
