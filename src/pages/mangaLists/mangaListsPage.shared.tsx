import { Link } from '@/i18n/router'
import {
  ArrowRight,
  BookOpen,
  CalendarClock,
  Heart,
  MessageCircle,
  Plus,
  Sparkles,
  Star,
  Users,
} from 'lucide-react'
import { AvatarFrame } from '@/components/common/AvatarFrame'
import { UserHoverCard } from '@/components/common/UserHoverCard'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { MangaListSort, MangaListSummary } from '@/services/mangaListService'
export {
  LIST_DESCRIPTION_MAX_LENGTH,
  LIST_TITLE_MAX_LENGTH,
  LIST_TITLE_MIN_LENGTH,
  MANGA_LIST_HERO_COVER_COUNT,
  MANGA_LIST_ITEM_NOTE_MAX_LENGTH,
  MANGA_LIST_MIN_ITEM_COUNT,
} from '@/services/mangaListService'
import { GENRE_PRESETS, prettifyGenreName } from '@/pages/explore/explorePageShared'
import { intlLocale, txa } from '@/i18n/activeLocale'

export const PAGE_SIZE = 10
export const TOP_RAIL_LIMIT = 8

export type MangaListTab = 'all' | 'mine' | 'following' | 'community' | 'favorites'

export const LIST_TABS: Array<{ id: MangaListTab; label: string }> = [
  { id: 'all', get label() { return txa('Tümü') } },
  { id: 'mine', get label() { return txa('Benim Listelerim') } },
  { id: 'following', get label() { return txa('Takip Ettiklerim') } },
  { id: 'community', get label() { return txa('Topluluk Listeleri') } },
  { id: 'favorites', get label() { return txa('Favoriler') } },
]

export const SORT_OPTIONS: Array<{ id: MangaListSort; label: string }> = [
  { id: 'recently_updated', get label() { return txa('Son Güncellenen') } },
  { id: 'newest', get label() { return txa('En Yeni') } },
  { id: 'top_rated', get label() { return txa('En İyi Puan') } },
  { id: 'most_commented', get label() { return txa('En Çok Yorum') } },
]

const LIST_CATEGORY_KEYWORDS: Record<string, string[]> = {
  action: ['aksiyon', 'action', 'savas', 'savaş', 'dovus', 'dövüş', 'shounen', 'kizil', 'kızıl', 'ruzgar', 'rüzgar'],
  romance: ['romantik', 'romance', 'ask', 'aşk', 'mavi gece', 'slice of life'],
  fantasy: ['fantazi', 'fantezi', 'fantasy', 'buyu', 'büyü', 'isekai', 'guc', 'güç', 'efsane'],
  comedy: ['komedi', 'comedy', 'eglence', 'eğlence'],
  drama: ['dram', 'drama', 'karanlik', 'karanlık', 'psikolojik', 'trajedi'],
  horror: ['korku', 'horror', 'gerilim', 'son buyucu', 'son büyücü'],
  isekai: ['isekai', 'portal', 'dunya', 'dünya'],
  sports: ['spor', 'sports', 'turnuva'],
  adventure: ['macera', 'adventure', 'kesif', 'keşif'],
  supernatural: ['dogaustu', 'doğaüstü', 'supernatural'],
  magic: ['buyu', 'büyü', 'magic', 'mage'],
  mystery: ['gizem', 'mystery', 'sır', 'sir'],
  'slice-of-life': ['gunluk', 'günlük', 'slice of life', 'iyilesme', 'iyileşme'],
  school: ['okul', 'school', 'akademi', 'kampus', 'kampüs'],
  'sci-fi': ['bilim kurgu', 'sci-fi', 'scifi', 'robot', 'mecha'],
  psychological: ['psikolojik', 'psychological', 'zihin'],
  thriller: ['gerilim', 'thriller', 'kovalamaca'],
  historical: ['tarihi', 'historical', 'samuray', 'krallik', 'krallık'],
}

export const LIST_CATEGORY_PRESETS = GENRE_PRESETS.slice(0, 18).map((genre) => ({
  id: genre.id,
  label: genre.name || prettifyGenreName(genre.id),
  icon: genre.icon,
  keywords: LIST_CATEGORY_KEYWORDS[genre.id] || [genre.id, genre.name],
}))

export type MangaListCategoryId = string | 'all'

