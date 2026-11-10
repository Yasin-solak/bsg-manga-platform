import { intlLocale, txa } from '@/i18n/activeLocale'
const GENRE_LABEL_OVERRIDES: Record<string, string> = {
  get KaranlikFantazi() { return txa('Karanlık Fantazi') },
  'Karanlık Fantazi': 'Karanlık Fantazi',
}

export function isMangaNotFoundError(error: unknown) {
  if (!error || typeof error !== 'object') return false
  const typedError = error as { message?: string; code?: string; details?: string }
  const message = (typedError.message || '').toLowerCase()
  const details = (typedError.details || '').toLowerCase()
  return typedError.code === 'PGRST116'
    || message.includes('not found')
    || message.includes('0 rows')
    || details.includes('0 rows')
}

export function formatGenreLabel(genre: string) {
  return GENRE_LABEL_OVERRIDES[genre.trim()] ?? genre.trim()
}

export function statusLabel(status?: string) {
  if (status === 'ongoing') return txa('Devam Ediyor')
  if (status === 'completed') return txa('Tamamlandı')
  if (status === 'hiatus') return txa('Ara Verildi')
  return txa('Bilinmiyor')
}

export function statusColor(status?: string) {
  if (status === 'ongoing') return 'text-emerald-600 dark:text-emerald-400'
  if (status === 'completed') return 'text-blue-600 dark:text-blue-400'
  return 'text-amber-600 dark:text-amber-400'
}

/**
 * Details numbers in localized format (prototype: "4,8" and "184 B").
 *
 * Before, the rating used `toFixed(1)` printing "4.1" (in Turkish the decimal SEPARATOR
 * is a comma) and views were calculated with `(views / 1000).toFixed(0) + 'K'`:
 * 400 views gave **"0K"**, 500 views "1K".
 * Intl's compact display is both correct and local ("400", "1,2 B", "184 B").
 */
const ratingFormatter = new Intl.NumberFormat(intlLocale(), {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

const compactFormatter = new Intl.NumberFormat(intlLocale(), {
  notation: 'compact',
  maximumFractionDigits: 1,
})

export function formatMangaRating(rating: number) {
  return ratingFormatter.format(rating)
}

export function formatCompactCount(value: number) {
  return compactFormatter.format(value)
}
