import type { CommunityServer, CommunityServerActivity } from '@/services/communityV2Service'

export function mergeCommunityServerActivity(server: CommunityServer, activity: CommunityServerActivity) {
  if (server.profile.id !== activity.server_id) return { server, reload: true }
  const changes = new Map(activity.channels.map(channel => [channel.id, channel]))
  const knownIds = new Set(server.channels.map(channel => channel.id))
  const reload = server.is_owner !== activity.is_owner
    || [...server.permissions].sort().join('|') !== [...activity.permissions].sort().join('|')
    || server.channels.length !== activity.channels.length || activity.channels.some(c => !knownIds.has(c.id))
  return {
    reload,
    server: { ...server, server_now: activity.server_now, timeout_until: activity.timeout_until,
      permissions: activity.permissions, is_owner: activity.is_owner,
      // A channel whose access was removed closes immediately; a new channel needs full metadata.
      channels: server.channels.filter(channel => changes.has(channel.id)).map(channel => ({ ...channel, ...changes.get(channel.id)! })),
    },
  }
}
