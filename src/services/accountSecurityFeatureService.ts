export const ACCOUNT_SECURITY_FEATURES = {
  mfa: false,
} as const

export function isMfaFeatureEnabled() {
  return ACCOUNT_SECURITY_FEATURES.mfa
}
