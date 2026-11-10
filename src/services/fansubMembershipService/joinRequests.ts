import { withAbortSignal, withServiceTimeout } from '../apiResilience'
import { createScopedLogger } from '../logger'
import { createRequestContext, toRequestContextLogContext } from '../requestContext'
import { supabase } from '../supabase'
import { toUserFacingErrorMessage } from '../userFacingError'
import {
  ensureMembershipWorkflowEnabled,
  FANSUB_JOIN_REQUEST_SELECT,
  isFansubMembershipWorkflowAvailable,
  mapDbFansubJoinRequest,
} from './shared'
import type { FansubJoinRequestStatus } from './types'

const fansubJoinRequestsLogger = createScopedLogger('fansubMembershipService/joinRequests')

export async function submitFansubJoinRequest(fansubId: string, message?: string) {
  const requestContext = createRequestContext('fansubMembershipService/joinRequests', 'submitFansubJoinRequest', {
    fansubId,
  })
  await ensureMembershipWorkflowEnabled()

  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase.rpc('submit_fansub_join_request', {
        p_fansub_id: fansubId,
        p_message: message?.trim() || null,
      }),
      signal,
    ),
    { label: 'fansubMembershipService.submitFansubJoinRequest' },
  )

  if (error) {
    fansubJoinRequestsLogger.error({
      event: requestContext.event,
      message: toUserFacingErrorMessage(error, 'Fansub katilim istegi gonderilemedi.'),
      context: toRequestContextLogContext(requestContext),
      error,
    })
    throw error
  }

  return data as {
    success: boolean
    fansub_id: string
    requester_user_id: string
    status: 'pending'
  }
}

export async function listMyFansubJoinRequests(
  userId: string,
  status?: FansubJoinRequestStatus,
) {
  const requestContext = createRequestContext('fansubMembershipService/joinRequests', 'listMyFansubJoinRequests', {
    userId,
    status: status ?? null,
  })
  const workflowEnabled = await isFansubMembershipWorkflowAvailable()
  if (!workflowEnabled) return []

  let query = supabase
    .from('fansub_join_requests')
    .select(FANSUB_JOIN_REQUEST_SELECT)
    .eq('requester_user_id', userId)
    .order('created_at', { ascending: false })

  if (status) query = query.eq('status', status)

  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(query, signal),
    { label: 'fansubMembershipService.listMyFansubJoinRequests' },
  )

  if (error) {
    fansubJoinRequestsLogger.error({
      event: requestContext.event,
      message: toUserFacingErrorMessage(error, 'Katilim istekleri yuklenemedi.'),
      context: toRequestContextLogContext(requestContext),
      error,
    })
    throw error
  }

  return (data ?? []).map(mapDbFansubJoinRequest)
}

export async function listFansubJoinRequestsForManagement(
  fansubId: string,
  status?: FansubJoinRequestStatus,
) {
  const requestContext = createRequestContext('fansubMembershipService/joinRequests', 'listFansubJoinRequestsForManagement', {
    fansubId,
    status: status ?? null,
  })
  const workflowEnabled = await isFansubMembershipWorkflowAvailable()
  if (!workflowEnabled) return []

  let query = supabase
    .from('fansub_join_requests')
    .select(FANSUB_JOIN_REQUEST_SELECT)
    .eq('fansub_id', fansubId)
    .order('created_at', { ascending: true })

  if (status) query = query.eq('status', status)

  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(query, signal),
    { label: 'fansubMembershipService.listFansubJoinRequestsForManagement' },
  )

  if (error) {
    fansubJoinRequestsLogger.error({
      event: requestContext.event,
      message: toUserFacingErrorMessage(error, 'Fansub katilim yonetim listesi yuklenemedi.'),
      context: toRequestContextLogContext(requestContext),
      error,
    })
    throw error
  }

  return (data ?? []).map(mapDbFansubJoinRequest)
}

export async function reviewFansubJoinRequest(
  requestId: string,
  action: 'approve' | 'reject',
  reviewNote?: string,
) {
  const requestContext = createRequestContext('fansubMembershipService/joinRequests', 'reviewFansubJoinRequest', {
    requestId,
    action,
  })
  await ensureMembershipWorkflowEnabled()

  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase.rpc('review_fansub_join_request', {
        p_request_id: requestId,
        p_action: action,
        p_review_note: reviewNote?.trim() || null,
      }),
      signal,
    ),
    { label: 'fansubMembershipService.reviewFansubJoinRequest' },
  )

  if (error) {
    fansubJoinRequestsLogger.error({
      event: requestContext.event,
      message: toUserFacingErrorMessage(error, 'Fansub katilim istegi incelenemedi.'),
      context: toRequestContextLogContext(requestContext),
      error,
    })
    throw error
  }

  return data as {
    success: boolean
    request_id: string
    fansub_id: string
    status: 'approved' | 'rejected'
  }
}
