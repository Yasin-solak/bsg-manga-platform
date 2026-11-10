import { isMfaFeatureEnabled } from '../accountSecurityFeatureService'
import { withServiceTimeout } from '../apiResilience'
import { supabase } from '../supabase'
import type { MfaFactorSummary, MfaStateSummary, PendingMfaChallenge } from './types'

const MFA_STATE_CACHE_TTL_MS = 30_000

let mfaStateSummaryCache: { value: MfaStateSummary; expiresAt: number } | null = null
let mfaStateSummaryInFlight: Promise<MfaStateSummary> | null = null

function mapMfaFactorSummary(factor: {
  id: string
  friendly_name?: string
  factor_type: 'totp' | 'phone' | 'webauthn'
  status: 'verified' | 'unverified'
  created_at: string
  updated_at: string
  last_challenged_at?: string
}): MfaFactorSummary {
  return {
    id: factor.id,
    friendlyName: factor.friendly_name || null,
    factorType: factor.factor_type,
    status: factor.status,
    createdAt: factor.created_at,
    updatedAt: factor.updated_at,
    lastChallengedAt: factor.last_challenged_at || null,
  }
}

export function clearMfaStateSummaryCacheState() {
  mfaStateSummaryCache = null
  mfaStateSummaryInFlight = null
}

export async function readMfaStateSummary(options: { force?: boolean } = {}): Promise<MfaStateSummary> {
  if (!isMfaFeatureEnabled()) {
    return {
      currentLevel: null,
      nextLevel: null,
      factors: [],
    }
  }

  const forceRefresh = options.force === true
  const now = Date.now()

  if (!forceRefresh && mfaStateSummaryCache && mfaStateSummaryCache.expiresAt > now) {
    return mfaStateSummaryCache.value
  }

  if (!forceRefresh && mfaStateSummaryInFlight) {
    return mfaStateSummaryInFlight
  }

  const request = (async () => {
    const [factorResult, assuranceResult] = await withServiceTimeout(
      () => Promise.all([
        supabase.auth.mfa.listFactors(),
        supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
      ]),
      { label: 'MFA durumunu yukleme' },
    )

    if (factorResult.error) {
      throw factorResult.error
    }

    if (assuranceResult.error) {
      throw assuranceResult.error
    }

    const nextState: MfaStateSummary = {
      currentLevel: assuranceResult.data.currentLevel ?? null,
      nextLevel: assuranceResult.data.nextLevel ?? null,
      factors: (factorResult.data.all || []).map(mapMfaFactorSummary),
    }

    mfaStateSummaryCache = {
      value: nextState,
      expiresAt: Date.now() + MFA_STATE_CACHE_TTL_MS,
    }

    return nextState
  })()

  mfaStateSummaryInFlight = request

  try {
    return await request
  } finally {
    if (mfaStateSummaryInFlight === request) {
      mfaStateSummaryInFlight = null
    }
  }
}

export function resolvePendingMfaChallenge(
  mfaState: MfaStateSummary,
  email: string | null | undefined,
): PendingMfaChallenge | null {
  if (!isMfaFeatureEnabled()) {
    return null
  }

  if (mfaState.currentLevel === 'aal2' || mfaState.nextLevel !== 'aal2') {
    return null
  }

  const verifiedTotpFactor = mfaState.factors.find(
    (factor) => factor.factorType === 'totp' && factor.status === 'verified',
  )

  if (!verifiedTotpFactor) {
    return null
  }

  return {
    factorId: verifiedTotpFactor.id,
    friendlyName: verifiedTotpFactor.friendlyName || 'Authenticator',
    factorType: 'totp',
    email: email || null,
  }
}
