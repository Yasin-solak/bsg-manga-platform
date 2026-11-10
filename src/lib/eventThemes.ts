/**
 * eventThemes: seasonal event theme palette (theme_key -> visual identity)
 *
 * Single source of truth: the admin theme picker, the sidebar card and the panel read from this
 * table. theme_key is stored in the DB as quest_events.theme_key.
 * Tailwind classes are static strings, so JIT generates them.
 */
import { Leaf, Moon, Snowflake, Sparkles, Sprout, Sun } from 'lucide-react'
import { txa } from '@/i18n/activeLocale'

export interface EventThemeVisual {
  key: string
  label: string
  icon: typeof Sun
  gradient: string
  soft: string
  accent: string
  ring: string
  bar: string
}

export const EVENT_THEMES: Record<string, EventThemeVisual> = {
  yaz: {
    key: 'yaz', get label() { return txa('Yaz') }, icon: Sun,
    gradient: 'from-rose-500 via-orange-500 to-amber-500',
    soft: 'from-orange-500/15 via-rose-500/10 to-amber-500/5',
    accent: 'text-orange-600 dark:text-orange-400',
    ring: 'ring-orange-400/40',
    bar: 'bg-gradient-to-r from-rose-400 via-orange-400 to-amber-400',
  },
  kis: {
    key: 'kis', get label() { return txa('Kis') }, icon: Snowflake,
    gradient: 'from-sky-500 via-cyan-500 to-blue-500',
    soft: 'from-sky-500/15 via-cyan-500/10 to-blue-500/5',
    accent: 'text-sky-600 dark:text-sky-400',
    ring: 'ring-sky-400/40',
    bar: 'bg-gradient-to-r from-sky-400 via-cyan-400 to-blue-400',
  },
  bahar: {
    key: 'bahar', get label() { return txa('Bahar') }, icon: Sprout,
    gradient: 'from-emerald-500 via-green-500 to-lime-500',
    soft: 'from-emerald-500/15 via-green-500/10 to-lime-500/5',
    accent: 'text-emerald-600 dark:text-emerald-400',
    ring: 'ring-emerald-400/40',
    bar: 'bg-gradient-to-r from-emerald-400 via-green-400 to-lime-400',
  },
  sonbahar: {
    key: 'sonbahar', get label() { return txa('Sonbahar') }, icon: Leaf,
    gradient: 'from-amber-600 via-orange-600 to-red-500',
    soft: 'from-amber-600/15 via-orange-600/10 to-red-500/5',
    accent: 'text-amber-700 dark:text-amber-400',
    ring: 'ring-amber-500/40',
    bar: 'bg-gradient-to-r from-amber-500 via-orange-500 to-red-400',
  },
  gece: {
    key: 'gece', get label() { return txa('Gece') }, icon: Moon,
    gradient: 'from-indigo-600 via-purple-600 to-slate-800',
    soft: 'from-indigo-600/15 via-purple-600/10 to-slate-800/5',
    accent: 'text-indigo-500 dark:text-indigo-300',
    ring: 'ring-indigo-400/40',
    bar: 'bg-gradient-to-r from-indigo-500 via-purple-500 to-slate-600',
  },
  ozel: {
    key: 'ozel', get label() { return txa('Ozel') }, icon: Sparkles,
    gradient: 'from-fuchsia-500 via-purple-500 to-indigo-500',
    soft: 'from-fuchsia-500/15 via-purple-500/10 to-indigo-500/5',
    accent: 'text-purple-600 dark:text-purple-400',
    ring: 'ring-purple-400/40',
    bar: 'bg-gradient-to-r from-fuchsia-400 via-purple-400 to-indigo-400',
  },
}

export const EVENT_THEME_KEYS = ['yaz', 'kis', 'bahar', 'sonbahar', 'gece', 'ozel'] as const

export function getEventTheme(themeKey: string | null | undefined): EventThemeVisual {
  return (themeKey && EVENT_THEMES[themeKey]) || EVENT_THEMES.ozel
}