export function formatDate(value?: string) {
  if (!value) return '-'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '-'
  return parsed.toLocaleDateString(intlLocale(), { day: '2-digit', month: 'short' })
}

export function formatRelativeTime(value?: string) {
  if (!value) return ''
  const parsed = new Date(value).getTime()
  if (!Number.isFinite(parsed)) return ''
  const diffMs = Date.now() - parsed
  const diffMinutes = Math.max(1, Math.floor(diffMs / 60_000))
  if (diffMinutes < 60) return txa('{count} dk önce', { count: diffMinutes })
  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return txa('{count} saat önce', { count: diffHours })
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return txa('{count} gün önce', { count: diffDays })
  return formatDate(value)
}

export function formatCompactNumber(value: number) {
  return new Intl.NumberFormat(intlLocale(), {
    notation: value >= 10_000 ? 'compact' : 'standard',
    maximumFractionDigits: 1,
  }).format(value)
}

export function resolveListPreviewImages(item: MangaListSummary) {
  return [...(item.previewImages || []), item.coverImage || '']
    .filter(Boolean)
    .filter((image, index, all) => all.indexOf(image) === index)
    .slice(0, 3)
}

export function matchesListCategory(item: MangaListSummary, categoryId: MangaListCategoryId) {
  if (categoryId === 'all') return true
  const category = LIST_CATEGORY_PRESETS.find((entry) => entry.id === categoryId)
  if (!category) return true

  if (item.categoryId) {
    return item.categoryId === categoryId
  }

  const haystack = [
    item.title,
    item.description,
    item.coverMangaTitle,
  ].filter(Boolean).join(' ').toLocaleLowerCase(intlLocale())

  return category.keywords.some((word) => haystack.includes(word))
}

export function isCollaborativeCandidate(item: MangaListSummary) {
  const text = `${item.title} ${item.description}`.toLocaleLowerCase(intlLocale())
  return item.itemsCount >= 15 || ['ortak', 'kulup', 'topluluk', 'ekip', 'is birligi'].some((word) => text.includes(word))
}

export function getWeeklyListScore(item: MangaListSummary) {
  const periodScore = Number(item.score || 0)
  const periodRatings = Number(item.periodRatingCount || 0)
  const periodComments = Number(item.periodCommentCount || 0)
  return (
    periodScore * 10
    + periodRatings * 8
    + periodComments * 5
    + item.ratingAvg * 6
    + item.ratingsCount * 2
    + item.commentsCount * 1.5
    + Math.min(item.itemsCount, 40) * 0.25
  )
}

export function pickWeeklyList(candidates: MangaListSummary[]) {
  const unique = new Map<string, MangaListSummary>()
  candidates.forEach((item) => {
    if (!unique.has(item.id)) unique.set(item.id, item)
  })

  return [...unique.values()].sort((left, right) => {
    const scoreDiff = getWeeklyListScore(right) - getWeeklyListScore(left)
    if (Math.abs(scoreDiff) > 0.01) return scoreDiff
    if (right.ratingAvg !== left.ratingAvg) return right.ratingAvg - left.ratingAvg
    if (right.ratingsCount !== left.ratingsCount) return right.ratingsCount - left.ratingsCount
    return new Date(right.updatedAt || right.createdAt).getTime() - new Date(left.updatedAt || left.createdAt).getTime()
  })[0] || null
}

