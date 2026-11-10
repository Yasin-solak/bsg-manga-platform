import { txa } from '@/i18n/activeLocale'
/**
 * Birth date rules, client side.
 *
 * The same rules also exist ON THE SERVER (`public.set_my_birth_date`): this is for
 * showing the user a meaningful error, not the gate. The RPC is the gate.
 *
 * The 13-year minimum is the platform's own rule; the measurable form of the prototype's "I am
 * over 13" checkbox. A checkbox was not enough for the 18+ gate:
 * the real age is needed.
 */

export const MIN_AGE = 13
export const MAX_AGE = 120
/** 18+ content threshold; same number as `app_private.current_user_is_adult()`. */
export const ADULT_AGE = 18

export interface BirthDateCheck {
  valid: boolean
  /** Message to show the user if invalid. */
  message: string | null
  /** Age in full years; null if invalid. */
  age: number | null
}

/**
 * Exact age: takes into account whether the birthday has passed.
 *
 * The year difference alone is wrong: someone born on December 31 would look
 * a year older on January 1.
 */
export function calculateAge(birthDate: Date, today: Date): number {
  let age = today.getFullYear() - birthDate.getFullYear()
  const monthDiff = today.getMonth() - birthDate.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age -= 1
  }
  return age
}

/** `input` HTML date girdisi ("YYYY-MM-DD"). */
export function checkBirthDate(input: string, now: Date = new Date()): BirthDateCheck {
  const trimmed = (input || '').trim()
  if (!trimmed) {
    return { valid: false, message: txa('Doğum tarihi zorunlu.'), age: null }
  }

  const parsed = new Date(`${trimmed}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) {
    return { valid: false, message: txa('Geçerli bir tarih gir.'), age: null }
  }

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (parsed.getTime() > today.getTime()) {
    return { valid: false, message: txa('Doğum tarihi gelecekte olamaz.'), age: null }
  }

  const age = calculateAge(parsed, today)
  if (age > MAX_AGE) {
    return { valid: false, message: txa('Geçerli bir doğum tarihi gir.'), age }
  }
  if (age < MIN_AGE) {
    return {
      valid: false,
      message: txa('BSG Manga {v1} yaşından küçükler için uygun değil.', { v1: MIN_AGE }),
      age,
    }
  }

  return { valid: true, message: null, age }
}

export function isAdultAge(age: number | null): boolean {
  return age !== null && age >= ADULT_AGE
}
