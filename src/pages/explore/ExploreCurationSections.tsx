import { Link } from '@/i18n/router'
import { BookOpenText, ChevronLeft, ChevronRight, Sparkles, Star } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { Manga } from '@/types'
import type { ExploreCollectionConfig } from '@/services/exploreConfigService'
import { resolveStoreAssetUrl } from '@/services/assetUrlService'
import { buildCoverPlaceholder } from '@/lib/coverPlaceholder'
import { buildPublicMangaPath } from '@/lib/routes'
import type { ExploreGenreItem } from './explorePageShared'
import { intlLocale, txa } from '@/i18n/activeLocale'

interface ExploreGenreRailProps {
  genres: ExploreGenreItem[]
  selectedGenres: string[]
  genreControl: ReactNode
  onToggleGenre: (genreId: string) => void
  onClearGenres: () => void
}

interface ExploreEditorPicksSectionProps {
  mangas: Manga[]
  loading: boolean
}

interface ExploreNewAdditionsSectionProps {
  mangas: Manga[]
  loading: boolean
}

interface ExploreThematicCollectionsProps {
  collections: ExploreCollectionConfig[]
  genreCounts: Record<string, number>
  onSelectGenre: (genreId: string) => void
}

const EDITOR_BADGES = ['YENİ', 'ÖNERİLEN', 'TREND', 'YÜKSELEN']
const EDITOR_PAGE_SIZE = 4

export function ExploreGenreRail({
  genres,
  selectedGenres,
  genreControl,
  onToggleGenre,
  onClearGenres,
}: ExploreGenreRailProps) {
  return (
    <section className="flex items-center gap-2 overflow-hidden">
      <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1">
        <Button
          type="button"
          size="sm"
          variant={selectedGenres.length === 0 ? 'default' : 'outline'}
          className="shrink-0 rounded-full px-4"
          onClick={onClearGenres}
        >
          {txa('Tümü')}
        </Button>
        {genres.map((genre) => {
          const selected = selectedGenres.includes(genre.id)
          return (
            <Button
              key={genre.id}
              type="button"
              size="sm"
              variant={selected ? 'default' : 'outline'}
              className="shrink-0 rounded-full px-4"
              onClick={() => onToggleGenre(genre.id)}
            >
              {txa(genre.name)}
            </Button>
          )
        })}
      </div>
      <div className="shrink-0">{genreControl}</div>
    </section>
  )
}

export function ExploreEditorPicksSection({ mangas, loading }: ExploreEditorPicksSectionProps) {
  const [startIndex, setStartIndex] = useState(0)
  const maxStartIndex = Math.max(0, mangas.length - EDITOR_PAGE_SIZE)
  const visibleMangas = mangas.slice(startIndex, startIndex + EDITOR_PAGE_SIZE)
  const canNavigate = mangas.length > EDITOR_PAGE_SIZE

  useEffect(() => {
    setStartIndex(0)
  }, [mangas.length])

  function move(direction: -1 | 1) {
    setStartIndex((current) => {
      const next = current + direction
      return Math.min(Math.max(next, 0), maxStartIndex)
    })
  }

  return (
    <section className="rounded-xl border border-border/70 bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-black tracking-tight">{txa('Editörün Seçimleri')}</h2>
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="size-8 rounded-full"
            disabled={!canNavigate || startIndex === 0}
            onClick={() => move(-1)}
            aria-label={txa('Önceki editör seçimi')}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="size-8 rounded-full"
            disabled={!canNavigate || startIndex >= maxStartIndex}
            onClick={() => move(1)}
            aria-label={txa('Sonraki editör seçimi')}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {loading && mangas.length === 0 ? (
          Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-[292px] animate-pulse rounded-lg bg-muted" />
          ))
        ) : null}

        {!loading && mangas.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border px-4 py-8 text-sm text-muted-foreground">
            {txa('Editör seçimi için admin panelinden seri seç.')}
          </div>
        ) : null}

        {visibleMangas.map((manga, index) => (
          <EditorPickCard
            key={manga.id}
            manga={manga}
            badge={EDITOR_BADGES[(startIndex + index) % EDITOR_BADGES.length]}
          />
        ))}
      </div>
    </section>
  )
}

