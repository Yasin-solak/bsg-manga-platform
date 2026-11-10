import { intlLocale, txa } from '@/i18n/activeLocale'
/**
 * 'Today's mood' (prototype: Explore screen).
 *
 * The prototype has FIVE moods:
 * Short & finished (under 80 chapters) · Long marathon (100+ chapters) ·
 * Midnight chills (Horror · Mystery) · Light & sweet (School · Romance) ·
 * Epic (Fantasy · Action)
 *
 * THREE ARE HERE. Two moods depend on CHAPTER COUNT and our
 * `mangas.last_chapter_number` field is WRONG IN LIVE DATA: the repo has a measured
 * note (migration 20260801200000): two manga show nonzero with no chapters,
 * one shows zero with chapters.
 * A mood that filters wrongly is worse than no mood; those two are not drawn until a
 * reliable chapter count exists.
 *
 * The remaining three depend on the GENRE filter and genre data is solid: they use the same
 * `listMangas({ genres })` path.
 */

export interface ExploreMood {
  id: string
  label: string
  note: string
  /** Katalog sorgusuna gidecek kanonik tur kimlikleri. */
  genres: string[]
}

export const EXPLORE_MOODS: readonly ExploreMood[] = [
  { id: 'night', get label() { return txa('Gece ürpertisi') }, get note() { return txa('Korku · Gizem') }, genres: ['horror', 'mystery'] },
  { id: 'soft', get label() { return txa('Hafif & tatlı') }, get note() { return txa('Okul · Romantizm') }, genres: ['school', 'romance'] },
  { id: 'epic', get label() { return txa('Destansı') }, get note() { return txa('Fantastik · Aksiyon') }, genres: ['fantasy', 'action'] },
]

export function findMood(moodId: string | null): ExploreMood | null {
  if (!moodId) return null
  return EXPLORE_MOODS.find((mood) => mood.id === moodId) || null
}

/** "12 seri bulundu" / "Bu havada uygun seri kalmadi" ust satiri. */
export function formatMoodCount(count: number): string {
  return count === 0 ? txa('Sonuç yok') : txa('{count} seri', { count: count.toLocaleString(intlLocale()) })
}
