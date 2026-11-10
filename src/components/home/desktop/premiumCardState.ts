/** The last-seven-days warning is calculated from the membership end time. */
export function getPremiumCardState(expiresAt: string | null | undefined, now: number): { kind: 'offer' | 'hidden' | 'expiring'; days: number } {
  const remaining = expiresAt ? Date.parse(expiresAt) - now : NaN
  if (!Number.isFinite(remaining) || remaining <= 0) return { kind: 'offer', days: 0 }
  const days = Math.ceil(remaining / 86_400_000)
  return { kind: remaining <= 7 * 86_400_000 ? 'expiring' : 'hidden', days }
}
