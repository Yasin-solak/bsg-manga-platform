/**
 * activeEvents: active seasonal events (entity + quests, light)
 *
 * Calls the list_active_events RPC: active events' quests +
 * the event's DB metadata (title/theme/banner/structure) + chain is_locked.
 * groupActiveEvents groups per event (multiple event support).
 */

import { supabase } from '../supabase'
import { withAbortSignal, withServiceTimeout } from '../apiResilience'
import { toUserFacingErrorMessage } from '../userFacingError'
import { txa } from '@/i18n/activeLocale'

export interface ActiveEventQuest {
  questId: string
  slug: string
  title: string
  description: string
  metricKey: string
  targetValue: number
  progressValue: number
  isCompleted: boolean
  isClaimed: boolean
  isClaimable: boolean
  isLocked: boolean
  coinReward: number
  sortOrder: number
  unlockRequiresQuestId: string | null
  eventId: string
  eventSlug: string
  eventTitle: string
  eventDescription: string
  eventTheme: string
  eventBanner: string | null
  eventStructure: string
  eventSortOrder: number
  eventEndsAt: string | null
}

export interface ActiveEvent {
  id: string
  slug: string
  title: string
  description: string
  theme: string
  banner: string | null
  structure: string
  sortOrder: number
  endsAt: string | null
  quests: ActiveEventQuest[]
  claimableCount: number
  claimedCount: number
}

interface ActiveEventRow {
  quest_id: string
  slug: string
  title: string
  description: string | null
  metric_key: string
  target_value: number | string
  progress_value: number | string
  is_completed: boolean
  is_claimed: boolean
  is_claimable: boolean
  is_locked: boolean
  coin_reward: number | string
  sort_order: number | string
  unlock_requires_quest_id: string | null
  event_id: string
  event_slug: string
  event_title: string
  event_description: string | null
  event_theme: string
  event_banner: string | null
  event_structure: string
  event_sort_order: number | string
  event_ends_at: string | null
}

function mapRow(row: ActiveEventRow): ActiveEventQuest {
  return {
    questId: row.quest_id,
    slug: row.slug,
    title: txa(row.title),
    description: txa(row.description || ''),
    metricKey: row.metric_key,
    targetValue: Number(row.target_value) || 0,
    progressValue: Number(row.progress_value) || 0,
    isCompleted: row.is_completed,
    isClaimed: row.is_claimed,
    isClaimable: row.is_claimable,
    isLocked: row.is_locked,
    coinReward: Number(row.coin_reward) || 0,
    sortOrder: Number(row.sort_order) || 0,
    unlockRequiresQuestId: row.unlock_requires_quest_id,
    eventId: row.event_id,
    eventSlug: row.event_slug,
    eventTitle: row.event_title,
    eventDescription: row.event_description || '',
    eventTheme: row.event_theme,
    eventBanner: row.event_banner,
    eventStructure: row.event_structure,
    eventSortOrder: Number(row.event_sort_order) || 0,
    eventEndsAt: row.event_ends_at,
  }
}

export async function listActiveEvents(signal?: AbortSignal): Promise<ActiveEventQuest[]> {
  const { data, error } = await withServiceTimeout(
    (abortSignal) => withAbortSignal(supabase.rpc('list_active_events'), abortSignal),
    { label: 'Aktif etkinlikleri listeleme', signal },
  )
  if (error) throw new Error(toUserFacingErrorMessage(error, 'Aktif etkinlikler yuklenemedi.'))
  return ((data as ActiveEventRow[] | null) || []).map(mapRow)
}

export function groupActiveEvents(quests: ActiveEventQuest[]): ActiveEvent[] {
  const byEvent = new Map<string, ActiveEvent>()
  for (const q of quests) {
    let ev = byEvent.get(q.eventId)
    if (!ev) {
      ev = {
        id: q.eventId,
        slug: q.eventSlug,
        title: q.eventTitle,
        description: q.eventDescription,
        theme: q.eventTheme,
        banner: q.eventBanner,
        structure: q.eventStructure,
        sortOrder: q.eventSortOrder,
        endsAt: q.eventEndsAt,
        quests: [],
        claimableCount: 0,
        claimedCount: 0,
      }
      byEvent.set(q.eventId, ev)
    }
    ev.quests.push(q)
    if (q.isClaimable && !q.isClaimed) ev.claimableCount += 1
    if (q.isClaimed) ev.claimedCount += 1
  }
  const events = Array.from(byEvent.values())
  events.sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, 'tr'))
  for (const ev of events) ev.quests.sort((a, b) => a.sortOrder - b.sortOrder)
  return events
}
