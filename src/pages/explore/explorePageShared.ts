import { useCallback, useEffect, useState } from 'react'
import type { Manga } from '@/types'
import { ArrowUpAZ, Clock, Flame, Star } from 'lucide-react'
import { txa } from '@/i18n/activeLocale'

export type ExploreGenreGroupKey = 'popular' | 'adventure' | 'daily' | 'other'
export type ExploreStatusId = 'all' | 'ongoing' | 'completed' | 'hiatus' | 'new'
export type ExploreSortId = 'popular' | 'latest' | 'rating' | 'title'

export type ExploreGenreItem = {
  id: string
  name: string
  icon: string
  group: ExploreGenreGroupKey
  count?: number
}

export const ITEMS_PER_PAGE = 21

export const GROUP_LABELS: Record<ExploreGenreGroupKey, string> = {
  get popular() { return txa('Popüler') },
  get adventure() { return txa('Macera') },
  get daily() { return txa('Günlük') },
  get other() { return txa('Diğer') },
}

export const STATUS_OPTIONS: Array<{ id: ExploreStatusId; name: string }> = [
  { id: 'all', get name() { return txa('Tümü') } },
  { id: 'ongoing', get name() { return txa('Devam Ediyor') } },
  { id: 'completed', get name() { return txa('Tamamlandı') } },
  { id: 'hiatus', get name() { return txa('Ara Verdi') } },
  { id: 'new', get name() { return txa('Yeni') } },
]

export const SORT_OPTIONS: Array<{ id: ExploreSortId; name: string; icon: typeof Flame }> = [
  { id: 'popular', get name() { return txa('En Popüler') }, icon: Flame },
  { id: 'latest', get name() { return txa('Son Güncellenen') }, icon: Clock },
  { id: 'rating', get name() { return txa('En Yüksek Puan') }, icon: Star },
  { id: 'title', get name() { return txa('İsme Göre (A-Z)') }, icon: ArrowUpAZ },
]

export const GENRE_PRESETS: ExploreGenreItem[] = [
  { id: 'action', get name() { return txa('Aksiyon') }, icon: '⚔️', group: 'popular' },
  { id: 'romance', get name() { return txa('Romantik') }, icon: '💕', group: 'popular' },
  { id: 'fantasy', get name() { return txa('Fantazi') }, icon: '🧙', group: 'popular' },
  { id: 'comedy', get name() { return txa('Komedi') }, icon: '😂', group: 'popular' },
  { id: 'drama', get name() { return txa('Drama') }, icon: '🎭', group: 'popular' },
  { id: 'horror', get name() { return txa('Korku') }, icon: '👻', group: 'popular' },
  { id: 'isekai', name: 'Isekai', icon: '🌀', group: 'popular' },
  { id: 'sports', get name() { return txa('Spor') }, icon: '⚽', group: 'popular' },
  { id: 'adventure', get name() { return txa('Macera') }, icon: '🗺️', group: 'adventure' },
  { id: 'supernatural', get name() { return txa('Doğaüstü') }, icon: '👁️', group: 'adventure' },
  { id: 'magic', get name() { return txa('Büyü') }, icon: '✨', group: 'adventure' },
  { id: 'mystery', get name() { return txa('Gizem') }, icon: '🔍', group: 'adventure' },
  { id: 'slice-of-life', get name() { return txa('Günlük Hayat') }, icon: '☕', group: 'daily' },
  { id: 'school', get name() { return txa('Okul') }, icon: '🎓', group: 'daily' },
  { id: 'music', get name() { return txa('Müzik') }, icon: '🎵', group: 'daily' },
  { id: 'cooking', get name() { return txa('Yemek') }, icon: '🍳', group: 'daily' },
  { id: 'sci-fi', get name() { return txa('Bilim Kurgu') }, icon: '🚀', group: 'other' },
  { id: 'psychological', get name() { return txa('Psikolojik') }, icon: '🧠', group: 'other' },
  { id: 'thriller', get name() { return txa('Gerilim') }, icon: '😰', group: 'other' },
  { id: 'historical', get name() { return txa('Tarihi') }, icon: '📜', group: 'other' },
  { id: 'military', get name() { return txa('Askeri') }, icon: '🎖️', group: 'other' },
  { id: 'martial-arts', get name() { return txa('Dövüş Sanatları') }, icon: '🥋', group: 'other' },
  { id: 'game', get name() { return txa('Oyun') }, icon: '🎮', group: 'other' },
  { id: 'vampire', get name() { return txa('Vampir') }, icon: '🧛', group: 'other' },
  { id: 'zombie', get name() { return txa('Zombi') }, icon: '🧟', group: 'other' },
  { id: 'mecha', name: 'Mecha', icon: '🤖', group: 'other' },
  { id: 'yuri', name: 'Yuri', icon: '🌸', group: 'other' },
  { id: 'yaoi', name: 'Yaoi', icon: '🌺', group: 'other' },
  { id: 'harem', name: 'Harem', icon: '👑', group: 'other' },
  { id: 'reverse-harem', name: 'Reverse Harem', icon: '💎', group: 'other' },
]

