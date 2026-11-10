import { Link } from '@/i18n/router'
import {
  ArrowLeft,
  Bookmark,
  BookOpen,
  Clipboard,
  MoreHorizontal,
  Plus,
  Share2,
  Star,
  Users,
} from 'lucide-react'
import { ProfileHoverLink } from '@/components/common/ProfileHoverLink'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { normalizeGenreId, toCanonicalGenreId } from '@/pages/explore/explorePageShared'
import type { MangaListDetail } from '@/services/mangaListService'
import { intlLocale, txa } from '@/i18n/activeLocale'

function extractTags(detail: MangaListDetail): string[] {
  const tagSet = new Set<string>()
  for (const item of detail.items) {
    if (item.genres) {
      for (const genre of item.genres) tagSet.add(genre)
    }
  }
  return Array.from(tagSet)
}

function buildExploreGenrePath(tag: string) {
  const canonicalGenreId = toCanonicalGenreId(normalizeGenreId(tag))
  return `/kesfet?genres=${encodeURIComponent(canonicalGenreId)}`
}

interface MangaListDetailHeroProps {
  detail: MangaListDetail
  onEdit?: () => void
}

interface MangaListDetailActionBarProps {
  detail: MangaListDetail
  myRating: number
  startPath?: string
  onEdit?: () => void
  onFollow: () => void
  onRate: (score: number) => void
  onShare: () => void
}

