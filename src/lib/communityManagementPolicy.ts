import type { CommunityChannel, CommunityRole, CommunityServer } from '@/services/communityV2Service'
import { txa } from '@/i18n/activeLocale'

export const managementTabs = [
  ['profile', 'Sunucu profili', ['server.profile.manage', 'server.join.manage']],
  ['requests', 'Katılım başvuruları', ['members.approve']],
  ['preview', 'Rol önizleme', ['roles.create','roles.appearance.manage','roles.permissions.manage','roles.order.manage','roles.assign','server.audit.read']],
  ['roles', 'Roller', ['roles.create', 'roles.appearance.manage', 'roles.permissions.manage', 'roles.order.manage', 'roles.delete']],
  ['channels', 'Kanallar', ['channels.create', 'channels.manage', 'channels.permissions.manage', 'channels.archive']],
  ['members', 'Üyeler', ['roles.assign', 'members.timeout', 'members.kick', 'members.ban', 'members.nicknames.manage']],
  ['reports', 'Şikâyetler', ['reports.review']],
  ['invites', 'Davetler', ['invites.create', 'invites.manage']],
  ['audit', 'İşlem geçmişi', ['server.audit.read']],
] as const

export function allowedManagementTabs(server: CommunityServer) {
  if (!server.is_owner && server.timeout_until && Date.parse(server.timeout_until) > Date.now()) return []
  return managementTabs.filter(([, , permissions]) => server.is_owner || permissions.some(p => server.permissions.includes(p)))
}

export function roleControls(server: CommunityServer, role?: CommunityRole) {
  const has = (key: string) => server.is_owner || server.permissions.includes(key)
  const editable = role ? role.manageable : has('roles.create') && server.my_rank < 1000
  return {
    appearance: editable && (!role || has('roles.appearance.manage')),
    permissions: editable && (!role || has('roles.permissions.manage')),
    order: editable && (!role || has('roles.order.manage')),
    remove: !!role && editable && !role.is_default && has('roles.delete'),
    grant: (key: string) => editable && has(key) && (!role || has('roles.permissions.manage')),
  }
}

export function channelGroups(channels: CommunityChannel[]) {
  const groups = new Map<string, CommunityChannel[]>()
  for (const channel of channels.filter(c => !c.archived_at)) {
    const name = channel.category || txa('Sohbet kanalları')
    const group = groups.get(name) || []
    group.push(channel); groups.set(name, group)
  }
  return [...groups.entries()]
}