function EditorPickCard({ manga, badge }: { manga: Manga; badge: string }) {
  const path = buildPublicMangaPath({ id: manga.id, slug: manga.slug, title: manga.title })
  const cover = manga.coverImage || buildCoverPlaceholder(manga.title)
  const ratingLabel = typeof manga.rating === 'number' && Number.isFinite(manga.rating)
    ? manga.rating.toFixed(1)
    : null

  return (
    <Link
      to={path}
      className="group relative h-[292px] min-w-0 overflow-hidden rounded-lg border border-border/70 bg-muted"
    >
      <img
        src={cover}
        alt={manga.title}
        loading="lazy"
        decoding="async"
        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        onError={(event) => {
          event.currentTarget.src = buildCoverPlaceholder(manga.title)
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/35 to-black/10" />
      <div className="absolute left-3 top-3">
        <Badge className="border-0 bg-primary text-[10px] font-black text-primary-foreground">{txa(badge)}</Badge>
      </div>
      <div className="absolute inset-x-3 bottom-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="line-clamp-2 text-sm font-black leading-snug text-white">{manga.title}</h3>
          {ratingLabel ? (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-black/55 px-2 py-1 text-[11px] font-black text-amber-300">
              <Star className="size-3 fill-current" />
              {ratingLabel}
            </span>
          ) : null}
        </div>
        <p className="line-clamp-2 text-[11px] leading-4 text-white/72">
          {manga.description || txa('Editör seçimi seriler arasından kısa bir keşif önerisi.')}
        </p>
        {manga.genres?.length ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {manga.genres.slice(0, 2).map((genre) => (
              <span key={genre} className="rounded bg-white/12 px-1.5 py-0.5 text-[10px] font-semibold text-white/85">
                {txa(genre)}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </Link>
  )
}

export function ExploreNewAdditionsSection({ mangas, loading }: ExploreNewAdditionsSectionProps) {
  if (!loading && mangas.length === 0) return null

  return (
    <section className="rounded-xl border border-border/70 bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-base font-black tracking-tight">{txa('Yeni Eklenenler')}</h2>
        <span className="text-[11px] font-semibold text-muted-foreground">{txa('Son yayınlanan seriler')}</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {loading && mangas.length === 0 ? (
          Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-[224px] animate-pulse rounded-lg bg-muted" />
          ))
        ) : null}

        {mangas.slice(0, 6).map((manga) => (
          <NewAdditionCard key={manga.id} manga={manga} />
        ))}
      </div>
    </section>
  )
}

function NewAdditionCard({ manga }: { manga: Manga }) {
  const path = buildPublicMangaPath({ id: manga.id, slug: manga.slug, title: manga.title })
  const cover = manga.coverImage || buildCoverPlaceholder(manga.title)
  const ratingLabel = typeof manga.rating === 'number' && Number.isFinite(manga.rating)
    ? manga.rating.toFixed(1)
    : null
  const chapterLabel = manga.lastChapterTitle || manga.lastChapter || txa('Yeni seri')

  return (
    <Link
      to={path}
      className="group overflow-hidden rounded-lg border border-border/70 bg-background/45 transition-colors hover:border-primary/35 hover:bg-background/70"
    >
      <div className="relative aspect-[3/4] overflow-hidden bg-muted">
        <img
          src={cover}
          alt={manga.title}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          onError={(event) => {
            event.currentTarget.src = buildCoverPlaceholder(manga.title)
          }}
        />
        <Badge className="absolute left-2 top-2 border-0 bg-primary text-[10px] font-black text-primary-foreground">
          {txa('YENİ')}
        </Badge>
      </div>
      <div className="space-y-1.5 p-3">
        <h3 className="line-clamp-2 min-h-9 text-xs font-black leading-[18px] text-foreground group-hover:text-primary">
          {manga.title}
        </h3>
        <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span className="inline-flex min-w-0 items-center gap-1 truncate">
            <BookOpenText className="size-3.5 shrink-0 text-primary" />
            <span className="truncate">{chapterLabel}</span>
          </span>
          {ratingLabel ? (
            <span className="inline-flex shrink-0 items-center gap-1 font-black text-amber-500">
              <Star className="size-3 fill-current" />
              {ratingLabel}
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  )
}

export function ExploreThematicCollections({
  collections,
  genreCounts,
  onSelectGenre,
}: ExploreThematicCollectionsProps) {
  const visibleCollections = collections.filter((collection) => collection.isActive)
  if (visibleCollections.length === 0) return null

  return (
    // NO card shell on mobile: in the prototype sections sit directly on the page;
    // nested card boxes produced double borders on phones.
    <section className="rounded-xl border border-border/70 bg-card p-4 max-lg:rounded-none max-lg:border-0 max-lg:bg-transparent max-lg:p-0">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-black tracking-tight max-lg:text-[15px] max-lg:font-extrabold max-lg:uppercase max-lg:tracking-[0.045em]">{txa('Tematik Koleksiyonlar')}</h2>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {visibleCollections.map((collection) => {
          const resolvedImage = resolveStoreAssetUrl(collection.imageUrl) || collection.imageUrl
          const count = genreCounts[collection.targetGenreId] || 0
          return (
            <button
              key={collection.id}
              type="button"
              className="group relative min-h-[142px] overflow-hidden rounded-lg border border-border/70 bg-muted text-left"
              onClick={() => onSelectGenre(collection.targetGenreId)}
            >
              <img
                src={resolvedImage}
                alt=""
                loading="lazy"
                decoding="async"
                className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-black/88 via-black/55 to-black/10" />
              <div className="relative flex h-full min-h-[142px] flex-col justify-end p-5">
                <div className="mb-1 inline-flex w-fit items-center gap-1 rounded-full bg-white/12 px-2 py-1 text-[10px] font-bold text-white/85">
                  <Sparkles className="size-3" />
                  {txa('Koleksiyon')}
                </div>
                <h3 className="text-lg font-black leading-tight text-white">{txa(collection.title)}</h3>
                <div className="mt-1 flex items-center gap-1 text-xs font-semibold text-white/75">
                  {count > 0 ? txa('{count} seri', { count: count.toLocaleString(intlLocale()) }) : txa('Türe git')}
                  <ChevronRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </section>
  )
}

export function pickGenreRailItems(genres: ExploreGenreItem[]) {
  const preferred = ['action', 'fantasy', 'romance', 'comedy', 'mystery', 'horror', 'sci-fi', 'slice-of-life']
  const byId = new Map(genres.map((genre) => [genre.id, genre]))
  return preferred
    .map((id) => byId.get(id))
    .filter((genre): genre is ExploreGenreItem => Boolean(genre))
    .concat(genres.filter((genre) => !preferred.includes(genre.id)).slice(0, 2))
    .slice(0, 10)
}
