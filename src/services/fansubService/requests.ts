import { uploadFansubAvatar } from '../storageService'
import { withAbortSignal, withServiceTimeout } from '../apiResilience'
import { createScopedLogger } from '../logger'
import { createRequestContext, toRequestContextLogContext, type RequestContext } from '../requestContext'
import { supabase } from '../supabase'
import { toUserFacingErrorMessage } from '../userFacingError'
import {
  createFansubRequestSchema,
  type CreateFansubRequestInput,
  type DbFansubRequest,
  type FansubRequest,
  FANSUB_DESCRIPTION_MAX_LENGTH,
  FANSUB_NAME_MAX_LENGTH,
  FANSUB_NAME_MIN_LENGTH,
  mapDbFansubRequest,
  slugifyFansubName,
} from './shared'
import { getE2EMockAuthUser, isE2EModeEnabled } from '@/testing/e2eMocks'

const fansubRequestsLogger = createScopedLogger('fansubService.requests')

function logFansubRequestError(
  requestContext: RequestContext,
  message: string,
  error: unknown,
  extraContext?: Record<string, unknown>,
) {
  fansubRequestsLogger.error({
    event: requestContext.event,
    message,
    context: toRequestContextLogContext(requestContext, extraContext),
    error,
  })
}

const FANSUB_REQUEST_SELECT = `
  id,
  requester_user_id,
  requested_name,
  requested_slug,
  requested_avatar_url,
  requested_description,
  requested_primary_color,
  requested_secondary_color,
  status,
  review_note,
  reviewed_by,
  reviewed_at,
  created_fansub_id,
  request_meta,
  created_at,
  updated_at
`

const PENDING_FANSUB_REQUEST_SELECT = `
  ${FANSUB_REQUEST_SELECT},
  requester:requester_user_id (
    id,
    username,
    avatar_url
  )
`

function createE2EMockFansubRequest(input: CreateFansubRequestInput): FansubRequest {
  const requestedName = input.name.trim()
  const requestedDescription = input.description?.trim() || undefined

  if (requestedName.length < FANSUB_NAME_MIN_LENGTH) {
    throw new Error(`Fansub adi en az ${FANSUB_NAME_MIN_LENGTH} karakter olmali.`)
  }
  if (requestedName.length > FANSUB_NAME_MAX_LENGTH) {
    throw new Error(`Fansub adi en fazla ${FANSUB_NAME_MAX_LENGTH} karakter olabilir.`)
  }
  if ((requestedDescription?.length || 0) > FANSUB_DESCRIPTION_MAX_LENGTH) {
    throw new Error(`Aciklama en fazla ${FANSUB_DESCRIPTION_MAX_LENGTH} karakter olabilir.`)
  }

  const now = new Date().toISOString()
  const requestedSlug = slugifyFansubName(requestedName)

  return {
    id: `e2e-fansub-request-${requestedSlug}`,
    requesterUserId: input.requesterUserId,
    requestedName,
    requestedSlug,
    requestedDescription,
    requestedPrimaryColor: input.primaryColor || '#C62828',
    requestedSecondaryColor: input.secondaryColor || '#8E1F1F',
    status: 'pending',
    requestMeta: input.requestMeta,
    createdAt: now,
    updatedAt: now,
    requester: {
      id: input.requesterUserId,
      username: 'e2e_admin',
    },
  }
}

