import { checkPasswordPolicy, MIN_PASSWORD_LENGTH, type PasswordPolicyInput } from './passwordPolicy'

/**
 * Password strength indicator (the three bars on the prototype signup screen).
 *
 * Strength derives from the POLICY itself: inventing a separate score would produce a password that
 * looks "strong" but fails the policy. With a policy violation the
 * level can never be "strong".
 *
 * Length is not the only measure: variety (lower/upper/digit/symbol) counts too,
 * because a 12-character "aaaaaaaaaaaa" is long but weak.
 */

export type PasswordStrengthLevel = 'zayif' | 'orta' | 'guclu'

export interface PasswordStrength {
  level: PasswordStrengthLevel
  /** Doldurulacak cubuk sayisi (0-3). */
  filledBars: number
  label: string
  /** Policy violations; if any, the level cannot be "strong". */
  hasPolicyProblem: boolean
}

const LABELS: Record<PasswordStrengthLevel, string> = {
  zayif: 'Zayıf',
  orta: 'Orta',
  guclu: 'Güçlü',
}

export function measurePasswordStrength(input: PasswordPolicyInput): PasswordStrength {
  const password = input.password || ''
  if (!password) {
    return { level: 'zayif', filledBars: 0, label: '', hasPolicyProblem: false }
  }

  const problems = checkPasswordPolicy(input)
  const hasPolicyProblem = problems.length > 0

  const varieties = [
    /[a-z]/.test(password),
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ].filter(Boolean).length

  let score = 0
  if (password.length >= MIN_PASSWORD_LENGTH) score += 1
  if (password.length >= 12) score += 1
  if (varieties >= 3) score += 1

  // With a policy violation the ceiling is "medium": showing a green indicator and then
  // being rejected on submit is worse than showing none.
  if (hasPolicyProblem) score = Math.min(score, 1)

  const level: PasswordStrengthLevel = score >= 3 ? 'guclu' : score === 2 ? 'orta' : 'zayif'
  return {
    level,
    filledBars: Math.max(1, Math.min(3, score || 1)),
    label: LABELS[level],
    hasPolicyProblem,
  }
}
