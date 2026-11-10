import { withAbortSignal, withServiceTimeout } from '../apiResilience'
import { createScopedLogger } from '../logger'
import { createRequestContext, toRequestContextLogContext } from '../requestContext'
import { supabase } from '../supabase'
import { toUserFacingErrorMessage } from '../userFacingError'
import {
  ensureMembershipWorkflowEnabled,
  FANSUB_MEMBER_MANAGEMENT_SELECT,
  mapDbFansubMemberForManagement,
  sortFansubMembersForManagement,
} from './shared'

const fansubMembershipManagementLogger = createScopedLogger('fansubMembershipService/management')

export async function listFansubMembersForManagement(fansubId: string) {
  const requestContext = createRequestContext('fansubMembershipService/management', 'listFansubMembersForManagement', {
    fansubId,
  })
  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase
        .from('fansub_members')
        .select(FANSUB_MEMBER_MANAGEMENT_SELECT)
        .eq('fansub_id', fansubId)
        .eq('fansub.is_active', true)
        .order('created_at', { ascending: true }),
      signal,
    ),
    { label: 'fansubMembershipService.listFansubMembersForManagement' },
  )

  if (error) {
    fansubMembershipManagementLogger.error({
      event: requestContext.event,
      message: toUserFacingErrorMessage(error, 'Fansub uye yonetim listesi yuklenemedi.'),
      context: toRequestContextLogContext(requestContext),
      error,
    })
    throw error
  }

  return (data ?? [])
    .map(mapDbFansubMemberForManagement)
    .sort(sortFansubMembersForManagement)
}

export async function setFansubMemberTeamTag(
  fansubId: string,
  memberUserId: string,
  teamTag?: string | null,
) {
  await ensureMembershipWorkflowEnabled()

  const normalized = teamTag?.trim() || null
  const requestContext = createRequestContext('fansubMembershipService/management', 'setFansubMemberTeamTag', {
    fansubId,
    memberUserId,
    hasTeamTag: Boolean(normalized),
  })
  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase.rpc('set_fansub_member_team_tag', {
        p_fansub_id: fansubId,
        p_member_user_id: memberUserId,
        p_team_tag: normalized,
      }),
      signal,
    ),
    { label: 'fansubMembershipService.setFansubMemberTeamTag' },
  )

  if (error) {
    fansubMembershipManagementLogger.error({
      event: requestContext.event,
      message: toUserFacingErrorMessage(error, 'Fansub uye takim etiketi guncellenemedi.'),
      context: toRequestContextLogContext(requestContext, { teamTag: normalized }),
      error,
    })
    throw error
  }

  return data as {
    success: boolean
    fansub_id: string
    member_user_id: string
    team_tag: string | null
  }
}

export async function adminExitFansub(
  fansubId: string,
  mode: 'transfer' | 'deactivate',
  options?: {
    transferToUserId?: string
    confirmationName?: string
  },
) {
  await ensureMembershipWorkflowEnabled()

  const requestContext = createRequestContext('fansubMembershipService/management', 'adminExitFansub', {
    fansubId,
    mode,
    hasTransferTarget: Boolean(options?.transferToUserId),
  })
  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase.rpc('admin_exit_fansub', {
        p_fansub_id: fansubId,
        p_mode: mode,
        p_transfer_to_user_id: options?.transferToUserId ?? null,
        p_confirmation_name: options?.confirmationName?.trim() || null,
      }),
      signal,
    ),
    { label: 'fansubMembershipService.adminExitFansub' },
  )

  if (error) {
    fansubMembershipManagementLogger.error({
      event: requestContext.event,
      message: toUserFacingErrorMessage(error, 'Fansub yonetici cikis islemi tamamlanamadi.'),
      context: toRequestContextLogContext(requestContext),
      error,
    })
    throw error
  }

  return data as {
    success: boolean
    action: 'transfer_and_leave' | 'deactivate_and_leave'
    fansub_id: string
    previous_admin_user_id: string
    new_admin_user_id?: string
    fansub_is_active?: boolean
  }
}