export async function submitFansubRequest(input: CreateFansubRequestInput) {
  if (isE2EModeEnabled() && getE2EMockAuthUser()?.id === input.requesterUserId) {
    return createE2EMockFansubRequest(input)
  }

  const parsed = createFansubRequestSchema.parse({
    requesterUserId: input.requesterUserId,
    name: input.name,
    description: input.description?.trim() || undefined,
    primaryColor: input.primaryColor || '#C62828',
    secondaryColor: input.secondaryColor || '#8E1F1F',
    requestMeta: input.requestMeta ?? undefined,
  })

  const requestedSlug = slugifyFansubName(parsed.name)
  const requestContext = createRequestContext('fansubService.requests', 'submit-fansub-request', {
    requesterUserId: parsed.requesterUserId,
    requestedSlug,
  })
  const cooldownWindowMinutes = 1
  const cooldownCutoff = new Date(
    Date.now() - cooldownWindowMinutes * 60 * 1000,
  ).toISOString()

  const { data: latestRequestInCooldown, error: latestRequestInCooldownError } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase
        .from('fansub_requests')
        .select('id, created_at')
        .eq('requester_user_id', parsed.requesterUserId)
        .eq('is_active', true)
        .gte('created_at', cooldownCutoff)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle<{ id: string; created_at: string }>(),
      signal,
    ),
    { label: 'fansubService.submitFansubRequest.cooldownCheck' },
  )

  if (latestRequestInCooldownError) {
    logFansubRequestError(
      requestContext,
      toUserFacingErrorMessage(latestRequestInCooldownError, 'Fansub talep cooldown kontrolu basarisiz oldu.'),
      latestRequestInCooldownError,
      { stage: 'cooldown-check' },
    )
    throw latestRequestInCooldownError
  }

  if (latestRequestInCooldown) {
    throw new Error('Fansub kurma taleplerinde test suresince 1 dakika bekleme siniri vardir. Lutfen 1 dakika sonra tekrar deneyin.')
  }

  const { data: pendingByUser, error: pendingByUserError } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase
        .from('fansub_requests')
        .select('id')
        .eq('requester_user_id', parsed.requesterUserId)
        .eq('status', 'pending')
        .eq('is_active', true)
        .limit(1)
        .maybeSingle(),
      signal,
    ),
    { label: 'fansubService.submitFansubRequest.pendingByUser' },
  )

  if (pendingByUserError) {
    logFansubRequestError(
      requestContext,
      toUserFacingErrorMessage(pendingByUserError, 'Bekleyen fansub talebi kontrolu basarisiz oldu.'),
      pendingByUserError,
      { stage: 'pending-request-by-user' },
    )
    throw pendingByUserError
  }

  if (pendingByUser) {
    throw new Error('Zaten bekleyen bir fansub talebiniz var.')
  }

  const { data: existingMembership, error: existingMembershipError } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase
        .from('fansub_members')
        .select('fansub_id')
        .eq('user_id', parsed.requesterUserId)
        .limit(1)
        .maybeSingle(),
      signal,
    ),
    { label: 'fansubService.submitFansubRequest.existingMembership' },
  )

  if (existingMembershipError) {
    logFansubRequestError(
      requestContext,
      toUserFacingErrorMessage(existingMembershipError, 'Fansub uyelik kontrolu basarisiz oldu.'),
      existingMembershipError,
      { stage: 'existing-membership' },
    )
    throw existingMembershipError
  }

  if (existingMembership) {
    throw new Error('Bir fansub uyesi oldugunuz icin yeni fansub talebi gonderemezsiniz.')
  }

  const { data: existingFansub, error: existingFansubError } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase
        .from('fansubs')
        .select('id')
        .eq('slug', requestedSlug)
        .limit(1)
        .maybeSingle(),
      signal,
    ),
    { label: 'fansubService.submitFansubRequest.existingFansub' },
  )

  if (existingFansubError) {
    logFansubRequestError(
      requestContext,
      toUserFacingErrorMessage(existingFansubError, 'Mevcut fansub slug kontrolu basarisiz oldu.'),
      existingFansubError,
      { stage: 'existing-fansub' },
    )
    throw existingFansubError
  }

  if (existingFansub) {
    throw new Error('Bu fansub adina ait bir slug zaten kullanimda.')
  }

  const { data: existingPendingSlug, error: existingPendingSlugError } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase
        .from('fansub_requests')
        .select('id')
        .eq('requested_slug', requestedSlug)
        .eq('status', 'pending')
        .eq('is_active', true)
        .limit(1)
        .maybeSingle(),
      signal,
    ),
    { label: 'fansubService.submitFansubRequest.pendingSlug' },
  )

  if (existingPendingSlugError) {
    logFansubRequestError(
      requestContext,
      toUserFacingErrorMessage(existingPendingSlugError, 'Bekleyen slug kontrolu basarisiz oldu.'),
      existingPendingSlugError,
      { stage: 'pending-slug' },
    )
    throw existingPendingSlugError
  }

  if (existingPendingSlug) {
    throw new Error('Bu ada ait bekleyen bir fansub talebi zaten var.')
  }

  let avatarUrl: string | null = null
  if (input.avatarFile) {
    avatarUrl = await uploadFansubAvatar(input.avatarFile)
  }

  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase
        .from('fansub_requests')
        .insert({
          requester_user_id: parsed.requesterUserId,
          requested_name: parsed.name,
          requested_slug: requestedSlug,
          requested_avatar_url: avatarUrl,
          requested_description: parsed.description || null,
          requested_primary_color: parsed.primaryColor || '#C62828',
          requested_secondary_color: parsed.secondaryColor || '#8E1F1F',
          request_meta: parsed.requestMeta ?? {},
          status: 'pending',
          is_active: true,
        })
        .select(FANSUB_REQUEST_SELECT)
        .single<DbFansubRequest>(),
      signal,
    ),
    { label: 'fansubService.submitFansubRequest.insert' },
  )

  if (error) {
    logFansubRequestError(
      requestContext,
      toUserFacingErrorMessage(error, 'Fansub talebi kaydedilemedi.'),
      error,
      {
        stage: 'insert-request',
        hasAvatar: Boolean(avatarUrl),
      },
    )
    throw error
  }

  return mapDbFansubRequest(data)
}

