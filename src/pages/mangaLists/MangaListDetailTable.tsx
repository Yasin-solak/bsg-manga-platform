import { useState } from 'react'
import { Link } from '@/i18n/router'
import { MoreHorizontal, Star, ArrowUpDown, LayoutList, LayoutGrid, BookOpen } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { buildPublicMangaPath } from '@/lib/routes'
import type { MangaListItem } from '@/services/mangaListService'
import { intlLocale, txa } from '@/i18n/activeLocale'

/* ------------------------------------------------------------------ */
/*  Props                                                             */
/* ------------------------------------------------------------------ */
interface MangaListDetailTableProps {
  items: MangaListItem[]
  baseDate?: string
}

/* ------------------------------------------------------------------ */
/* Sort options */
/* ------------------------------------------------------------------ */
type SortKey = 'position' | 'rating' | 'views' | 'title'

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'position', get label() { return txa('Sıralama') } },
  { key: 'rating', get label() { return txa('Puan') } },
  { key: 'views', get label() { return txa('Popüler') } },
  { key: 'title', get label() { return txa('Başlık') } },
]

const TABLE_GRID_CLASS = 'md:grid-cols-[48px_minmax(380px,1.6fr)_minmax(260px,1fr)_120px_104px_112px_100px_40px]'

/* ------------------------------------------------------------------ */
/* Sort function */
/* ------------------------------------------------------------------ */
function sortItems(items: MangaListItem[], sortKey: SortKey): MangaListItem[] {
  const sorted = [...items]
  switch (sortKey) {
    case 'rating':
      return sorted.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
    case 'views':
      return sorted.sort((a, b) => (b.views ?? 0) - (a.views ?? 0))
    case 'title':
      return sorted.sort((a, b) => a.title.localeCompare(b.title, 'tr'))
    default:
      return sorted.sort((a, b) => a.position - b.position)
  }
}

/* ------------------------------------------------------------------ */
/* Status badge: becomes dynamic when a status field is added */
/* ------------------------------------------------------------------ */
function getStatusBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-500">
      {txa('Devam Ediyor')}
    </span>
  )
}

