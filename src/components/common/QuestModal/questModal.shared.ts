import {
  Award,
  BookOpen,
  CheckCircle2,
  Compass,
  Flame,
  Heart,
  ListChecks,
  Moon,
  Star,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { EXPLORE_PATH } from '@/lib/routes'
import { txa } from '@/i18n/activeLocale'

export interface QuestChainTheme {
  icon: LucideIcon
  label: string
  gradient: string
  border: string
  text: string
  bgBadge: string
  progressBg: string
  headerGradient: string
}

export const METRIC_ROUTES: Record<string, { path: string; label: string }> = {
  read_manga_count: { path: EXPLORE_PATH, get label() { return txa('Keşfet\'e Git') } },
  unique_mangas_read: { path: EXPLORE_PATH, get label() { return txa('Keşfet\'e Git') } },
  chapters_read: { path: EXPLORE_PATH, get label() { return txa('Keşfet\'e Git') } },
  chapters_in_single_day: { path: EXPLORE_PATH, get label() { return txa('Keşfet\'e Git') } },
  night_chapters_read: { path: EXPLORE_PATH, get label() { return txa('Keşfet\'e Git') } },
  unique_mangas_completed: { path: EXPLORE_PATH, get label() { return txa('Keşfet\'e Git') } },
  weekly_trending_read: { path: EXPLORE_PATH, get label() { return txa('Keşfet\'e Git') } },
  genres_explored: { path: EXPLORE_PATH, get label() { return txa('Keşfet\'e Git') } },
  manga_follow_count: { path: EXPLORE_PATH, get label() { return txa('Keşfet\'e Git') } },
  favorites_count: { path: EXPLORE_PATH, get label() { return txa('Keşfet\'e Git') } },
  fansub_follow_count: { path: '/fansublar', get label() { return txa('Fansublara Git') } },
  rating_count: { path: EXPLORE_PATH, get label() { return txa('Keşfet\'e Git') } },
  qualified_ratings: { path: EXPLORE_PATH, get label() { return txa('Keşfet\'e Git') } },
  manga_comment_count: { path: EXPLORE_PATH, get label() { return txa('Manga Oku') } },
  total_comment_count: { path: EXPLORE_PATH, get label() { return txa('Manga Oku') } },
  qualified_comments: { path: EXPLORE_PATH, get label() { return txa('Manga Oku') } },
  qualified_unique_comments: { path: EXPLORE_PATH, get label() { return txa('Manga Oku') } },
  upvotes_received: { path: EXPLORE_PATH, get label() { return txa('Manga Oku') } },
  profile_completed: { path: '/profil', get label() { return txa('Profile Git') } },
  consecutive_days: { path: '/', get label() { return txa('Ana Sayfa') } },
  first_day_actions: { path: '/', get label() { return txa('Ana Sayfa') } },
  lists_with_items: { path: '/listeler', get label() { return txa('Listelere Git') } },
  qualified_lists: { path: '/listeler', get label() { return txa('Listelere Git') } },
}

export const CHAIN_THEMES: Record<string, QuestChainTheme> = {
  profil: {
    icon: Award, get label() { return txa('Profil Vitrini') },
    gradient: 'from-slate-500/10 to-slate-600/5',
    border: 'border-slate-500/25',
    text: 'text-slate-600 dark:text-slate-400',
    bgBadge: 'bg-slate-500/10 text-slate-700 dark:text-slate-300',
    progressBg: 'bg-gradient-to-r from-slate-400 to-slate-600',
    headerGradient: 'from-slate-500/20 via-slate-400/10 to-transparent',
  },
  kutuphane: {
    icon: Heart, get label() { return txa('Kütüphane Kuruluyor') },
    gradient: 'from-rose-500/10 to-rose-600/5',
    border: 'border-rose-500/25',
    text: 'text-rose-600 dark:text-rose-400',
    bgBadge: 'bg-rose-500/10 text-rose-700 dark:text-rose-300',
    progressBg: 'bg-gradient-to-r from-rose-400 to-rose-600',
    headerGradient: 'from-rose-500/20 via-rose-400/10 to-transparent',
  },
  fansub: {
    icon: Users, get label() { return txa('Ekip Takibi') },
    gradient: 'from-indigo-500/10 to-indigo-600/5',
    border: 'border-indigo-500/25',
    text: 'text-indigo-600 dark:text-indigo-400',
    bgBadge: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300',
    progressBg: 'bg-gradient-to-r from-indigo-400 to-indigo-600',
    headerGradient: 'from-indigo-500/20 via-indigo-400/10 to-transparent',
  },
  degerlendirme: {
    icon: Star, get label() { return txa('Eleştirmen Rotası') },
    gradient: 'from-amber-500/10 to-amber-600/5',
    border: 'border-amber-500/25',
    text: 'text-amber-600 dark:text-amber-400',
    bgBadge: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
    progressBg: 'bg-gradient-to-r from-amber-400 to-amber-600',
    headerGradient: 'from-amber-500/20 via-amber-400/10 to-transparent',
  },
  liste: {
    icon: ListChecks, get label() { return txa('Liste Kurucusu') },
    gradient: 'from-cyan-500/10 to-cyan-600/5',
    border: 'border-cyan-500/25',
    text: 'text-cyan-600 dark:text-cyan-400',
    bgBadge: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-300',
    progressBg: 'bg-gradient-to-r from-cyan-400 to-cyan-600',
    headerGradient: 'from-cyan-500/20 via-cyan-400/10 to-transparent',
  },
  okuma_yolu: {
    icon: BookOpen, get label() { return txa('Okuma Rotasi') },
    gradient: 'from-blue-500/10 to-blue-600/5',
    border: 'border-blue-500/25',
    text: 'text-blue-600 dark:text-blue-400',
    bgBadge: 'bg-blue-500/10 text-blue-700 dark:text-blue-300',
    progressBg: 'bg-gradient-to-r from-blue-400 to-blue-600',
    headerGradient: 'from-blue-500/20 via-blue-400/10 to-transparent',
  },
  okuma_hacmi: {
    icon: Flame, get label() { return txa('Bölüm Hacmi') },
    gradient: 'from-orange-500/10 to-orange-600/5',
    border: 'border-orange-500/25',
    text: 'text-orange-600 dark:text-orange-400',
    bgBadge: 'bg-orange-500/10 text-orange-700 dark:text-orange-300',
    progressBg: 'bg-gradient-to-r from-orange-400 to-orange-600',
    headerGradient: 'from-orange-500/20 via-orange-400/10 to-transparent',
  },
  kesif: {
    icon: Compass, get label() { return txa('Keşif Rotası') },
    gradient: 'from-emerald-500/10 to-emerald-600/5',
    border: 'border-emerald-500/25',
    text: 'text-emerald-600 dark:text-emerald-400',
    bgBadge: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    progressBg: 'bg-gradient-to-r from-emerald-400 to-emerald-600',
    headerGradient: 'from-emerald-500/20 via-emerald-400/10 to-transparent',
  },
  sadakat: {
    icon: CheckCircle2, get label() { return txa('Sadakat Serisi') },
    gradient: 'from-teal-500/10 to-teal-600/5',
    border: 'border-teal-500/25',
    text: 'text-teal-600 dark:text-teal-400',
    bgBadge: 'bg-teal-500/10 text-teal-700 dark:text-teal-300',
    progressBg: 'bg-gradient-to-r from-teal-400 to-teal-600',
    headerGradient: 'from-teal-500/20 via-teal-400/10 to-transparent',
  },
  topluluk: {
    icon: Users, get label() { return txa('Topluluk Katkısı') },
    gradient: 'from-purple-500/10 to-purple-600/5',
    border: 'border-purple-500/25',
    text: 'text-purple-600 dark:text-purple-400',
    bgBadge: 'bg-purple-500/10 text-purple-700 dark:text-purple-300',
    progressBg: 'bg-gradient-to-r from-purple-400 to-purple-600',
    headerGradient: 'from-purple-500/20 via-purple-400/10 to-transparent',
  },
  okuma: {
    icon: BookOpen, get label() { return txa('Okuma Yolculuğu') },
    gradient: 'from-blue-500/10 to-blue-600/5',
    border: 'border-blue-500/25',
    text: 'text-blue-600 dark:text-blue-400',
    bgBadge: 'bg-blue-500/10 text-blue-700 dark:text-blue-300',
    progressBg: 'bg-gradient-to-r from-blue-400 to-blue-600',
    headerGradient: 'from-blue-500/20 via-blue-400/10 to-transparent',
  },
  sosyal: {
    icon: Heart, get label() { return txa('Sosyal Katkı') },
    gradient: 'from-pink-500/10 to-pink-600/5',
    border: 'border-pink-500/25',
    text: 'text-pink-600 dark:text-pink-400',
    bgBadge: 'bg-pink-500/10 text-pink-700 dark:text-pink-300',
    progressBg: 'bg-gradient-to-r from-pink-400 to-pink-600',
    headerGradient: 'from-pink-500/20 via-pink-400/10 to-transparent',
  },
  kasif: {
    icon: Compass, get label() { return txa('Kaşif') },
    gradient: 'from-emerald-500/10 to-emerald-600/5',
    border: 'border-emerald-500/25',
    text: 'text-emerald-600 dark:text-emerald-400',
    bgBadge: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    progressBg: 'bg-gradient-to-r from-emerald-400 to-emerald-600',
    headerGradient: 'from-emerald-500/20 via-emerald-400/10 to-transparent',
  },
  genel: {
    icon: Award, get label() { return txa('Genel Görevler') },
    gradient: 'from-slate-500/10 to-slate-600/5',
    border: 'border-slate-500/25',
    text: 'text-slate-600 dark:text-slate-400',
    bgBadge: 'bg-slate-500/10 text-slate-700 dark:text-slate-300',
    progressBg: 'bg-gradient-to-r from-slate-400 to-slate-600',
    headerGradient: 'from-slate-500/20 via-slate-400/10 to-transparent',
  },
  koleksiyon: {
    icon: ListChecks, get label() { return txa('Koleksiyon') },
    gradient: 'from-cyan-500/10 to-cyan-600/5',
    border: 'border-cyan-500/25',
    text: 'text-cyan-600 dark:text-cyan-400',
    bgBadge: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-300',
    progressBg: 'bg-gradient-to-r from-cyan-400 to-cyan-600',
    headerGradient: 'from-cyan-500/20 via-cyan-400/10 to-transparent',
  },
  koleksiyoncu: {
    icon: ListChecks, get label() { return txa('Koleksiyoncu') },
    gradient: 'from-cyan-500/10 to-cyan-600/5',
    border: 'border-cyan-500/25',
    text: 'text-cyan-600 dark:text-cyan-400',
    bgBadge: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-300',
    progressBg: 'bg-gradient-to-r from-cyan-400 to-cyan-600',
    headerGradient: 'from-cyan-500/20 via-cyan-400/10 to-transparent',
  },
  ozel: {
    icon: Moon, get label() { return txa('Özel Görevler') },
    gradient: 'from-indigo-500/10 to-indigo-600/5',
    border: 'border-indigo-500/25',
    text: 'text-indigo-600 dark:text-indigo-400',
    bgBadge: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300',
    progressBg: 'bg-gradient-to-r from-indigo-400 to-indigo-600',
    headerGradient: 'from-indigo-500/20 via-indigo-400/10 to-transparent',
  },
  gece_kusu: {
    icon: Moon, get label() { return txa('Gece Kuşu') },
    gradient: 'from-indigo-500/10 to-indigo-600/5',
    border: 'border-indigo-500/25',
    text: 'text-indigo-600 dark:text-indigo-400',
    bgBadge: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300',
    progressBg: 'bg-gradient-to-r from-indigo-400 to-indigo-600',
    headerGradient: 'from-indigo-500/20 via-indigo-400/10 to-transparent',
  },
  maraton: {
    icon: Flame, get label() { return txa('Maratoncu') },
    gradient: 'from-orange-500/10 to-orange-600/5',
    border: 'border-orange-500/25',
    text: 'text-orange-600 dark:text-orange-400',
    bgBadge: 'bg-orange-500/10 text-orange-700 dark:text-orange-300',
    progressBg: 'bg-gradient-to-r from-orange-400 to-orange-600',
    headerGradient: 'from-orange-500/20 via-orange-400/10 to-transparent',
  },
}

const CHAIN_ORDER = [
  'profil',
  'kutuphane',
  'fansub',
  'degerlendirme',
  'liste',
  'okuma_yolu',
  'okuma_hacmi',
  'kesif',
  'sadakat',
  'topluluk',
  'okuma',
  'sosyal',
  'genel',
  'koleksiyon',
  'koleksiyoncu',
  'ozel',
  'gece_kusu',
  'maraton',
] as const

const DEFAULT_THEME: QuestChainTheme = {
  icon: Award, get label() { return txa('Görevler') },
  gradient: 'from-slate-500/10 to-slate-600/5',
  border: 'border-slate-500/25',
  text: 'text-slate-600 dark:text-slate-400',
  bgBadge: 'bg-slate-500/10 text-slate-700 dark:text-slate-300',
  progressBg: 'bg-gradient-to-r from-slate-400 to-slate-600',
  headerGradient: 'from-slate-500/20 via-slate-400/10 to-transparent',
}

export function getChainTheme(groupKey: string): QuestChainTheme {
  return CHAIN_THEMES[groupKey] || { ...DEFAULT_THEME, label: groupKey }
}

export function getChainRank(key: string) {
  const rank = CHAIN_ORDER.indexOf(key as (typeof CHAIN_ORDER)[number])
  return rank === -1 ? 999 : rank
}
