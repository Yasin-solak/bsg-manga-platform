import { withAbortSignal, withServiceTimeout } from '../apiResilience'
import { createScopedLogger } from '../logger'
import { supabase } from '../supabase'
import { toUserFacingErrorMessage } from '../userFacingError'

/*
 * Fansub studio "Community" tab: summary of the fansub's community v2 server
 * (members, message pulse, channels, pending moderation). Replaces the old post feed (v1).
 * Returns server null and canCreate if there is no server.
 */

export type FansubCommunityJoinMode = 'open' | 'invite' | 'request'

export interface FansubCommunityV2Channel {
  id: string
  name: string
  category: string
  isPrivate: boolean
  archived: boolean
  mangaTitle: string | null
  messages7d: number
  lastMessageAt: string | null
}

export interface FansubCommunityV2Stats {
  members: number
  newMembers7d: number
  banned: number
  messages7d: number
  chatters7d: number
  channels: number
  roles: number
  pendingJoinRequests: number
  openReports: number
  activeInvites: number
}

export interface FansubCommunityV2Summary {
  /** community.enabled flag: if off, the server is not visible to readers. */
  enabled: boolean
  canCreate: boolean
  adminCount: number
  server: {
    id: string
    name: string
    joinMode: FansubCommunityJoinMode
    archivedAt: string | null
    createdAt: string | null
    isMember: boolean
    isOwner: boolean
  } | null
  stats: FansubCommunityV2Stats
  channels: FansubCommunityV2Channel[]
  daily: Array<{ day: string; messages: number }>
}

type JsonObject = Record<string, unknown>

const logger = createScopedLogger('fansubManageService/communityV2Summary')

const num = (value: unknown) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}
const str = (value: unknown) => (typeof value === 'string' && value.trim() ? value : null)
const obj = (value: unknown): JsonObject => (value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonObject) : {})
const list = (value: unknown) => (Array.isArray(value) ? value.map(obj) : [])

export const EMPTY_FANSUB_COMMUNITY_V2_STATS: FansubCommunityV2Stats = {
  members: 0, newMembers7d: 0, banned: 0, messages7d: 0, chatters7d: 0,
  channels: 0, roles: 0, pendingJoinRequests: 0, openReports: 0, activeInvites: 0,
}

function toJoinMode(value: unknown): FansubCommunityJoinMode {
  return value === 'invite' || value === 'request' ? value : 'open'
}

export function mapFansubCommunityV2Summary(raw: unknown): FansubCommunityV2Summary {
  const payload = obj(Array.isArray(raw) ? raw[0] : raw)
  const server = payload.server ? obj(payload.server) : null
  const stats = obj(payload.stats)
  return {
    enabled: payload.enabled === true,
    canCreate: payload.canCreate === true,
    adminCount: num(payload.adminCount),
    server: server && str(server.id)
      ? {
          id: String(server.id),
          name: str(server.name) || 'Sunucu',
          joinMode: toJoinMode(server.joinMode),
          archivedAt: str(server.archivedAt),
          createdAt: str(server.createdAt),
          isMember: server.isMember === true,
          isOwner: server.isOwner === true,
        }
      : null,
    stats: Object.fromEntries(
      Object.keys(EMPTY_FANSUB_COMMUNITY_V2_STATS).map((key) => [key, num(stats[key])]),
    ) as unknown as FansubCommunityV2Stats,
    channels: list(payload.channels)
      .filter((entry) => str(entry.id))
      .map((entry) => ({
        id: String(entry.id),
        name: str(entry.name) || 'kanal',
        category: str(entry.category) || '',
        isPrivate: entry.isPrivate === true,
        archived: entry.archived === true,
        mangaTitle: str(entry.mangaTitle),
        messages7d: num(entry.messages7d),
        lastMessageAt: str(entry.lastMessageAt),
      })),
    daily: list(payload.daily).map((entry) => ({ day: str(entry.day) || '', messages: num(entry.messages) })),
  }
}

export async function getFansubManageCommunityV2(fansubId: string): Promise<FansubCommunityV2Summary> {
  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase.rpc('get_fansub_manage_community_v2', { p_fansub_id: fansubId }),
      signal,
    ),
    { label: 'fansubManageService.getFansubManageCommunityV2' },
  )

  if (error) {
    logger.error({
      event: 'getFansubManageCommunityV2',
      message: toUserFacingErrorMessage(error, 'Topluluk ozeti yuklenemedi.'),
      context: { fansubId },
      error,
    })
    throw error
  }

  return mapFansubCommunityV2Summary(data)
}