export function MangaListDetailHero({
  detail,
  onEdit,
}: MangaListDetailHeroProps) {
  const coverImages = detail.items
    .slice(0, 5)
    .map((item) => item.coverImage)
    .filter(Boolean)
  const tags = extractTags(detail)
  const visibleTagCount = 4
  const visibleTags = tags.slice(0, visibleTagCount)
  const hiddenTags = tags.slice(visibleTagCount)

  return (
    <section className="relative isolate min-h-[236px] overflow-hidden rounded-t-2xl border border-b-0 border-border/30 bg-[#050505] sm:h-[236px] sm:min-h-0">
      <div className="absolute inset-0 z-0 hidden md:block">
        <div className="absolute inset-y-0 right-0 grid w-[62%] grid-cols-5">
          {Array.from({ length: 5 }, (_, index) => {
            const src = coverImages[index]
            return src ? (
              <img
                key={`${src}-${index}`}
                src={src}
                alt=""
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover opacity-70 saturate-110"
              />
            ) : (
              <div
                key={`hero-cover-placeholder-${index}`}
                className="h-full bg-[linear-gradient(145deg,#151515,#050505_56%,#2a0c0c)]"
              />
            )
          })}
        </div>
        <div className="absolute inset-0 bg-gradient-to-r from-black via-black/86 to-black/28" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/52" />
      </div>

      <div className="relative z-10 flex min-h-[236px] flex-col px-5 py-4 sm:h-full sm:min-h-0 sm:px-7">
        <Link
          to="/listeler"
          className="inline-flex w-fit items-center gap-1.5 text-xs font-medium text-white/60 transition-colors hover:text-white"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {txa('Tüm Listelere Dön')}
        </Link>

        <div className="mt-4 flex max-w-[760px] flex-1 flex-col justify-center gap-4 pb-2">
          <div className="flex items-start gap-3">
            <span className="mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/20 text-primary">
              <BookOpen className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <div className="flex items-start gap-2.5">
                <h1 className="line-clamp-2 text-2xl font-black tracking-tight text-white sm:text-3xl lg:text-4xl">
                  {detail.title}
                </h1>
                <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-500">
                  <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={3} className="h-3 w-3">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <ProfileHoverLink
              userId={detail.ownerId}
              username={detail.ownerUsername}
              avatar={detail.ownerAvatar}
              frameType={detail.ownerFrameType || 'default'}
              profileBackgroundStyle={detail.ownerProfileBackgroundStyle}
              profileBackgroundVideoUrl={detail.ownerProfileBackgroundVideoUrl}
              profilePatternStyle={detail.ownerProfilePatternStyle}
              className="inline-flex min-w-0 items-center gap-2 text-sm font-semibold text-white/80 transition-colors hover:text-white"
            >
              <img
                src={detail.ownerAvatar}
                alt={detail.ownerUsername}
                className="h-6 w-6 shrink-0 rounded-full object-cover ring-1 ring-white/20"
                loading="lazy"
              />
              <span className="truncate">{detail.ownerUsername}</span>
            </ProfileHoverLink>
          </div>

          {tags.length > 0 && (
            <TooltipProvider delayDuration={120}>
              <div className="flex flex-wrap items-center gap-2">
                {visibleTags.map((tag) => (
                  <Badge
                    key={tag}
                    asChild
                    variant="outline"
                    className="border-white/15 bg-white/5 text-xs text-white/80 hover:border-primary/50 hover:bg-primary/15 hover:text-white"
                  >
                    <Link to={buildExploreGenrePath(tag)}>#{tag}</Link>
                  </Badge>
                ))}
                {hiddenTags.length > 0 && (
                  <Tooltip>
                    <TooltipTrigger
                      type="button"
                      className="inline-flex h-6 cursor-help items-center justify-center rounded-full border border-white/15 bg-white/5 px-2 text-xs font-medium text-white/55 transition-colors hover:border-primary/50 hover:text-white"
                    >
                      +{hiddenTags.length}
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-[280px] bg-zinc-950 text-white">
                      {hiddenTags.join(', ')}
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
            </TooltipProvider>
          )}

          {detail.canEdit && onEdit && (
            <Button
              size="sm"
              variant="outline"
              onClick={onEdit}
              className="h-8 w-fit border-white/20 bg-white/5 text-xs text-white hover:bg-white/10"
            >
              {txa('Listeyi Düzenle')}
            </Button>
          )}
        </div>
      </div>
    </section>
  )
}

export function MangaListDetailActionBar({
  detail,
  myRating,
  startPath,
  onEdit,
  onFollow,
  onRate,
  onShare,
}: MangaListDetailActionBarProps) {
  return (
    <section
      aria-label={txa('Liste hızlı aksiyonları')}
      className="flex flex-wrap items-center justify-between gap-4 rounded-b-2xl border border-border/30 bg-black/35 px-5 py-3.5 backdrop-blur-sm sm:px-7"
    >
      <div className="flex flex-wrap items-center gap-5 sm:gap-7">
        <StatItem
          icon={Star}
          label={txa('Ortalama Puan')}
          value={detail.ratingAvg.toFixed(1)}
          accent
        />
        <StatItem
          icon={Users}
          label={txa('Takipçi')}
          value={detail.ratingsCount.toLocaleString(intlLocale())}
        />
        <StatItem
          icon={BookOpen}
          label={txa('Seri')}
          value={String(detail.itemsCount)}
        />

        <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">
          <span className="text-[11px] font-semibold text-white/70">
            {myRating > 0 ? txa('Puanın {rating}/5', { rating: myRating }) : txa('Listeyi puanla')}
          </span>
          <div className="flex items-center gap-0.5">
            {[1, 2, 3, 4, 5].map((score) => (
              <button
                key={score}
                type="button"
                aria-label={txa('{score} puan ver', { score })}
                onClick={() => onRate(score)}
                className="rounded-sm p-0.5 text-white/35 transition-colors hover:text-amber-400"
              >
                <Star
                  className={cn(
                    'h-3.5 w-3.5',
                    myRating >= score && 'fill-amber-400 text-amber-400',
                  )}
                />
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          type="button"
          onClick={onFollow}
          className="gap-1.5 bg-red-600 text-white hover:bg-red-700"
        >
          <Plus className="h-3.5 w-3.5" />
          {myRating > 0 ? txa('Takipte') : txa('Takip Et')}
        </Button>
        <Button
          size="sm"
          variant="outline"
          type="button"
          onClick={onShare}
          className="gap-1.5 border-white/20 bg-white/5 text-white hover:bg-white/10"
        >
          <Share2 className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{txa('Paylaş')}</span>
        </Button>
        {startPath ? (
          <Button
            size="sm"
            variant="outline"
            asChild
            className="gap-1.5 border-white/20 bg-white/5 text-white hover:bg-white/10"
          >
            <Link to={startPath}>
              <Bookmark className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{txa('Listeye Başla')}</span>
            </Link>
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            type="button"
            disabled
            className="gap-1.5 border-white/20 bg-white/5 text-white"
          >
            <Bookmark className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{txa('Listeye Başla')}</span>
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon-sm"
              variant="ghost"
              className="text-white/60 hover:text-white"
              aria-label={txa('Liste aksiyonlari')}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={onShare}>
                <Clipboard className="h-4 w-4" />
                {txa('Bağlantıyı Kopyala')}
              </DropdownMenuItem>
            </DropdownMenuGroup>
            {onEdit && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onEdit}>
                  {txa('Listeyi Düzenle')}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </section>
  )
}

function StatItem({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  accent?: boolean
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon
        className={cn(
          'h-4 w-4',
          accent ? 'fill-amber-400 text-amber-400' : 'text-white/50',
        )}
      />
      <div>
        <p
          className={cn(
            'text-sm font-bold',
            accent ? 'text-amber-400' : 'text-white',
          )}
        >
          {value}
        </p>
        <p className="text-[10px] text-white/50">{label}</p>
      </div>
    </div>
  )
}
