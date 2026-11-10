import { SlidersHorizontal, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ExploreEditorPicksSection, ExploreNewAdditionsSection, ExploreThematicCollections } from './ExploreCurationSections'
import { ExploreRightSidebar } from './ExploreRightSidebar'
import { ExploreResultsSection } from './ExploreResultsSection'
import { ExploreSearchBar } from './ExploreSearchBar'
import { ExploreFilterSheet } from './ExploreFilterSheet'
import { ExploreForYouRail } from './ExploreForYouRail'
import { ExploreMoodSection } from './ExploreMoodSection'
import { ExploreTopWeekly } from './ExploreTopWeekly'
import { ExploreGenreGrid } from './ExploreGenreGrid'
import { SORT_OPTIONS, STATUS_OPTIONS, prettifyGenreName } from './explorePageShared'
import type { ExploreData } from './useExploreData'
import { intlLocale, txa } from '@/i18n/activeLocale'

export function ExploreDesktopView({ mangas, totalMangas, editorMangas, editorLoading, latestMangas, latestLoading, exploreCollections, loading, isLoadingMore, loadError, loadMoreError, searchQuery, setSearchQuery, selectedGenres, selectedStatus, setSelectedStatus, selectedSort, setSelectedSort, filterSheetOpen, setFilterSheetOpen, recommended, recommendedLoading, genreCounts, genresById, mergedGenres, activeFilterCount, hasMoreMangas, genreRailItems, toggleGenre, clearAllFilters, selectSingleGenre, isSearching, resolveGenreQueryValues, setCurrentPage }: ExploreData) {
  /*
   * CATALOG section (prototype): title + sort tabs. Status and genre
   * filters are now in the Filter bottom sheet; only SORTING is here,
   * since this row works like tabs in the prototype too.
   *
   * Labels are our REAL sorts. The prototype says "Rising" and
   * "Fastest risers in the last 7 days"; we have NO such momentum measure,
   * and we do not name a metric as if it existed.
   */
  const catalogTabs = (
    <div className="flex flex-col gap-3" data-testid="explore-catalog-tabs">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="m-0 text-[13px] font-black uppercase tracking-[0.045em]">{txa('Katalog')}</h2>
        <span className="shrink-0 text-[11.5px] font-bold text-muted-foreground">
          {txa('{count} seri', { count: totalMangas.toLocaleString(intlLocale()) })}
        </span>
      </div>

      <div className="hide-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        {SORT_OPTIONS.map((sort) => {
          const Icon = sort.icon
          const selected = selectedSort === sort.id
          return (
            <button
              key={sort.id}
              type="button"
              aria-pressed={selected}
              data-testid={`explore-sort-${sort.id}`}
              onClick={() => setSelectedSort(sort.id)}
              className={cn(
                'inline-flex h-10 shrink-0 items-center gap-1.5 rounded-[12px] border px-3.5 text-[13px] font-bold transition-colors',
                selected
                  ? 'border-primary bg-primary/15 text-primary'
                  : 'border-border text-foreground/85 hover:bg-accent',
              )}
            >
              <Icon className="size-4" />
              {txa(sort.name)}
            </button>
          )
        })}
      </div>

      {selectedGenres.length > 0 || selectedStatus !== 'all' ? (
        <div className="flex flex-wrap items-center gap-1.5" data-testid="explore-active-filters">
          {selectedStatus !== 'all' ? (
            <button
              type="button"
              onClick={() => setSelectedStatus('all')}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-bold"
            >
              {txa(STATUS_OPTIONS.find((option) => option.id === selectedStatus)?.name ?? '')}
              <X className="size-3" />
            </button>
          ) : null}
          {selectedGenres.map((genreId) => (
            <button
              key={genreId}
              type="button"
              onClick={() => toggleGenre(genreId)}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-bold"
            >
              {txa(genresById.get(genreId)?.name || prettifyGenreName(genreId))}
              <X className="size-3" />
            </button>
          ))}
          <button
            type="button"
            onClick={clearAllFilters}
            className="px-1.5 text-[11px] font-bold text-primary"
          >
            {txa('Temizle')}
          </button>
        </div>
      ) : null}
    </div>
  )

  return (
    <div className="min-h-screen bg-background">
      <div data-page-shell className="w-full max-w-[1640px] px-4 pb-14 pt-6 sm:px-6">
        <div data-page-grid className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <main data-page-main className="flex min-w-0 flex-col gap-6">
            {/*
              ARAMA VE FILTRE EN USTTE. Oncesinde siralama cipleri telefonda
              6,7 EKRAN asagidaydi (olculdu): once editoryal raflar, sonra
              katalog, filtre en dipte. "Kesfet" adli sayfada aradigin seyi
              daraltmak icin yedi ekran kaydirmak gerekiyordu.
            */}
            {/* Prototipteki baslik satiri: ekran adi + katalogun buyuklugu. */}
            <div className="flex items-baseline justify-between gap-3">
              <h1 className="m-0 text-[28px] font-black tracking-[-0.02em]">{txa('Keşfet')}</h1>
              <span className="shrink-0 text-[12.5px] font-bold text-muted-foreground" data-testid="explore-total">
                {txa('{count} seri', { count: totalMangas.toLocaleString(intlLocale()) })}
              </span>
            </div>

            <div
              data-testid="explore-search-header"
              className="sticky top-14 z-20 -mx-4 flex items-start gap-2.5 border-b border-border bg-background/95 px-4 pb-3 pt-2 backdrop-blur-lg sm:-mx-6 sm:px-6 lg:top-0"
            >
              <div className="min-w-0 flex-1">
                <ExploreSearchBar value={searchQuery} onChange={setSearchQuery} />
              </div>
              {/*
                Filtre, prototipte arama kutusunun SAGINDA ayri bir dugme ve
                alt sayfa aciyor. Oncesinde durum/siralama cipleri sayfaya
                yayilmisti ve telefonda 6,7 ekran asagidaydi.
              */}
              <button
                type="button"
                data-testid="explore-filter-trigger"
                aria-label={txa('Filtrele')}
                onClick={() => setFilterSheetOpen(true)}
                className="relative flex size-12 shrink-0 items-center justify-center rounded-[14px] border border-border bg-card text-foreground transition-colors hover:border-primary hover:text-primary"
              >
                <SlidersHorizontal className="size-[18px]" />
                {activeFilterCount > 0 ? (
                  <span className="absolute -right-1 -top-1 flex size-[18px] items-center justify-center rounded-full bg-primary text-[10px] font-black text-primary-foreground">
                    {activeFilterCount}
                  </span>
                ) : null}
              </button>
            </div>

            {isSearching ? null : (
              <>
                <ExploreForYouRail items={recommended} loading={recommendedLoading} />
                <ExploreMoodSection
                  status={selectedStatus}
                  resolveGenreQueryValues={resolveGenreQueryValues}
                />
              </>
            )}

            {catalogTabs}

            {/*
              Arama varken vitrin CEKILIR. Aranan sey belliyken editoryal
              raflari once basmak, kullaniciyi kendi sorusundan uzaklastirir.
              Filtre secmek vitrini kapatmaz: orada hala geziniyor olabilir.
            */}
            <ExploreResultsSection
              mangas={mangas}
              totalMangas={totalMangas}
              loading={loading}
              isLoadingMore={isLoadingMore}
              loadError={loadError}
              loadMoreError={loadMoreError}
              hasMoreMangas={hasMoreMangas}
              hasActiveFilters={activeFilterCount > 0}
              toolbar={undefined}
              onLoadMore={() => setCurrentPage((previous) => previous + 1)}
              onClearFilters={clearAllFilters}
            />

            {isSearching ? null : (
              <>
                <ExploreTopWeekly mangas={editorMangas} loading={editorLoading} />
                <ExploreGenreGrid
                  genres={mergedGenres}
                  selectedGenres={selectedGenres}
                  onSelectGenre={selectSingleGenre}
                />
              </>
            )}

            {/*
              Editoryal bloklar KATALOGUN ALTINDA. Prototipin Kesfet'inde bu
              iki blok yok; yerlerini "Listelerden secikler" ve "Turlere gore"
              aliyor (Faz 2). Silmek yerine asagi alindi: ikisi de admin
              tarafindan yonetilen gercek yuzeyler.
            */}
            {isSearching ? null : (
              <>
                <ExploreEditorPicksSection mangas={editorMangas} loading={editorLoading} />
                <ExploreNewAdditionsSection mangas={latestMangas} loading={latestLoading} />

                <ExploreThematicCollections
                  collections={exploreCollections}
                  genreCounts={genreCounts}
                  onSelectGenre={selectSingleGenre}
                />
              </>
            )}
          </main>

          <ExploreFilterSheet
            open={filterSheetOpen}
            onOpenChange={setFilterSheetOpen}
            genres={genreRailItems}
            selectedGenres={selectedGenres}
            selectedStatus={selectedStatus}
            onToggleGenre={toggleGenre}
            onStatusChange={setSelectedStatus}
            onReset={clearAllFilters}
            resultCount={totalMangas}
          />

          <div data-page-right-sidebar className="hidden xl:block">
            <div className="sticky top-4">
              <ExploreRightSidebar
                editorMangas={editorMangas}
                genreItems={mergedGenres}
                genreCounts={genreCounts}
                onSelectGenre={selectSingleGenre}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
