/**
 * Remembered account for the "Welcome back" card (prototype screen 2).
 *
 * SECURITY DECISIONS, the reason this file exists:
 *
 * 1. **NO TOKEN IS STORED.** What is kept here is only a VISUAL reminder of
 * who is returning: username, display name, avatar and email.
 * Stealing this data GIVES NO ACCESS to the account; signing in still needs
 * the password (and 2FA if set). Session tokens stay in Supabase's own
 * storage and never touch this.
 *
 * 2. **WRITTEN ONLY WHEN "REMEMBER ME" IS ON.** If the user did not want to be remembered
 * on this device, we do not remember who they are either. On a shared device,
 * the next person seeing someone else's email on screen
 * would be an unwanted leak.
 *
 * 3. **THE EMAIL IS SHOWN MASKED.** The prototype showed it in full; the middle part is
 * hidden so someone looking at the screen cannot learn the full address. The full
 * value is used for prefill but is NOT VISIBLE on screen.
 *
 * 4. **NOT DELETED ON SIGN-OUT.** The card's purpose is precisely to shorten the return
 * after sign-out; deleting it then would make it useless. The only way
 * to clear it is "Sign in with another account".
 */

const STORAGE_KEY = 'bsgmanga:last-account'

export interface LastAccount {
  username: string
  displayName: string
  avatar: string
  email: string
}

export function rememberLastAccount(account: LastAccount): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(account))
  } catch {
    // Depolama kapaliysa kart hic gosterilmez; islevsel kayip yok.
  }
}

export function readLastAccount(): LastAccount | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<LastAccount>
    // A broken or missing record shows no card rather than half a card.
    if (!parsed?.username || !parsed?.email) return null
    return {
      username: String(parsed.username),
      displayName: String(parsed.displayName || parsed.username),
      avatar: String(parsed.avatar || ''),
      email: String(parsed.email),
    }
  } catch {
    return null
  }
}

export function forgetLastAccount(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Silinemezse de token degil; erisim riski dogurmaz.
  }
}

/**
 * `demo@example.com` -> `de•••@example.com`
 *
 * Adresi tanimaya yeter, omuz ustunden okuyana tam adresi vermez.
 */
export function maskEmail(email: string): string {
  const [local, domain] = String(email || '').split('@')
  if (!local || !domain) return ''
  if (local.length <= 2) return `${local[0] ?? ''}•••@${domain}`
  return `${local.slice(0, 2)}•••@${domain}`
}