export function MangaListCoverStack({
  item,
  className,
  compact = false,
}: {
  item: MangaListSummary
  className?: string
  compact?: boolean
}) {
  const images = resolveListPreviewImages(item)
  const slots = images.length > 0
    ? [...images, ...Array.from({ length: Math.max(0, 3 - images.length) }, () => null)].slice(0, 3)
    : [null, null, null]
  const gradientCards = [
    'bg-[linear-gradient(145deg,#2a2a2a,#111_48%,#ef4444)]',
    'bg-[linear-gradient(145deg,#ef4444,#1b1b1b_52%,#050505)]',
    'bg-[linear-gradient(145deg,#f4f4f5,#262626_46%,#7f1d1d)]',
    'bg-[linear-gradient(145deg,#451a1a,#090909_58%,#ef4444)]',
  ]

  return (
    <div
      className={cn(
        'relative isolate mx-auto h-32 w-full max-w-[200px]',
        compact ? 'h-24 max-w-[160px]' : 'h-40 max-w-[230px]',
        className,
      )}
      aria-hidden="true"
    >
      {slots.map((image, index) => {
          const placements = compact
            ? [
                'left-[6%] top-4 z-10 rotate-[-8deg]',
                'left-[31%] top-1 z-20 rotate-[0deg]',
                'left-[56%] top-5 z-10 rotate-[8deg]',
              ]
            : [
                'left-[4%] top-6 z-10 rotate-[-10deg]',
                'left-[32%] top-1 z-30 rotate-[-2deg]',
                'left-[60%] top-7 z-20 rotate-[9deg]',
              ]
          const sizes = compact ? 'h-[84px] w-[58px]' : 'h-[132px] w-[90px]'
          return image ? (
            <img
              key={`${item.id}-${image}-${index}`}
              src={image}
              alt=""
              loading="lazy"
              decoding="async"
              className={cn(
                'absolute rounded-lg border border-white/10 bg-muted object-cover shadow-[0_14px_28px_rgba(0,0,0,.42)] transition-transform duration-300 group-hover:-translate-y-1',
                sizes,
                placements[index],
              )}
            />
          ) : (
            <div
              key={`${item.id}-fallback-${index}`}
              className={cn(
                'absolute rounded-lg border border-white/10 shadow-[0_14px_28px_rgba(0,0,0,.42)] transition-transform duration-300 group-hover:-translate-y-1',
                sizes,
                placements[index],
                gradientCards[index],
              )}
            >
              <div className="absolute inset-x-2 top-2 h-2 rounded-full bg-white/20" />
              <div className="absolute inset-x-2 bottom-3 space-y-1">
                <span className="block h-1.5 rounded-full bg-white/25" />
                <span className="block h-1.5 w-2/3 rounded-full bg-white/15" />
              </div>
            </div>
          )
        })}
      <div className="absolute inset-x-3 bottom-2 h-8 rounded-full bg-primary/20 blur-2xl" />
    </div>
  )
}

export function MangaListShowcaseCard({
  item,
  variant = 'featured',
}: {
  item: MangaListSummary
  variant?: 'featured' | 'popular'
}) {
  return (
    <Card
      data-hover-card-boundary
      data-list-showcase-card
      data-list-variant={variant}
      className="group h-[316px] overflow-hidden border-border/70 bg-card/85 p-0 transition-all duration-200 hover:border-primary/45 hover:bg-accent/20"
    >
      <Link to={`/listeler/${item.id}`} className="flex h-full flex-col">
        <div className="h-[154px] shrink-0 overflow-hidden border-b border-border/50 bg-[radial-gradient(circle_at_top,rgba(239,68,68,.12),transparent_48%),#050505] px-3 pt-2">
          <MangaListCoverStack item={item} className="h-[148px] max-w-[224px]" />
        </div>
        <div className="flex min-h-0 flex-1 flex-col space-y-2.5 p-3 pb-5">
          <div className="space-y-1">
            <h3 className="line-clamp-1 text-sm font-black text-foreground group-hover:text-primary">
              {item.title}
            </h3>
            <p className="line-clamp-2 min-h-[30px] text-[11px] leading-4 text-muted-foreground">
              {item.description || txa('Bu liste için açıklama eklenmedi.')}
            </p>
          </div>

          <div className="flex items-center gap-2 text-[11px]">
            <UserHoverCard
              id={item.ownerId}
              username={item.ownerUsername}
              avatar={item.ownerAvatar}
              frameType={item.ownerFrameType || 'default'}
              profileBackgroundStyle={item.ownerProfileBackgroundStyle}
              profileBackgroundVideoUrl={item.ownerProfileBackgroundVideoUrl}
              profilePatternStyle={item.ownerProfilePatternStyle}
              sideOffset={12}
            >
              <AvatarFrame
                src={item.ownerAvatar}
                alt={item.ownerUsername}
                frameType={item.ownerFrameType || 'default'}
                size={24}
                animated={true}
              />
            </UserHoverCard>
            <UserHoverCard
              id={item.ownerId}
              username={item.ownerUsername}
              avatar={item.ownerAvatar}
              frameType={item.ownerFrameType || 'default'}
              profileBackgroundStyle={item.ownerProfileBackgroundStyle}
              profileBackgroundVideoUrl={item.ownerProfileBackgroundVideoUrl}
              profilePatternStyle={item.ownerProfilePatternStyle}
              className="inline-flex min-w-0"
              sideOffset={12}
            >
              <span className="line-clamp-1 font-bold text-foreground">@{item.ownerUsername}</span>
            </UserHoverCard>
          </div>

          <div data-list-card-stats className="mt-auto flex min-h-6 items-center gap-3 text-[11px] leading-none text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <BookOpen className="h-3.5 w-3.5 text-primary" />
              {txa('{v1} seri', { v1: item.itemsCount })}
            </span>
            <span className="ml-auto inline-flex items-center gap-1">
              <Star className="h-3.5 w-3.5 text-amber-400" />
              {item.ratingAvg.toFixed(1)}
            </span>
            <span className="inline-flex items-center gap-1">
              <MessageCircle className="h-3.5 w-3.5 text-muted-foreground" />
              {item.commentsCount}
            </span>
          </div>
        </div>
      </Link>
    </Card>
  )
}

