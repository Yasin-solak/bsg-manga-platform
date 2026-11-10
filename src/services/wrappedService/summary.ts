import { buildWrappedSummary } from './summary.aggregate'
import { fetchWrappedSummaryPayload } from './summary.fetch'
import type { WrappedPeriod, WrappedSummary } from './types'

export async function listUserWrappedSummary(userId: string, period: WrappedPeriod): Promise<WrappedSummary> {
  const payload = await fetchWrappedSummaryPayload(userId, period)
  return buildWrappedSummary(payload.readingRows, payload.counts, period)
}
