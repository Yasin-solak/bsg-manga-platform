import { withAbortSignal, withServiceTimeout } from './apiResilience'
import { createScopedLogger } from './logger'
import { supabase } from './supabase'
import { toUserFacingErrorMessage } from './userFacingError'

/**
 * Saves the birth date.
 *
 * Not written directly to the `users` table: the `authenticated` role has no UPDATE
 * permission ("permission denied for table users"). Rules and limits are in the RPC;
 * client validation is only for early user feedback.
 *
 * The RPC writes ONCE: allowing changes would make the 18+ gate meaningless
 * (a user hitting the gate would change the date and pass).
 */

const birthDateLogger = createScopedLogger('birthDateService')

export async function setMyBirthDate(birthDate: string): Promise<string> {
  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase.rpc('set_my_birth_date', { p_birth_date: birthDate }),
      signal,
    ),
    { label: 'Dogum tarihini kaydetme' },
  )

  if (error) {
    birthDateLogger.error({
      event: 'set-birth-date',
      message: toUserFacingErrorMessage(error, 'Doğum tarihi kaydedilemedi.'),
      error,
    })
    throw error
  }

  return typeof data === 'string' ? data : birthDate
}
