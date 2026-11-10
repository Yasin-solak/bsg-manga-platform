import { supabase } from '../supabase'
import { MEMBERSHIP_WORKFLOW_REQUIRED_TABLES } from './shared.selects'
import type { SupabaseErrorLike } from './shared.types'

let membershipWorkflowAvailabilityCache: boolean | null = null

export function isMembershipWorkflowMissingError(error: unknown) {
  if (!error || typeof error !== 'object') return false
  const typed = error as SupabaseErrorLike
  const code = typed.code || ''
  const message = typed.message || ''
  const hint = typed.hint || ''
  const combined = `${message} ${hint}`.toLowerCase()

  if (code === '42P01') return true
  if (code === 'PGRST205' && MEMBERSHIP_WORKFLOW_REQUIRED_TABLES.some((table) => combined.includes(table))) {
    return true
  }
  return false
}

export async function isFansubMembershipWorkflowAvailable(forceRefresh = false) {
  if (!forceRefresh && membershipWorkflowAvailabilityCache !== null) {
    return membershipWorkflowAvailabilityCache
  }

  const inviteProbe = await supabase
    .from('fansub_invites')
    .select('id', { head: true, count: 'exact' })
    .limit(1)

  if (inviteProbe.error) {
    if (isMembershipWorkflowMissingError(inviteProbe.error)) {
      membershipWorkflowAvailabilityCache = false
      return false
    }
    throw inviteProbe.error
  }

  const joinProbe = await supabase
    .from('fansub_join_requests')
    .select('id', { head: true, count: 'exact' })
    .limit(1)

  if (joinProbe.error) {
    if (isMembershipWorkflowMissingError(joinProbe.error)) {
      membershipWorkflowAvailabilityCache = false
      return false
    }
    throw joinProbe.error
  }

  membershipWorkflowAvailabilityCache = true
  return true
}

export async function ensureMembershipWorkflowEnabled() {
  const enabled = await isFansubMembershipWorkflowAvailable()
  if (!enabled) {
    throw new Error('Fansub uyelik modulu aktif degil. 20260208235901_fansub_membership_workflow.sql, 20260208235902_fansub_admin_exit_and_member_tags.sql ve 20260208235903_fansub_membership_hardening_and_daily_limit.sql migrationlarini calistirin.')
  }
}
