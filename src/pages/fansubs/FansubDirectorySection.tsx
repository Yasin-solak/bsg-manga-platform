import { Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { FansubDirectoryCard } from './FansubDirectoryCard'
import { type FansubShowcaseEntry } from './fansubsPageShared'
import type { Manga } from '@/types'
import { intlLocale, txa } from '@/i18n/activeLocale'

interface FansubDirectorySectionProps {
  fansubs: FansubShowcaseEntry[]
  loading: boolean
  loadError: string | null
  onResetFilters: () => void
  searchQuery: string
  hasMore: boolean
  onLoadMore: () => void
  currentUserId: string | null
  followStateByFansubId: Record<string, boolean>
  followActionByFansubId: Record<string, boolean>
  mangaPreviewByFansubId: Record<string, Manga[]>
  mangaPreviewLoadingByFansubId: Record<string, boolean>
  onToggleFollow: (fansubId: string) => void
  onEnsureMangaPreview: (fansubId: string) => void
}

function DirectoryLoadingCard() {
  return (
    <div className="h-[300px] animate-pulse overflow-hidden rounded-lg border border-border/80 bg-card/60 dark:border-white/10">
      <div className="h-[92px] bg-muted/30" />
      <div className="p-3">
        <div className="-mt-11 h-[72px] w-[72px] rounded-full bg-muted/45" />
        <div className="mt-3 h-4 w-36 rounded bg-muted/35" />
        <div className="mt-3 h-3 w-full rounded bg-muted/30" />
        <div className="mt-2 h-3 w-[82%] rounded bg-muted/25" />
        <div className="mt-4 grid grid-cols-3 gap-2">
          <div className="h-4 rounded bg-muted/20" />
          <div className="h-4 rounded bg-muted/20" />
          <div className="h-4 rounded bg-muted/20" />
        </div>
      </div>
    </div>
  )
}

export function FansubDirectorySection({
  fansubs,
  loading,
  loadError,
  onResetFilters,
  searchQuery,
  hasMore,
  onLoadMore,
  currentUserId,
  followStateByFansubId,
  followActionByFansubId,
  mangaPreviewByFansubId,
  mangaPreviewLoadingByFansubId,
  onToggleFollow,
  onEnsureMangaPreview,
}: FansubDirectorySectionProps) {
  return (
    <section className="space-y-3">
      {searchQuery ? (
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <Badge variant="secondary" className="border-primary/20 bg-primary/10 text-primary">
            <Search className="mr-1 h-3.5 w-3.5" />
            {txa('Arama aktif')}
          </Badge>
          <span>{txa('{count} ekip görünüyor', { count: fansubs.length.toLocaleString(intlLocale()) })}</span>
        </div>
      ) : null}

      {loadError ? (
        <div className="rounded-[1.45rem] border border-border/90 bg-card/95 px-6 py-10 text-center shadow-[0_16px_36px_-30px_rgba(15,23,42,0.18)] dark:border-white/10 dark:bg-card/60 dark:shadow-none">
          <h3 className="text-lg font-semibold text-foreground">{txa('Fansub listesi yüklenemedi')}</h3>
          <p className="mt-2 text-sm text-muted-foreground">{loadError}</p>
        </div>
      ) : null}

      {!loading && !loadError && fansubs.length === 0 ? (
        <div className="rounded-[1.45rem] border border-border/90 bg-card/95 px-6 py-12 text-center shadow-[0_16px_36px_-30px_rgba(15,23,42,0.18)] dark:border-white/10 dark:bg-card/60 dark:shadow-none">
          <h3 className="text-lg font-semibold text-foreground">{txa('Bu filtrelerde fansub bulunamadı')}</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            {txa('Aramayı veya sıralamayı sıfırlayıp kataloğu tekrar genişletebilirsin.')}
          </p>
          <Button type="button" variant="outline" className="mt-5" onClick={onResetFilters}>
            {txa('Filtreleri temizle')}
          </Button>
        </div>
      ) : (
        <>
          <div className="relative isolate grid gap-3 overflow-visible md:grid-cols-2 2xl:grid-cols-4">
            {loading
              ? Array.from({ length: 8 }).map((_, index) => <DirectoryLoadingCard key={index} />)
              : fansubs.map((fansub) => (
                <FansubDirectoryCard
                  key={fansub.id}
                  fansub={fansub}
                  currentUserId={currentUserId}
                  isFollowing={Boolean(currentUserId && followStateByFansubId[fansub.id])}
                  isFollowLoading={Boolean(followActionByFansubId[fansub.id])}
                  onToggleFollow={onToggleFollow}
                  mangaPreview={mangaPreviewByFansubId[fansub.id]}
                  isMangaPreviewLoading={Boolean(mangaPreviewLoadingByFansubId[fansub.id])}
                  onEnsureMangaPreview={onEnsureMangaPreview}
                />
              ))}
          </div>

          {!loading && hasMore ? (
            <div className="flex justify-center pt-1">
              <Button
                type="button"
                variant="outline"
                className="rounded-none border-0 border-t border-border/80 bg-transparent px-8 text-muted-foreground shadow-none hover:bg-transparent hover:text-primary"
                onClick={onLoadMore}
              >
                {txa('Daha fazla yükle')}
              </Button>
            </div>
          ) : null}
        </>
      )}
    </section>
  )
}
