// Server time is authoritative; a device clock running fast or slow does not break the wait.
export function slowmodeDeadline(nextSend: string | null, serverNow: string, monotonicNow: number): number {
  if (!nextSend) return monotonicNow
  const delay = Date.parse(nextSend) - Date.parse(serverNow)
  return monotonicNow + (Number.isFinite(delay) ? Math.max(0, delay) : 0)
}
export function slowmodeRemaining(deadline: number, monotonicNow: number): number {
  return Math.max(0, Math.ceil((deadline - monotonicNow) / 1000))
}
