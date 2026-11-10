import { intlLocale, txa } from '@/i18n/activeLocale'
export type AdminRewardsTab = 'fansub' | 'reading_streak' | 'user_tasks' | 'fansub_tasks' | 'events'

export const REWARDS_TAB_TO_HASH: Record<AdminRewardsTab, string> = {
  fansub: 'fansub',
  reading_streak: 'okuma-serisi',
  user_tasks: 'kullanici-gorevleri',
  fansub_tasks: 'fansub-gorevleri',
  events: 'etkinlikler',
}

export function rewardsTabFromHash(hash: string): AdminRewardsTab {
  const normalized = hash.replace(/^#/, '').trim().toLowerCase()
  if (normalized === 'okuma-serisi') return 'reading_streak'
  if (normalized === 'kullanici-gorevleri') return 'user_tasks'
  if (normalized === 'fansub-gorevleri') return 'fansub_tasks'
  if (normalized === 'etkinlikler') return 'events'
  return 'fansub'
}

export type TaskMetricKey =
  | 'read_manga_count'
  | 'manga_follow_count'
  | 'fansub_follow_count'
  | 'rating_count'
  | 'manga_comment_count'
  | 'total_comment_count'
  // Yeni nitelikli metrikler
  | 'unique_mangas_read'
  | 'qualified_comments'
  | 'qualified_unique_comments'
  | 'upvotes_received'
  | 'lists_with_items'
  | 'qualified_ratings'
  | 'profile_completed'
  | 'first_day_actions'
  | 'chapters_read'
  | 'favorites_count'
  | 'genres_explored'
  | 'consecutive_days'
  | 'chapters_in_single_day'
  | 'qualified_lists'
  | 'night_chapters_read'
  | 'unique_mangas_completed'
  | 'weekly_trending_read'

export type FansubTaskMetricKey =
  | 'chapters_published'
  | 'mangas_with_chapters'
  | 'members_count'
  | 'followers_count'
  | 'chapters_in_week'
  | 'unique_mangas_translated'
  | 'avg_views_per_chapter'
  | 'consecutive_publish_days'
  | 'single_chapter_views'

/** User quest metrics */
export const METRIC_OPTIONS: Array<{ value: TaskMetricKey; label: string }> = [
  { value: 'read_manga_count', get label() { return txa('Okunan Manga Sayisi') } },
  { value: 'manga_follow_count', get label() { return txa('Takip Edilen Manga') } },
  { value: 'fansub_follow_count', get label() { return txa('Takip Edilen Fansub') } },
  { value: 'rating_count', get label() { return txa('Verilen Puan') } },
  { value: 'manga_comment_count', get label() { return txa('Manga Yorum') } },
  { value: 'total_comment_count', get label() { return txa('Toplam Yorum') } },
  // Yeni
  { value: 'unique_mangas_read', get label() { return txa('Farkli Manga Okunan') } },
  { value: 'qualified_comments', get label() { return txa('Nitelikli Yorum (15+ kar)') } },
  { value: 'qualified_unique_comments', get label() { return txa('Farkli Mangaya Nitelikli Yorum') } },
  { value: 'upvotes_received', get label() { return txa('Alinan Yorum Begenisi') } },
  { value: 'lists_with_items', get label() { return txa('Icerikli Liste Sayisi') } },
  { value: 'qualified_ratings', get label() { return txa('Nitelikli Puan (okuma gerektiren)') } },
  { value: 'profile_completed', get label() { return txa('Profil tamamlama') } },
  { value: 'chapters_read', get label() { return txa('Okunan Bolum') } },
  { value: 'favorites_count', get label() { return txa('Favori Manga') } },
  { value: 'genres_explored', get label() { return txa('Kesfedilen Tur Sayisi') } },
  { value: 'consecutive_days', get label() { return txa('Üst üste aktif gün') } },
  { value: 'chapters_in_single_day', get label() { return txa('Tek günde okunan bölüm') } },
  { value: 'qualified_lists', get label() { return txa('Nitelikli Liste (10+ manga)') } },
  { value: 'night_chapters_read', get label() { return txa('Gece Okunan Bolum') } },
  { value: 'unique_mangas_completed', get label() { return txa('Tamamlanan farklı manga') } },
]

/** Fansub quest metrics */
export const FANSUB_METRIC_OPTIONS: Array<{ value: FansubTaskMetricKey; label: string }> = [
  { value: 'chapters_published', get label() { return txa('Yayınlanan bölüm') } },
  { value: 'mangas_with_chapters', get label() { return txa('Bolumlu Manga Sayisi') } },
  { value: 'members_count', get label() { return txa('Uye Sayisi') } },
  { value: 'followers_count', get label() { return txa('Takipci Sayisi') } },
  { value: 'chapters_in_week', get label() { return txa('Haftalik Bolum') } },
  { value: 'unique_mangas_translated', get label() { return txa('Farkli Manga Cevirisi') } },
  { value: 'avg_views_per_chapter', get label() { return txa('Ortalama Goruntulenme') } },
  { value: 'consecutive_publish_days', get label() { return txa('Üst üste yayın günü') } },
  { value: 'single_chapter_views', get label() { return txa('Tek Manga Goruntulenme') } },
]

/** Tier seviyeleri */
export const TIER_OPTIONS = [
  { value: 1, get label() { return txa('Kademe 1 — Kolay') }, color: 'text-green-500' },
  { value: 2, get label() { return txa('Kademe 2 — Orta') }, color: 'text-amber-500' },
  { value: 3, get label() { return txa('Kademe 3 — İmkânsız') }, color: 'text-red-500' },
]

/** Tier renklerini dondur */
export function tierColor(level: number) {
  if (level === 1) return 'bg-green-500/20 text-green-700 dark:text-green-400'
  if (level === 2) return 'bg-amber-500/20 text-amber-700 dark:text-amber-400'
  if (level === 3) return 'bg-red-500/20 text-red-700 dark:text-red-400'
  return 'bg-muted text-muted-foreground'
}

export function tierLabel(level: number) {
  if (level === 1) return txa('Kolay')
  if (level === 2) return txa('Orta')
  if (level === 3) return txa('İmkânsız')
  return txa('Bilinmeyen')
}

export interface TierFormState {
  label: string
  minViews: number
  coinReward: number
  isActive: boolean
}

export function toMonthInput(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

/** YYYY-MM of the last finished month: monthly rewards are paid only for finished months. */
export function lastClosedMonthInput(now = new Date()) {
  return toMonthInput(new Date(now.getFullYear(), now.getMonth() - 1, 1))
}

export function toMonthStart(monthInput: string) {
  if (!/^\d{4}-\d{2}$/.test(monthInput.trim())) return null
  return `${monthInput}-01`
}

export function formatNumber(value: number) {
  return Number(value || 0).toLocaleString(intlLocale())
}

export function formatDateTime(value?: string | null) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString(intlLocale())
}

export function formatMonthLabel(value?: string | null) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString(intlLocale(), { year: 'numeric', month: 'long' })
}

export function rewardStatusBadgeClass(status: string) {
  if (status === 'pending') return 'bg-primary/28 text-primary-foreground'
  if (status === 'processing') return 'bg-blue-500/24 text-blue-800 dark:text-blue-200'
  if (status === 'completed') return 'bg-green-500/28 text-green-800 dark:text-green-200'
  if (status === 'failed') return 'bg-destructive/24 text-destructive'
  return 'bg-muted text-muted-foreground'
}
