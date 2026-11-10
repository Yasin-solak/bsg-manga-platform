import { withAbortSignal, withServiceTimeout } from '../apiResilience'
import { createScopedLogger } from '../logger'
import { createRequestContext } from '../requestContext'
import { supabase } from '../supabase'
import { reportUserFacingError } from '../userFacingError'
import {
  isLegalRequestValidationError,
  legalRequestPriorityForType,
  resolveCurrentSubmitterUserId,
  sanitizeCreateLegalRequestInput,
} from './shared'
import type { CreateLegalRequestInput } from './types'

const legalRequestActionsLogger = createScopedLogger('legalRequestService/actions')

export async function submitLegalRequest(input: CreateLegalRequestInput) {
  const requestContext = createRequestContext('legalRequestService/actions', 'submit-legal-request', {
    requestType: input.requestType,
  })

  try {
    const parsed = sanitizeCreateLegalRequestInput(input)
    const submitterUserId = await resolveCurrentSubmitterUserId()

    const { error } = await withServiceTimeout(
      (signal) => withAbortSignal(
        supabase.from('legal_requests').insert({
          submitter_user_id: submitterUserId,
          request_type: parsed.requestType,
          status: 'new',
          priority: legalRequestPriorityForType(parsed.requestType),
          full_name: parsed.fullName,
          organization_name: parsed.organizationName || null,
          email: parsed.email,
          claimant_role: parsed.claimantRole || null,
          subject: parsed.subject,
          description: parsed.description,
          target_urls: parsed.targetUrls,
          evidence: parsed.evidence || [],
          attestation_good_faith: parsed.attestationGoodFaith,
          attestation_authority: parsed.attestationAuthority,
          attestation_accuracy: parsed.attestationAccuracy,
          electronic_signature: parsed.electronicSignature,
        }),
        signal,
      ),
      { label: 'legalRequestService.submitLegalRequest' },
    )

    if (error) throw error
    return true
  } catch (error) {
    if (isLegalRequestValidationError(error)) {
      throw error
    }

    const payload = reportUserFacingError(legalRequestActionsLogger, {
      event: requestContext.event,
      error,
      fallback: 'Yasal talep gonderilemedi.',
      loggerMessage: 'yasal talep kaydi olusturulamadi.',
      requestContext,
    })
    throw new Error(payload.userMessage)
  }
}