export const GENRE_ALIAS_MAP: Record<string, string[]> = {
  action: ['aksiyon'],
  romance: ['romantik', 'romantizm'],
  fantasy: ['fantazi', 'fantezi', 'fantastik'],
  comedy: ['komedi'],
  drama: ['dram'],
  horror: ['korku'],
  isekai: ['isekai'],
  sports: ['spor'],
  adventure: ['macera'],
  supernatural: ['dogaustu', 'doga-ustu'],
  magic: ['buyu'],
  mystery: ['gizem'],
  'slice-of-life': ['gunluk-hayat', 'slice-of-life'],
  school: ['okul'],
  music: ['muzik'],
  cooking: ['yemek'],
  'sci-fi': ['bilim-kurgu', 'scifi'],
  psychological: ['psikolojik'],
  thriller: ['gerilim'],
  historical: ['tarihi'],
  military: ['askeri'],
  'martial-arts': ['dovus-sanatlari'],
  game: ['oyun'],
  vampire: ['vampir'],
  zombie: ['zombi'],
  mecha: ['mecha'],
  yuri: ['yuri'],
  yaoi: ['yaoi'],
  harem: ['harem'],
  'reverse-harem': ['reverse-harem'],
}

const GENRE_CANONICAL_BY_ALIAS = Object.entries(GENRE_ALIAS_MAP).reduce<Record<string, string>>((acc, [canonical, aliases]) => {
  acc[canonical] = canonical
  aliases.forEach((alias) => {
    acc[alias] = canonical
  })
  return acc
}, {})

export function normalizeGenreId(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[ç]/g, 'c')
    .replace(/[ğ]/g, 'g')
    .replace(/[ı]/g, 'i')
    .replace(/[ö]/g, 'o')
    .replace(/[ş]/g, 's')
    .replace(/[ü]/g, 'u')
    .replace(/\s+/g, '-')
}

export function toCanonicalGenreId(rawGenre: string) {
  return GENRE_CANONICAL_BY_ALIAS[rawGenre] || rawGenre
}

export function prettifyGenreName(id: string) {
  return id
    .replace(/-/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(' ')
}

export function normalizeStatus(value: string | null): ExploreStatusId {
  const allowed = new Set(STATUS_OPTIONS.map((item) => item.id))
  return value && allowed.has(value as ExploreStatusId) ? (value as ExploreStatusId) : 'all'
}

export function normalizeSort(value: string | null): ExploreSortId {
  const allowed = new Set(SORT_OPTIONS.map((item) => item.id))
  return value && allowed.has(value as ExploreSortId) ? (value as ExploreSortId) : 'popular'
}

export function mergeMangaPages(previous: Manga[], nextPage: Manga[]) {
  const byId = new Map(previous.map((item) => [item.id, item]))
  nextPage.forEach((item) => {
    byId.set(item.id, item)
  })
  return [...byId.values()]
}

export function useExploreMediaQuery(query: string) {
  const getMatches = useCallback(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia(query).matches
  }, [query])

  const [matches, setMatches] = useState(getMatches)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mediaQuery = window.matchMedia(query)
    const handleChange = () => setMatches(mediaQuery.matches)
    handleChange()
    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [query])

  return matches
}
