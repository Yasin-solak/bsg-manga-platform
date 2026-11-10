/**
 * Leaked password check (HaveIBeenPwned, k-anonymity).
 *
 * **Why we do it ourselves.** Supabase's built-in "leaked password protection"
 * needs the Pro plan and the project has no plan. This is the official way to get the same
 * protection for free without an account: the HIBP Pwned Passwords range API.
 *
 * **PRIVACY, the whole point of this module.** The password NEVER leaves for the network.
 * Not even its FULL hash does. Only the FIRST 5 HEX DIGITS of the SHA-1 hash are
 * sent; the server returns hundreds of hash SUFFIXES with that prefix and
 * matching happens IN THE BROWSER. The server cannot know which password we asked about.
 * Sending the full hash would turn this feature into a password leak channel.
 *
 * **FAILS OPEN.** On a network error, timeout or service outage, signup is
 * NOT blocked. Reason: HIBP is a third-party service; its outage
 * should not stop our signup flow. This is a deliberate balance:
 * the protection is best effort, not a mandatory gate.
 */

import { z } from 'zod'
import { createScopedLogger } from './logger'

/**
 * The response line's shape is VALIDATED.
 *
 * We read text from an unauthenticated third-party service; trusting it without
 * validating the format would let a broken or hostile response produce a "this password is leaked"
 * verdict. The suffix is the rest of SHA-1: 40 digits minus
 * the 5-digit prefix = 35 uppercase hex digits.
 */
const rangeLineSchema = z.object({
  suffix: z.string().regex(/^[0-9A-F]{35}$/),
  count: z.number().int().nonnegative(),
})

const leakedPasswordLogger = createScopedLogger('leakedPassword')

const HIBP_RANGE_ENDPOINT = 'https://api.pwnedpasswords.com/range/'

/** A short timeout so the signup flow does not wait. */
const REQUEST_TIMEOUT_MS = 4000

/** Ozetin one gonderilecek hane sayisi; HIBP protokolu 5 istiyor. */
export const HASH_PREFIX_LENGTH = 5

/** Parolanin SHA-1 ozeti, BUYUK harf hex. */
async function sha1Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-1', bytes)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()
}

export interface LeakedPasswordResult {
  /** Bilinen sizintilarda gorulduyse true. */
  leaked: boolean
  /** How many leaks it appeared in; to explain severity in the UI. */
  count: number
  /** The check could not run (network/timeout): means no verdict. */
  checked: boolean
}

/**
 * Is the password in known leaks?
 *
 * Only the first 5 digits of the hash go to the network; matching happens here.
 */
export async function checkLeakedPassword(password: string): Promise<LeakedPasswordResult> {
  if (!password) return { leaked: false, count: 0, checked: false }

  try {
    const hash = await sha1Hex(password)
    const prefix = hash.slice(0, HASH_PREFIX_LENGTH)
    const suffix = hash.slice(HASH_PREFIX_LENGTH)

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

    let response: Response
    try {
      response = await fetch(`${HIBP_RANGE_ENDPOINT}${prefix}`, {
        method: 'GET',
        // Dolgu: cevap boyutundan parola hakkinda cikarim yapilmasini engeller.
        headers: { 'Add-Padding': 'true' },
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timeout)
    }

    if (!response.ok) return { leaked: false, count: 0, checked: false }

    const body = await response.text()
    for (const line of body.split('\n')) {
      const [rawSuffix, rawCount] = line.trim().split(':')
      if (rawSuffix !== suffix) continue

      const parsed = rangeLineSchema.safeParse({
        suffix: rawSuffix,
        count: Number.parseInt(rawCount ?? '', 10),
      })
      // A malformed line is silently ignored and may not produce a verdict.
      if (!parsed.success) break

      // Dolgu satirlari 0 sayisiyla gelir; onlar gercek eslesme degildir.
      const count = parsed.data.count
      if (count <= 0) break
      return { leaked: true, count, checked: true }
    }

    return { leaked: false, count: 0, checked: true }
  } catch (error) {
    // A third-party service outage should not stop the signup flow.
    leakedPasswordLogger.warn('sizmis parola denetimi yapilamadi', error)
    return { leaked: false, count: 0, checked: false }
  }
}