/* ------------------------------------------------------------------ */
/*  Tarih formatlama                                                   */
/* ------------------------------------------------------------------ */
function formatAddedDate(idx: number, baseDate?: string) {
  const base = baseDate ? new Date(baseDate) : null
  if (!base || Number.isNaN(base.getTime())) return '-'
  base.setDate(base.getDate() - idx * 1)
  return base.toLocaleDateString(intlLocale(), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function formatChapterLabel(lastChapter?: string) {
  if (!lastChapter) return '-'

  const value = lastChapter
    .replace(/\s*\.?\s*(b[oö]l[uü]m|bl\.?)$/i, '')
    .trim()

  return value ? txa('{count} bölüm', { count: value }) : lastChapter
}

function formatCompactViews(value?: number) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null
  if (value >= 1000) return txa('{count} bin okunma', { count: (value / 1000).toFixed(1) })
  return txa('{count} okunma', { count: value.toLocaleString(intlLocale()) })
}

function getListReason(item: MangaListItem, index: number): string {
  const note = item.note?.trim()
  if (note) return note

  const primaryGenre = item.genres?.[0]
  const secondaryGenre = item.genres?.[1]
  const lowerPrimaryGenre = primaryGenre ? txa(primaryGenre).toLocaleLowerCase(intlLocale()) : undefined
  const viewText = formatCompactViews(item.views)

  if (index === 0) {
    return lowerPrimaryGenre
      ? txa('Listenin tonunu {genre} çizgisinde başlattığı için eklendi.', { genre: lowerPrimaryGenre })
      : txa('Listenin açılış ritmini kurduğu için ilk sıraya alındı.')
  }

  if (typeof item.rating === 'number' && item.rating >= 4.5) {
    return lowerPrimaryGenre
      ? txa('{rating} puanıyla {genre} seçkisini güçlendiriyor.', { rating: item.rating.toFixed(1), genre: lowerPrimaryGenre })
      : txa('{rating} puanıyla listede öne çıkan güvenli bir tercih.', { rating: item.rating.toFixed(1) })
  }

  if (primaryGenre && secondaryGenre) {
    return txa('{a} ve {b} dengesini tamamladığı için eklendi.', { a: txa(primaryGenre), b: txa(secondaryGenre) })
  }

  if (viewText) {
    return txa('{views} ilgisiyle listede keşif değerini yükseltiyor.', { views: viewText })
  }

  return txa('Listenin temposunu ve tür çeşitliliğini tamamladığı için eklendi.')
}

/* ------------------------------------------------------------------ */
/* Table component */
/* ------------------------------------------------------------------ */
export function MangaListDetailTable({ items, baseDate }: MangaListDetailTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('position')
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list')

  const sortedItems = sortItems(items, sortKey)

  if (items.length === 0) {
    return (
      <Card className="border-border/50 bg-card/60 p-8 text-center text-sm text-muted-foreground">
        {txa('Bu listede henüz manga yok.')}
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* Üst kontrol çubuğu */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-bold tracking-tight">{txa('Listedeki Seriler')}</h2>
          <Badge variant="outline" className="text-xs">
            {txa('{v1} seri', { v1: items.length })}
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          {/* Sıralama dropdown */}
          <div className="flex items-center gap-1 rounded-lg border border-border/60 bg-background/60 px-2 py-1">
            <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-[11px] text-muted-foreground">{txa('Sıralama:')}</span>
            <Select
              value={sortKey}
              onValueChange={(value) => setSortKey(value as SortKey)}
            >
              <SelectTrigger
                size="sm"
                aria-label={txa('Liste sıralaması')}
                className="h-7 border-0 bg-transparent px-1 text-xs shadow-none focus:ring-0"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                <SelectGroup>
                  {SORT_OPTIONS.map((opt) => (
                    <SelectItem key={opt.key} value={opt.key}>
                      {txa(opt.label)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          {/* Görünüm toggle */}
          <div className="flex overflow-hidden rounded-lg border border-border/60">
            <button
              type="button"
              aria-label={txa('Liste görünümü')}
              onClick={() => setViewMode('list')}
              className={cn(
                'p-1.5 transition-colors',
                viewMode === 'list' ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-accent/30',
              )}
            >
              <LayoutList className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label={txa('Grid görünümü')}
              onClick={() => setViewMode('grid')}
              className={cn(
                'p-1.5 transition-colors',
                viewMode === 'grid' ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-accent/30',
              )}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* İçerik: Tablo veya Grid */}
      {viewMode === 'list' ? (
        <div className="overflow-x-auto rounded-xl border border-border/50 bg-card/50">
          {/* Tablo başlık */}
          <div
            className={cn(
              'hidden gap-3 border-b border-border/40 bg-muted/20 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground md:grid',
              TABLE_GRID_CLASS,
            )}
          >
            <span>{txa('Sıra')}</span>
            <span>{txa('Seri')}</span>
            <span>{txa('Türler')}</span>
            <span className="text-center">{txa('Puan')}</span>
            <span className="text-center">{txa('Bölüm')}</span>
            <span className="text-center">{txa('Durum')}</span>
            <span className="text-center">{txa('Eklenme')}</span>
            <span />
          </div>

          {/* Tablo satırları */}
          {sortedItems.map((item, idx) => {
            const mangaPath = buildPublicMangaPath({ id: item.mangaId, slug: item.slug, title: item.title })
            const reason = getListReason(item, idx)

            return (
              <div
                key={item.id}
                className={cn(
                  'group grid items-center gap-3 border-b border-border/30 px-4 py-4 transition-colors last:border-b-0 hover:bg-accent/10',
                  'grid-cols-[32px_minmax(0,1fr)]',
                  TABLE_GRID_CLASS,
                )}
              >
              {/* Sıra */}
              <span className="text-center text-sm font-bold text-muted-foreground">
                {sortKey === 'position' ? item.position : idx + 1}
              </span>

              {/* Seri: Kapak + Başlık */}
              <Link to={mangaPath} className="flex items-center gap-3 transition-colors hover:text-primary">
                <img
                  src={item.coverImage}
                  alt={item.title}
                  loading="lazy"
                  decoding="async"
                  className="h-16 w-12 shrink-0 rounded-lg border border-border/40 object-cover shadow-sm"
                />
                <div className="min-w-0">
                  <p className="line-clamp-1 text-sm font-semibold text-foreground group-hover:text-primary">
                    {item.title}
                  </p>
                  <p className="mt-1 line-clamp-2 max-w-[34rem] text-[11px] leading-relaxed text-muted-foreground">
                    <span className="font-semibold text-foreground/70">{txa('Neden eklendi?')}</span> {reason}
                  </p>
                  {/* Mobilde: Genre'ler satır başlığı altında */}
                  {item.genres && item.genres.length > 0 && (
                    <div className="mt-0.5 flex flex-wrap gap-1 md:hidden">
                      {item.genres.slice(0, 4).map((g) => (
                        <span
                          key={g}
                          className="rounded bg-muted/30 px-1.5 py-0.5 text-[10px] text-muted-foreground"
                        >
                          {g}
                        </span>
                      ))}
                      {item.genres.length > 4 && (
                        <span
                          title={item.genres.slice(4).join(', ')}
                          className="rounded bg-muted/30 px-1.5 py-0.5 text-[10px] text-muted-foreground"
                        >
                          +{item.genres.length - 4}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </Link>

              {/* Türler – sadece desktop */}
              <div className="hidden flex-wrap gap-1 md:flex">
                {item.genres && item.genres.length > 0 ? (
                  <>
                    {item.genres.slice(0, 4).map((g) => (
                      <Badge
                        key={g}
                        variant="outline"
                        className="border-border/50 px-1.5 py-0 text-[10px] font-normal text-muted-foreground"
                      >
                        {g}
                      </Badge>
                    ))}
                    {item.genres.length > 4 && (
                      <Badge
                        variant="outline"
                        title={item.genres.slice(4).join(', ')}
                        className="cursor-help border-border/50 px-1.5 py-0 text-[10px] font-normal text-muted-foreground"
                      >
                        +{item.genres.length - 4}
                      </Badge>
                    )}
                  </>
                ) : (
                  <span className="text-[10px] text-muted-foreground/50">—</span>
                )}
              </div>

              {/* Puan */}
              <div className="hidden items-center justify-center md:flex">
                <div className="inline-grid min-w-[96px] grid-cols-[14px_34px_1fr] items-baseline justify-items-start gap-1">
                  <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                  <span className="text-sm font-bold text-foreground">
                    {typeof item.rating === 'number' ? item.rating.toFixed(1) : '-'}
                  </span>
                  {typeof item.views === 'number' && (
                    <span className="text-[10px] text-muted-foreground">
                      ({item.views > 1000 ? `${(item.views / 1000).toFixed(1)}K` : item.views})
                    </span>
                  )}
                </div>
              </div>

              {/* Bölüm */}
              <div className="hidden text-center md:block">
                <span className="text-sm font-medium text-foreground">
                  {formatChapterLabel(item.lastChapter)}
                </span>
              </div>

              {/* Durum */}
              <div className="hidden text-center md:block">{getStatusBadge()}</div>

              {/* Eklenme */}
              <div className="hidden text-center text-[11px] text-muted-foreground md:block">
                {formatAddedDate(idx, baseDate)}
              </div>

              {/* İşlemler */}
              <div className="hidden justify-center md:flex">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="icon-xs" variant="ghost" className="text-muted-foreground" aria-label={txa('{title} işlemleri', { title: item.title })}>
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuGroup>
                      <DropdownMenuItem asChild>
                        <Link to={mangaPath}>{txa('Manga Detayına Git')}</Link>
                      </DropdownMenuItem>
                    </DropdownMenuGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Mobil meta bilgiler */}
              <div className="col-span-2 flex flex-wrap items-center gap-2 md:hidden">
                {typeof item.rating === 'number' && (
                  <Badge variant="outline" className="gap-1 text-[10px]">
                    <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                    {item.rating.toFixed(1)}
                  </Badge>
                )}
                {item.lastChapter && (
                  <Badge variant="outline" className="text-[10px]">
                    {formatChapterLabel(item.lastChapter)}
                  </Badge>
                )}
                {item.isNew && (
                  <Badge variant="outline" className="border-emerald-500/30 text-[10px] text-emerald-500">
                    {txa('Yeni')}
                  </Badge>
                )}
              </div>
            </div>
            )
          })}
        </div>
      ) : (
        /* Grid view */
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {sortedItems.map((item, idx) => {
            const reason = getListReason(item, idx)

            return (
              <Link
                key={item.id}
                to={buildPublicMangaPath({ id: item.mangaId, slug: item.slug, title: item.title })}
                className="group overflow-hidden rounded-xl border border-border/50 bg-card/60 transition-all hover:border-primary/30 hover:shadow-lg"
              >
                <div className="aspect-[3/4] overflow-hidden">
                  <img
                    src={item.coverImage}
                    alt={item.title}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                </div>
                <div className="space-y-1.5 p-3">
                  <p className="line-clamp-1 text-sm font-semibold text-foreground group-hover:text-primary">
                    {item.title}
                  </p>
                  <p className="line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
                    <span className="font-semibold text-foreground/70">{txa('Neden eklendi?')}</span> {reason}
                  </p>
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    {typeof item.rating === 'number' && (
                      <span className="flex items-center gap-0.5">
                        <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                        {item.rating.toFixed(1)}
                      </span>
                    )}
                    {item.lastChapter && <span>{item.lastChapter}{' '}{txa('bl.')}</span>}
                  </div>
                  {/* Genre badge'leri */}
                  {item.genres && item.genres.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {item.genres.slice(0, 3).map((g) => (
                        <span
                          key={g}
                          className="rounded bg-muted/30 px-1.5 py-0.5 text-[9px] text-muted-foreground"
                        >
                          {g}
                        </span>
                      ))}
                      {item.genres.length > 3 && (
                        <span
                          title={item.genres.slice(3).join(', ')}
                          className="rounded bg-muted/30 px-1.5 py-0.5 text-[9px] text-muted-foreground"
                        >
                          +{item.genres.length - 3}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
