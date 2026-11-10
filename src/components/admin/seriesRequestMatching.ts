import type { TlSeries } from '@/services/translationStudioService'

/** Title comparison key: ignores letter case, accent and punctuation differences. */
export function seriesTitleKey(value: string) {
  return value
    .toLocaleLowerCase('tr')
    .replace(/\u0131/g, 'i')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** The request title equals or is contained in a series on the site: duplicate risk. */
export function findSimilarSeries(title: string, candidates: TlSeries[]) {
  const key = seriesTitleKey(title)
  if (key.length < 3) return null
  return candidates.find((series) => {
    const other = seriesTitleKey(series.title)
    return other === key || (other.length >= 4 && (other.includes(key) || key.includes(other)))
  }) ?? null
}
