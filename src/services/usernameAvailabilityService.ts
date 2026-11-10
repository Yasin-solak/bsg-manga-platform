import { withAbortSignal, withServiceTimeout } from './apiResilience'
import { createScopedLogger } from './logger'
import { supabase } from './supabase'
import { toUserFacingErrorMessage } from './userFacingError'

/**
 * Username availability.
 *
 * The result has THREE VALUES: available / taken / UNKNOWN. Unknown does not
 * count as "available": showing a green tick and failing on submit is worse than
 * showing nothing. The signup button works in the unknown state too;
 * the real validation is the server's uniqueness constraint.
 */

const usernameLogger = createScopedLogger('usernameAvailabilityService')

export type UsernameAvailability = 'available' | 'taken' | 'unknown'

export async function checkUsernameAvailability(
  username: string,
  signal?: AbortSignal,
): Promise<UsernameAvailability> {
  const trimmed = (username || '').trim()
  if (!trimmed) return 'unknown'

  try {
    const { data, error } = await withServiceTimeout(
      (timeoutSignal) => withAbortSignal(
        supabase.rpc('is_username_available', { p_username: trimmed }),
        timeoutSignal,
      ),
      { label: 'Kullanici adi musaitligi', signal },
    )
    if (error) throw error
    if (typeof data !== 'boolean') return 'unknown'
    return data ? 'available' : 'taken'
  } catch (error) {
    usernameLogger.warn({
      event: 'check-username',
      message: toUserFacingErrorMessage(error, 'Kullanici adi kontrol edilemedi.'),
      error,
    })
    return 'unknown'
  }
}

/**
 * Suggests alternatives for a taken handle (the prototype's suggestion chips).
 *
 * NOT a random suffix, but predictable variations: the user should be able to
 * understand which handle they got.
 */
export function suggestUsernames(base: string, count = 3): string[] {
  const clean = (base || '').trim().replace(/_+$/g, '')
  if (!clean) return []
  const yil = new Date().getFullYear() % 100
  const adaylar = [`${clean}_${yil}`, `${clean}_tr`, `${clean}1`, `${clean}_oku`, `${clean}_manga`]
  return adaylar.filter((aday) => aday.length <= 24).slice(0, count)
}
