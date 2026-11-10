import type { CommunityMessage } from '@/services/communityV2Service'

export function hasCommunityHistoryGap(previous: Pick<CommunityMessage, 'seq'>[], next: Pick<CommunityMessage, 'seq'>[]) {
  return previous.length > 0 && next.length > 0 && BigInt(previous[previous.length - 1].seq) + 1n < BigInt(next[0].seq)
}

export function mergeCommunityMessages(previous: CommunityMessage[], next: CommunityMessage[]) {
  // After a long disconnect we do not show history as continuous when messages may be missing.
  if (hasCommunityHistoryGap(previous, next)) return next
  const byId = new Map(previous.map(row => [row.id, row]))
  next.forEach(row => byId.set(row.id, row))
  return [...byId.values()].sort((a, b) => BigInt(a.seq) < BigInt(b.seq) ? -1 : 1).slice(-250)
}
