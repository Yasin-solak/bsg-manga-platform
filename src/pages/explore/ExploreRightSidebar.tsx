import { AnnouncementsPanel } from '@/components/announcements/AnnouncementsPanel'
import { Link } from '@/i18n/router'
import { ArrowRight, BookOpenText, Hash, Star } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { Manga } from '@/types'
import { buildCoverPlaceholder } from '@/lib/coverPlaceholder'
import { buildPublicMangaPath } from '@/lib/routes'
import type { ExploreGenreItem } from './explorePageShared'
import { PremiumPromoCard } from '@/components/common/PremiumPromoCard'
import { intlLocale, txa } from '@/i18n/activeLocale'

interface ExploreRightSidebarProps {
  editorMangas: Manga[]
  genreItems: ExploreGenreItem[]
  genreCounts: Record<string, number>
  onSelectGenre: (genreId: string) => void
}

export function ExploreRightSidebar({
  editorMangas,
  genreItems,
  genreCounts,
  onSelectGenre,
}: ExploreRightSidebarProps) {
  // The weekly pick is set by the series the admin puts first in editor's picks.
  const weeklyPick = editorMangas[0] || null
  const popularTags = genreItems
    .filter((genre) => (genreCounts[genre.id] || genre.count || 0) > 0)
    .slice(0, 7)

  return (
    <aside className="flex flex-col gap-4">
      <AnnouncementsPanel />
      <PopularTagsCard
        tags={popularTags}
        genreCounts={genreCounts}
        onSelectGenre={onSelectGenre}
      />
      {weeklyPick ? <WeeklyPickCard manga={weeklyPick} /> : null}
      <PremiumPromoCard />
    </aside>
  )
}

function PopularTagsCard({
  tags,
  genreCounts,
  onSelectGenre,
}: {
  tags: ExploreGenreItem[]
  genreCounts: Record<string, number>
  onSelectGenre: (genreId: string) => void
}) {
  return (
    <Card className="rounded-xl border-border/70 bg-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-sm font-black">{txa('POPÜLER ETİKETLER')}</CardTitle>
            <p className="mt-1 text-[11px] font-medium text-muted-foreground">{txa('Türe göre keşfet')}</p>
          </div>
          <span className="inline-flex size-8 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Hash className="size-4" />
          </span>
        </div>
      </CardHeader>
      <CardContent className="grid gap-2">
        {tags.length === 0 ? (
          <p className="text-xs text-muted-foreground">{txa('Etiket verisi hazırlanıyor.')}</p>
        ) : tags.map((genre) => (
          <button
            key={genre.id}
            type="button"
            className="group flex items-center justify-between rounded-lg border border-border/70 bg-background/40 px-3 py-2.5 text-left transition-colors hover:border-primary/45 hover:bg-primary/10"
            onClick={() => onSelectGenre(genre.id)}
          >
            <span className="min-w-0 truncate text-xs font-bold text-foreground group-hover:text-primary">
              #{txa(genre.name).replace(/\s+/g, '')}
            </span>
            <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[10px] font-black text-muted-foreground">
              {(genreCounts[genre.id] || genre.count || 0).toLocaleString(intlLocale())}
            </span>
          </button>
        ))}
      </CardContent>
    </Card>
  )
}

function WeeklyPickCard({ manga }: { manga: Manga }) {
  const path = buildPublicMangaPath({ id: manga.id, slug: manga.slug, title: manga.title })
  const cover = manga.coverImage || buildCoverPlaceholder(manga.title)
  const ratingLabel = typeof manga.rating === 'number' && Number.isFinite(manga.rating)
    ? manga.rating.toFixed(1)
    : null
  const chapterLabel = manga.lastChapterTitle || manga.lastChapter || txa('Bölüm bilgisi yakında')

  return (
    <Card className="rounded-xl border-border/70 bg-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-black">{txa('HAFTANIN ÖNERİSİ')}</CardTitle>
      </CardHeader>
      <CardContent>
        <Link to={path} className="group flex gap-4">
          <img
            src={cover}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-40 w-28 shrink-0 rounded-lg border border-border/60 object-cover"
            onError={(event) => {
              event.currentTarget.src = buildCoverPlaceholder(manga.title)
            }}
          />
          <div className="min-w-0 flex-1">
            <h3 className="line-clamp-2 text-sm font-black leading-snug group-hover:text-primary">{manga.title}</h3>
            {manga.genres?.length ? (
              <div className="mt-2 flex flex-wrap gap-1">
                {manga.genres.slice(0, 2).map((genre) => (
                  <Badge key={genre} variant="secondary" className="text-[10px]">{genre}</Badge>
                ))}
              </div>
            ) : null}
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {ratingLabel ? (
                <span className="inline-flex items-center gap-1 font-black text-amber-500">
                  <Star className="size-4 fill-current" />
                  {ratingLabel}
                </span>
              ) : null}
              <span className="inline-flex items-center gap-1">
                <BookOpenText className="size-3.5" />
                {chapterLabel}
              </span>
            </div>
            <p className="mt-2 line-clamp-3 text-xs leading-5 text-muted-foreground">
              {manga.description || txa('Editörün bu hafta öne aldığı seri.')}
            </p>
          </div>
        </Link>

        <Link
          to={path}
          className="mt-4 flex items-center justify-center gap-1 rounded-lg border border-primary/35 bg-primary/10 px-4 py-2.5 text-sm font-bold text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
        >
          {txa('Hemen Keşfet')} <ArrowRight className="size-4" />
        </Link>
      </CardContent>
    </Card>
  )
}

