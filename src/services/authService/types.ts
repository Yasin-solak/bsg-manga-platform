export interface DbUser {
  id: string
  auth_user_id?: string
  username: string
  display_name?: string | null
  username_slug: string
  avatar_url: string | null
  role: 'user' | 'admin' | 'moderator'
  is_banned: boolean
  ban_reason?: string | null
  ban_until?: string | null
  banned_by?: string | null
  banned_at?: string | null
  is_active: boolean
  stones?: number | null
  owned_items?: any
  premium_expires_at?: string | null
  frame_type?: string | null
  active_badge_id?: string | null
  active_profile_effect_id?: string | null
  onboarding_completed_at?: string | null
  birth_date?: string | null
}

export interface AppUser {
  id: string
  authUserId: string
  username: string
  displayName: string
  usernameSlug: string
  avatar: string
  role: 'user' | 'admin' | 'moderator'
  isBanned: boolean
  banUntil?: string
  isActive: boolean
  stones: number
  ownedItems: any
  premiumExpiresAt: string | null
  frameType: string | null
  activeBadgeId: string | null
  activeProfileEffectId: string | null
  onboardingCompletedAt?: string | null
  /** Input of the age gate. Written once; if null, the user is asked. */
  birthDate?: string | null
}

export type MfaFactorType = 'totp' | 'phone' | 'webauthn'
export type MfaFactorStatus = 'verified' | 'unverified'
export type MfaAssuranceLevel = 'aal1' | 'aal2' | null

export interface MfaFactorSummary {
  id: string
  friendlyName: string | null
  factorType: MfaFactorType
  status: MfaFactorStatus
  createdAt: string
  updatedAt: string
  lastChallengedAt: string | null
}

export interface MfaStateSummary {
  currentLevel: MfaAssuranceLevel
  nextLevel: MfaAssuranceLevel
  factors: MfaFactorSummary[]
}

export interface PendingMfaChallenge {
  factorId: string
  friendlyName: string
  factorType: 'totp'
  email: string | null
}

export type SignInResult =
  | { status: 'authenticated'; user: AppUser }
  | { status: 'mfa_required'; challenge: PendingMfaChallenge }

export type SignUpResult =
  | { status: 'authenticated'; user: AppUser }
  | { status: 'email_confirmation_required'; email: string }
