export type LegalRequestType = 'dmca' | 'copyright' | 'trademark' | 'impersonation'
export type LegalRequestStatus = 'new' | 'needs_info' | 'under_review' | 'actioned' | 'rejected'
export type LegalRequestPriority = 'normal' | 'high'

export interface LegalRequest {
  id: string
  submitter_user_id: string | null
  request_type: LegalRequestType
  status: LegalRequestStatus
  priority: LegalRequestPriority
  full_name: string
  organization_name: string | null
  email: string
  claimant_role: string | null
  subject: string
  description: string
  target_urls: string[]
  evidence: string[]
  attestation_good_faith: boolean
  attestation_authority: boolean
  attestation_accuracy: boolean
  electronic_signature: string
  admin_notes: string | null
  resolution_summary: string | null
  created_at: string
  updated_at: string
  reviewed_by: string | null
  reviewed_at: string | null
  submitter?: {
    username: string | null
    avatar_url: string | null
  } | null
  reviewer?: {
    username: string | null
    avatar_url: string | null
  } | null
}

export interface CreateLegalRequestInput {
  requestType: LegalRequestType
  fullName: string
  organizationName?: string
  email: string
  claimantRole?: string
  subject: string
  description: string
  targetUrls: string[]
  evidence?: string[]
  electronicSignature: string
  attestationGoodFaith: boolean
  attestationAuthority: boolean
  attestationAccuracy: boolean
}

export type LegalRequestValidationField = keyof CreateLegalRequestInput
export type LegalRequestValidationErrors = Partial<Record<LegalRequestValidationField, string>>

export class LegalRequestValidationError extends Error {
  fieldErrors: LegalRequestValidationErrors

  constructor(fieldErrors: LegalRequestValidationErrors) {
    const messages = Object.values(fieldErrors).filter((value): value is string => typeof value === 'string' && value.length > 0)
    super(messages.length <= 1 ? (messages[0] || 'Formdaki alanlari kontrol edin.') : 'Formu gondermeden once isaretli alanlari duzeltin.')
    this.name = 'LegalRequestValidationError'
    this.fieldErrors = fieldErrors
  }
}

export interface UpdateLegalRequestInput {
  id: string
  status: LegalRequestStatus
  adminNotes?: string
  resolutionSummary?: string
}
