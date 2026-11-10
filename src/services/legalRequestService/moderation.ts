import { withAbortSignal, withServiceTimeout } from '../apiResilience'
import { createScopedLogger } from '../logger'
import { createRequestContext, toRequestContextLogContext } from '../requestContext'
import { supabase } from '../supabase'
import { reportUserFacingError } from '../userFacingError'
import { getCurrentUserIdentity } from '../userService/selfIdentity'
import { mapLegalRequestRow } from './shared'
import type { UpdateLegalRequestInput } from './types'

const legalRequestModerationLogger = createScopedLogger('legalRequestService/moderation')

async function resolveReviewerUserId() {
  const identity = await getCurrentUserIdentity()
  return identity?.id ?? null
}

export async function listLegalRequests() {
  const requestContext = createRequestContext('legalRequestService/moderation', 'list-legal-requests')

  try {
    const { data, error } = await withServiceTimeout(
      (signal) => withAbortSignal(
        supabase
          .from('legal_requests')
          .select(`
            *,
            submitter:users!submitter_user_id(username, avatar_url),
            reviewer:users!reviewed_by(username, avatar_url)
          `)
          .order('created_at', { ascending: false }),
        signal,
      ),
      { label: 'legalRequestService.listLegalRequests' },
    )

    if (error) throw error
    type LegalRequestRow = Parameters<typeof mapLegalRequestRow>[0]
    return ((data || []) as LegalRequestRow[]).map((row) => mapLegalRequestRow(row))
  } catch (error) {
    const payload = reportUserFacingError(legalRequestModerationLogger, {
      event: requestContext.event,
      error,
      fallback: 'Yasal talepler yuklenemedi.',
      loggerMessage: 'yasal talep listesi yuklenemedi.',
      requestContext,
    })
    throw new Error(payload.userMessage)
  }
}

export async function updateLegalRequest(input: UpdateLegalRequestInput) {
  const requestContext = createRequestContext('legalRequestService/moderation', 'update-legal-request', {
    requestId: input.id,
    status: input.status,
  })

  try {
    const reviewerUserId = await resolveReviewerUserId()
    const { error } = await withServiceTimeout(
      (signal) => withAbortSignal(
        supabase
          .from('legal_requests')
          .update({
            status: input.status,
            admin_notes: input.adminNotes?.trim() || null,
            resolution_summary: input.resolutionSummary?.trim() || null,
            reviewed_by: reviewerUserId,
            reviewed_at: new Date().toISOString(),
          })
          .eq('id', input.id),
        signal,
      ),
      { label: 'legalRequestService.updateLegalRequest' },
    )

    if (error) throw error
    return true
  } catch (error) {
    const payload = reportUserFacingError(legalRequestModerationLogger, {
      event: requestContext.event,
      error,
      fallback: 'Yasal talep guncellenemedi.',
      loggerMessage: 'yasal talep durumu guncellenemedi.',
      context: toRequestContextLogContext(requestContext),
      requestContext,
    })
    throw new Error(payload.userMessage)
  }
}
