import type { CommunityMember, CommunityRole } from '@/services/communityV2Service'
import { txa } from '@/i18n/activeLocale'

export function displayRole(member: CommunityMember, roles: CommunityRole[]) {
  return [...roles].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id)).find(r => !r.is_default && member.role_ids.includes(r.id))
}

export function communityError(error: unknown) { return error instanceof Error ? error.message : txa('İşlem tamamlanamadı. Tekrar dene.') }
