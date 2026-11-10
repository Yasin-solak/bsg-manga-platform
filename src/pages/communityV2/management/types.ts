import type { CommunityServer } from '@/services/communityV2Service'

export type ManagerProps = {
  serverId: string
  server: CommunityServer
  refresh: () => Promise<void>
}
