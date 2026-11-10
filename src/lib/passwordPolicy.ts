import { txa } from '@/i18n/activeLocale'
/**
 * Password policy.
 *
 * **Why it exists.** The only rule in the signup flow was `password.length < 6`. Supabase's
 * own docs advise against going below 8 characters, and leaked password protection
 * (HaveIBeenPwned) in the project's Auth plan is OFF because it requires the Pro plan.
 * So the platform had no password defense at all.
 *
 * **Composition rules (uppercase + digit + symbol required) are DELIBERATELY ABSENT.**
 * NIST 800-63B explicitly dropped these rules: they push users to predictable patterns
 * like `Parola1!` and their real security value is unmeasured.
 * Two things replace them: enough LENGTH and rejecting LEAKED passwords. The second
 * is in `leakedPasswordService`, using k-anonymity.
 *
 * The module is PURE: knows neither network nor browser, and stays testable.
 */

/** This is Supabase's own recommendation too: do not go below 8. */
export const MIN_PASSWORD_LENGTH = 8

/** An upper limit rather than cutting long passwords: bcrypt ignores everything past 72 bytes. */
export const MAX_PASSWORD_LENGTH = 72

export interface PasswordPolicyInput {
  password: string
  /** Username and email must not appear in the password. */
  username?: string
  email?: string
}

export type PasswordPolicyProblem =
  | 'cok_kisa'
  | 'cok_uzun'
  | 'tek_karakter'
  | 'kimlik_iceriyor'

const PROBLEM_MESSAGES: Record<PasswordPolicyProblem, string> = {
  cok_kisa: txa('Şifre en az {v1} karakter olmalıdır.', { v1: MIN_PASSWORD_LENGTH }),
  cok_uzun: txa('Şifre en fazla {v1} karakter olabilir.', { v1: MAX_PASSWORD_LENGTH }),
  get tek_karakter() { return txa('Şifre tek bir karakterin tekrarı olamaz.') },
  get kimlik_iceriyor() { return txa('Şifre kullanıcı adınızı ya da e-postanızı içermemeli.') },
}

export function passwordProblemMessage(problem: PasswordPolicyProblem): string {
  return PROBLEM_MESSAGES[problem]
}

/**
 * Does a piece of the identity appear in the password?
 *
 * Comparison is lowercased; the Turkish dotted-i trap does not matter here
 * because the password is compared as raw text, but a simple reduction is still used instead of
 * `toLowerCase` to stay language-insensitive.
 */
function containsIdentity(password: string, value: string | undefined): boolean {
  const trimmed = (value ?? '').trim()
  if (trimmed.length < 3) return false
  return password.toLowerCase().includes(trimmed.toLowerCase())
}

/**
 * Applies the policy; returns a list of problems (empty list = valid).
 *
 * It returns a list because stopping at the first error makes the user
 * fix the password twice.
 */
export function checkPasswordPolicy(input: PasswordPolicyInput): PasswordPolicyProblem[] {
  const problems: PasswordPolicyProblem[] = []
  const password = input.password

  if (password.length < MIN_PASSWORD_LENGTH) problems.push('cok_kisa')
  if (password.length > MAX_PASSWORD_LENGTH) problems.push('cok_uzun')

  // "aaaaaaaa" uzunluk sartini gecer ama entropisi sifira yakin.
  if (password.length > 0 && new Set(password).size === 1) problems.push('tek_karakter')

  const emailLocalPart = (input.email ?? '').split('@')[0]
  if (containsIdentity(password, input.username) || containsIdentity(password, emailLocalPart)) {
    problems.push('kimlik_iceriyor')
  }

  return problems
}
