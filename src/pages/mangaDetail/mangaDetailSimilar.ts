import { txa } from '@/i18n/activeLocale'
/**
 * 'Similar series' reason text (prototype: Series detail > below Chapters).
 *
 * DELIBERATELY DIFFERENT FROM ONBOARDING'S REASON. There the match uses genres the USER
 * chose, so "because you like Action" is a true sentence.
 * Here the match uses the VIEWED SERIES' genres; the same sentence
 * would be a lie implying we know the user's taste.
 *
 * With no match personalization is not faked: same rule as /sans and onboarding.
 */

export function similarReasonLabel(
  matchedGenres: string[],
  formatGenreLabel: (genre: string) => string,
): string {
  const labels = matchedGenres.map(formatGenreLabel).filter(Boolean)
  if (labels.length === 0) return txa('Şu an çok okunuyor')
  return txa('Aynı tür: {genres}', { genres: labels.slice(0, 2).map((label) => txa(label)).join(', ') })
}