export async function listMyFansubRequests(requesterUserId: string) {
  const requestContext = createRequestContext('fansubService.requests', 'list-my-fansub-requests', {
    requesterUserId,
  })
  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase
        .from('fansub_requests')
        .select(FANSUB_REQUEST_SELECT)
        .eq('requester_user_id', requesterUserId)
        .eq('is_active', true)
        .order('created_at', { ascending: false }),
      signal,
    ),
    { label: 'fansubService.listMyFansubRequests' },
  )

  if (error) {
    logFansubRequestError(
      requestContext,
      toUserFacingErrorMessage(error, 'Kullanici fansub talepleri yuklenemedi.'),
      error,
    )
    throw error
  }

  return (data as DbFansubRequest[]).map(mapDbFansubRequest)
}

export async function listPendingFansubRequests() {
  const requestContext = createRequestContext('fansubService.requests', 'list-pending-fansub-requests')
  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase
        .from('fansub_requests')
        .select(PENDING_FANSUB_REQUEST_SELECT)
        .eq('status', 'pending')
        .eq('is_active', true)
        .order('created_at', { ascending: true }),
      signal,
    ),
    { label: 'fansubService.listPendingFansubRequests' },
  )

  if (error) {
    logFansubRequestError(
      requestContext,
      toUserFacingErrorMessage(error, 'Bekleyen fansub talepleri yuklenemedi.'),
      error,
    )
    throw error
  }

  return (data as DbFansubRequest[]).map(mapDbFansubRequest)
}

export async function approveFansubRequest(requestId: string, reviewNote?: string) {
  const requestContext = createRequestContext('fansubService.requests', 'approve-fansub-request', {
    requestId,
  })
  const normalizedReviewNote = reviewNote?.trim() || null
  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase.rpc('approve_fansub_request', {
        p_request_id: requestId,
        p_review_note: normalizedReviewNote,
      }),
      signal,
    ),
    { label: 'fansubService.approveFansubRequest' },
  )

  if (error) {
    logFansubRequestError(
      requestContext,
      toUserFacingErrorMessage(error, 'Fansub talebi onaylanamadi.'),
      error,
      { hasReviewNote: Boolean(normalizedReviewNote) },
    )
    throw error
  }

  return data as { success: boolean; request_id: string; status: 'approved'; fansub_id: string }
}

export async function rejectFansubRequest(requestId: string, reviewNote?: string) {
  const requestContext = createRequestContext('fansubService.requests', 'reject-fansub-request', {
    requestId,
  })
  const normalizedReviewNote = reviewNote?.trim() || null
  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase.rpc('reject_fansub_request', {
        p_request_id: requestId,
        p_review_note: normalizedReviewNote,
      }),
      signal,
    ),
    { label: 'fansubService.rejectFansubRequest' },
  )

  if (error) {
    logFansubRequestError(
      requestContext,
      toUserFacingErrorMessage(error, 'Fansub talebi reddedilemedi.'),
      error,
      { hasReviewNote: Boolean(normalizedReviewNote) },
    )
    throw error
  }

  return data as { success: boolean; request_id: string; status: 'rejected' }
}
