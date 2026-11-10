import { z } from 'zod'
import { withAbortSignal, withServiceTimeout } from './apiResilience'
import { supabase } from './supabase'

/*
 * Event archive (site_events): each event's rules, rewards and closing results. Closing is automatic
 * through a scheduled job on the server (site_events_tick, 10 min); the panel only reads.
 */

const winnerSchema = z.object({
  rank: z.number().int(),
  username: z.string().nullable(),
  displayName: z.string().nullable(),
  total: z.number().int(),
  prize: z.string().nullable().catch(null),
  grant: z.object({
    status: z.string(),
    orderCode: z.string().optional(),
    granted: z.number().int().optional(),
    fallbackCoin: z.number().int().optional(),
  }).nullable().catch(null),
})

const resultsSchema = z.object({
  participants: z.number().int().optional(),
  spawns: z.number().int().optional(),
  catches: z.number().int().optional(),
  coinsAwarded: z.number().int().optional(),
  badgeHolders: z.number().int().optional(),
  byKind: z.record(z.number()).optional(),
  top10: z.array(z.object({ rank: z.number().int(), username: z.string().nullable(), displayName: z.string().nullable(), total: z.number().int() })).optional(),
  winners: z.array(winnerSchema).optional(),
  note: z.string().optional(),
}).passthrough()

const eventSchema = z.object({
  slug: z.string(),
  name: z.string(),
  kind: z.enum(['collect', 'sale', 'contest', 'other']).catch('other'),
  summary: z.string().nullable(),
  seasonSlug: z.string().nullable(),
  startsAt: z.string(),
  endsAt: z.string(),
  status: z.enum(['scheduled', 'active', 'finalized', 'cancelled']),
  rules: z.record(z.unknown()).catch({}),
  prizes: z.array(z.record(z.unknown())).catch([]),
  results: resultsSchema.nullable().catch(null),
  finalizedAt: z.string().nullable(),
})

export type SiteEvent = z.infer<typeof eventSchema>
export type SiteEventWinner = z.infer<typeof winnerSchema>

export async function getAdminSiteEvents(): Promise<SiteEvent[]> {
  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(supabase.rpc('admin_site_events'), signal),
    { label: 'siteEventsService.adminList' },
  )
  if (error) throw error
  return z.array(eventSchema).parse(data ?? [])
}
