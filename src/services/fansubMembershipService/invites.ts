import { withAbortSignal, withServiceTimeout } from '../apiResilience'
import { createScopedLogger } from '../logger'
import { createRequestContext, toRequestContextLogContext } from '../requestContext'
import { supabase } from '../supabase'
import { toUserFacingErrorMessage } from '../userFacingError'
import {
  ensureMembershipWorkflowEnabled,
  FANSUB_INVITE_SELECT,
  isFansubMembershipWorkflowAvailable,
  mapDbFansubInvite,
} from './shared'
import type { FansubInviteRole, FansubInviteStatus } from './types'

const fansubInvitesLogger = createScopedLogger('fansubMembershipService/invites')

export async function listMyFansubInvites(
  userId: string,
  status?: FansubInviteStatus,
) {
  const requestContext = createRequestContext('fansubMembershipService/invites', 'listMyFansubInvites', {
    userId,
    status: status ?? null,
  })
  const workflowEnabled = await isFansubMembershipWorkflowAvailable()
  if (!workflowEnabled) return []

  let query = supabase
    .from('fansub_invites')
    .select(FANSUB_INVITE_SELECT)
    .eq('invited_user_id', userId)
    .order('created_at', { ascending: false })

  if (status) query = query.eq('status', status)

  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(query, signal),
    { label: 'fansubMembershipService.listMyFansubInvites' },
  )

  if (error) {
    fansubInvitesLogger.error({
      event: requestContext.event,
      message: toUserFacingErrorMessage(error, 'Fansub davetleri yuklenemedi.'),
      context: toRequestContextLogContext(requestContext),
      error,
    })
    throw error
  }

  return (data ?? []).map(mapDbFansubInvite)
}

export async function listFansubInvitesForManagement(
  fansubId: string,
  status?: FansubInviteStatus,
) {
  const requestContext = createRequestContext('fansubMembershipService/invites', 'listFansubInvitesForManagement', {
    fansubId,
    status: status ?? null,
  })
  const workflowEnabled = await isFansubMembershipWorkflowAvailable()
  if (!workflowEnabled) return []

  let query = supabase
    .from('fansub_invites')
    .select(FANSUB_INVITE_SELECT)
    .eq('fansub_id', fansubId)
    .order('created_at', { ascending: false })

  if (status) query = query.eq('status', status)

  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(query, signal),
    { label: 'fansubMembershipService.listFansubInvitesForManagement' },
  )

  if (error) {
    fansubInvitesLogger.error({
      event: requestContext.event,
      message: toUserFacingErrorMessage(error, 'Fansub davet yonetim listesi yuklenemedi.'),
      context: toRequestContextLogContext(requestContext),
      error,
    })
    throw error
  }

  return (data ?? []).map(mapDbFansubInvite)
}

export async function sendFansubInviteByUsername(
  fansubId: string,
  username: string,
  role: FansubInviteRole,
  note?: string,
) {
  const requestContext = createRequestContext('fansubMembershipService/invites', 'sendFansubInviteByUsername', {
    fansubId,
    username,
    role,
  })
  await ensureMembershipWorkflowEnabled()

  const normalized = username.trim()
  if (!normalized) throw new Error('Davet icin kullanici adi zorunludur.')

  const { data: user, error: userError } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase
        .from('public_user_directory')
        .select('id, username')
        .ilike('username', normalized)
        .limit(1)
        .maybeSingle<{ id: string; username: string }>(),
      signal,
    ),
    { label: 'fansubMembershipService.sendFansubInviteByUsername.userLookup' },
  )

  if (userError) {
    fansubInvitesLogger.error({
      event: requestContext.event,
      message: toUserFacingErrorMessage(userError, 'Davet edilecek kullanici bulunamadi.'),
      context: toRequestContextLogContext(requestContext),
      error: userError,
    })
    throw userError
  }

  if (!user) throw new Error('Davet edilecek kullanici bulunamadi.')

  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase.rpc('send_fansub_invite', {
        p_fansub_id: fansubId,
        p_invited_user_id: user.id,
        p_role: role,
        p_note: note?.trim() || null,
      }),
      signal,
    ),
    { label: 'fansubMembershipService.sendFansubInviteByUsername.rpc' },
  )

  if (error) {
    fansubInvitesLogger.error({
      event: requestContext.event,
      message: toUserFacingErrorMessage(error, 'Fansub daveti gonderilemedi.'),
      context: toRequestContextLogContext(requestContext, { invitedUserId: user.id }),
      error,
    })
    throw error
  }

  return data as {
    success: boolean
    fansub_id: string
    invited_user_id: string
    role: FansubInviteRole
  }
}

export async function respondFansubInvite(inviteId: string, action: 'accept' | 'reject') {
  const requestContext = createRequestContext('fansubMembershipService/invites', 'respondFansubInvite', {
    inviteId,
    action,
  })
  await ensureMembershipWorkflowEnabled()

  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase.rpc('respond_fansub_invite', {
        p_invite_id: inviteId,
        p_action: action,
      }),
      signal,
    ),
    { label: 'fansubMembershipService.respondFansubInvite' },
  )

  if (error) {
    fansubInvitesLogger.error({
      event: requestContext.event,
      message: toUserFacingErrorMessage(error, 'Fansub davetine yanit verilemedi.'),
      context: toRequestContextLogContext(requestContext),
      error,
    })
    throw error
  }

  return data as {
    success: boolean
    invite_id: string
    status: 'accepted' | 'rejected'
    fansub_id: string
  }
}

export async function cancelFansubInvite(inviteId: string) {
  const requestContext = createRequestContext('fansubMembershipService/invites', 'cancelFansubInvite', {
    inviteId,
  })
  await ensureMembershipWorkflowEnabled()

  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase.rpc('cancel_fansub_invite', {
        p_invite_id: inviteId,
      }),
      signal,
    ),
    { label: 'fansubMembershipService.cancelFansubInvite' },
  )

  if (error) {
    fansubInvitesLogger.error({
      event: requestContext.event,
      message: toUserFacingErrorMessage(error, 'Fansub daveti iptal edilemedi.'),
      context: toRequestContextLogContext(requestContext),
      error,
    })
    throw error
  }

  return data as {
    success: boolean
    invite_id: string
    status: 'cancelled'
    fansub_id: string
  }
}
