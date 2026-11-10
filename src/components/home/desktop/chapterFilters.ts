import type { LatestChapterItem } from '@/services/latestChapterFeedService'
export type ChapterTab = 'all' | 'today' | 'yesterday' | 'week'
/** Publish time is used; a manga edit date is not a chapter release. */
export function filterDesktopChapters(rows: LatestChapterItem[], tab: ChapterTab, now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const start = new Date(today)
  if (tab === 'yesterday') start.setDate(start.getDate() - 1)
  if (tab === 'week') start.setDate(start.getDate() - ((start.getDay() + 6) % 7))
  return rows.filter(row => {
    const published = row.publishAt ? new Date(row.publishAt).getTime() : NaN
    if (!Number.isFinite(published) || published > now.getTime()) return false
    return tab === 'all' || (published >= start.getTime() && (tab !== 'yesterday' || published < today.getTime()))
  })
}