export function MangaListCompactCard({ item }: { item: MangaListSummary }) {
  return (
    <Card
      data-hover-card-boundary
      className="group h-[190px] overflow-hidden border-border/70 bg-card/80 py-0 transition-all hover:border-primary/35 hover:bg-accent/20"
    >
      <Link to={`/listeler/${item.id}`} className="block h-full p-3">
        <div className="mb-3 flex items-start justify-between gap-2">
          <h3 className="line-clamp-1 text-sm font-black leading-tight group-hover:text-primary">{item.title}</h3>
          <span className="rounded-full border border-border/70 px-1.5 py-0.5 text-[10px] text-muted-foreground">
            {item.isPublic ? txa('Açık') : txa('Özel')}
          </span>
        </div>
        <p className="line-clamp-2 min-h-[32px] text-[11px] leading-4 text-muted-foreground">
          {item.description || txa('Liste açıklaması eklenmedi.')}
        </p>
        <MangaListCoverStack item={item} compact className="my-2 h-20 max-w-[140px]" />
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span>{txa('{v1} seri', { v1: item.itemsCount })}</span>
          <span className="ml-auto">{formatRelativeTime(item.updatedAt || item.createdAt)}</span>
        </div>
      </Link>
    </Card>
  )
}

export function MangaListTableRow({ item }: { item: MangaListSummary }) {
  return (
    <Link
      to={`/listeler/${item.id}`}
      data-hover-card-boundary
      className="grid grid-cols-[minmax(0,1fr)_88px_86px] items-center gap-3 border-b border-border/45 px-3 py-3 text-sm transition-colors last:border-b-0 hover:bg-accent/25 sm:grid-cols-[minmax(0,1fr)_110px_100px_86px]"
    >
      <div className="flex min-w-0 items-center gap-3">
        <MangaListCoverStack item={item} compact className="hidden h-16 max-w-[96px] sm:block" />
        <div className="min-w-0">
          <h3 className="line-clamp-1 font-bold text-foreground">{item.title}</h3>
          <p className="line-clamp-1 text-xs text-muted-foreground">
            {txa('@{v1} - {v2} manga', { v1: item.ownerUsername, v2: item.itemsCount })}
          </p>
        </div>
      </div>
      <span className="hidden text-xs text-muted-foreground sm:block">{formatDate(item.updatedAt || item.createdAt)}</span>
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <MessageCircle className="h-3.5 w-3.5" />
        {item.commentsCount}
      </span>
      <span className="inline-flex items-center justify-end gap-1 text-xs font-bold text-amber-400">
        <Star className="h-3.5 w-3.5" />
        {item.ratingAvg.toFixed(1)}
      </span>
    </Link>
  )
}

export function SectionHeader({
  title,
  actionLabel,
  to,
}: {
  title: string
  actionLabel?: string
  to?: string
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-lg font-black tracking-tight text-foreground">{title}</h2>
      {actionLabel && to ? (
        <Button asChild variant="ghost" size="sm" className="h-8 gap-1.5 text-xs text-muted-foreground">
          <Link to={to}>
            {actionLabel}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
      ) : null}
    </div>
  )
}

export function EmptyListPanel({ title, body }: { title: string; body: string }) {
  return (
    <Card className="gap-0 border-dashed border-border/70 bg-card/50 py-0">
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Plus className="h-5 w-5" />
        </div>
        <h3 className="text-base font-black text-foreground">{title}</h3>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">{body}</p>
      </div>
    </Card>
  )
}

export const LIST_STATS_ICON_MAP = {
  total: BookOpen,
  following: Users,
  completed: Sparkles,
  planned: Heart,
  updated: CalendarClock,
} as const
