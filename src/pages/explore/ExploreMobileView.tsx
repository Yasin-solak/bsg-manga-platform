import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, BookOpen, CaretRight, CheckCircle, Clock, Fire, Ghost, Heart, MaskHappy, Rocket, Sparkle, Sword, SlidersHorizontal, Star, X } from '@phosphor-icons/react'
import { listMangas } from '@/services/mangaService'
import type { Manga } from '@/types'
import { cn } from '@/lib/utils'
import { MagnifyingGlass } from '@phosphor-icons/react'
import { SearchDialog } from '@/components/search/SearchDialog'
import { SearchResultCard } from '@/components/search/SearchResultCard'
import { ExploreTopWeekly } from './ExploreTopWeekly'
import { ExploreMobileCard } from './ExploreMobileCard'
import { ExploreMobileFilters } from './ExploreMobileFilters'
import { ExploreMobileMoods } from './ExploreMobileMoods'
import { ExploreFirstChapter, ExploreMobileLists } from './ExploreMobileCollections'
import { ExploreSaveProvider } from './ExploreSaveProvider'
import { STATUS_OPTIONS, prettifyGenreName } from './explorePageShared'
import { nextMobileCatalogSelection } from './mobileExploreState'
import type { ExploreData } from './useExploreData'
import './exploreMobile.css'
import { intlLocale, txa } from '@/i18n/activeLocale'

const GENRE_ICONS: Record<string, typeof BookOpen> = { action: Sword, romance: Heart, fantasy: Sparkle, horror: Ghost, comedy: MaskHappy, 'sci-fi': Rocket }

const SORTS = [
  { id: 'popular', get label() { return txa('En çok okunan') }, icon: Fire },
  { id: 'latest', get label() { return txa('Son güncellenen') }, icon: Clock },
  { id: 'completed', get label() { return txa('Tamamlanan') }, icon: CheckCircle },
  { id: 'rating', get label() { return txa('En yüksek puan') }, icon: Star },
  { id: 'title', get label() { return txa('İsme göre') }, icon: BookOpen },
] as const

export function ExploreMobileView({ data: d }: { data: ExploreData }) {
  const [searchOpen, setSearchOpen] = useState(false)
  const searchRef = useRef<HTMLButtonElement>(null)
  const [expanded, setExpanded] = useState(false)
  const [allGenres, setAllGenres] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  const [popular, setPopular] = useState<Manga[]>([])
  const [popularLoading, setPopularLoading] = useState(true)
  const [popularError, setPopularError] = useState(false)
  const [retry, setRetry] = useState(0)
  const catalogRef = useRef<HTMLElement>(null)
  const filterRef = useRef<HTMLButtonElement>(null)
  const searching = d.isSearching || d.searchQuery.trim().length > 0
  const filtered = d.selectedGenres.length > 0 || d.selectedStatus !== 'all'
  const showingResults = searching || filtered || expanded
  const visibleMangas = showingResults ? d.mangas : d.mangas.slice(0, 6)
  const recommendationGenres = [...new Set(d.recommended.flatMap(r => r.matchedGenres))].slice(0, 2)
  const genres = d.mergedGenres.filter(g => (g.count || 0) > 0)
  useEffect(() => {
    let cancelled = false
    setPopularLoading(true); setPopularError(false)
    // Editor's picks are not a ranking; a separate limited query by total reads.
    void listMangas({ sort: 'popular', limit: 5 }).then(result => { if (!cancelled) setPopular(result.data) })
      .catch(() => { if (!cancelled) setPopularError(true) })
      .finally(() => { if (!cancelled) setPopularLoading(false) })
    return () => { cancelled = true }
  }, [retry])
  function openCatalog() { setExpanded(true); catalogRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }
  function reset() { setExpanded(false); d.clearAllFilters(); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  function closeFilter() { setFilterOpen(false); filterRef.current?.focus() }
  function sort(id: typeof SORTS[number]['id']) {
    const next = nextMobileCatalogSelection(id, d.selectedSort, d.selectedStatus)
    d.setSelectedSort(next.sort); d.setSelectedStatus(next.status)
  }
  return <ExploreSaveProvider ids={[...d.mangas, ...d.recommended.map(r => r.manga)].map(m => m.id)}>
    <div className="explore-mobile min-h-screen bg-background pb-8" data-testid="explore-mobile">
      <header className="border-b border-border bg-background px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))]">
        {searching && <h1 className="sr-only">{txa('Arama sonuçları')}</h1>}
        {!searching && <div className={cn('mb-2 flex items-center gap-2', showingResults ? 'h-11' : 'h-[34px]')}>
          {showingResults && <button onClick={reset} aria-label={txa('Keşfet vitrinine dön')} className="-ml-2 flex size-11 items-center justify-center"><ArrowLeft size={22} weight="bold" /></button>}
          <h1 className="m-0 flex-1 text-[26px] font-black tracking-[-.02em]">{showingResults ? txa('Sonuçlar') : txa('Keşfet')}</h1>
          <span className="text-[11.5px] font-extrabold text-muted-foreground" aria-live="polite">{d.loading ? txa('Aranıyor…') : txa('{count} seri', { count: d.totalMangas.toLocaleString(intlLocale()) })}</span>
        </div>}
        <div className="flex items-start gap-2.5">
          {searching && <button onClick={reset} aria-label={txa('Keşfet vitrinine dön')} className="-ml-2 flex size-12 shrink-0 items-center justify-center"><ArrowLeft size={22} weight="bold" /></button>}
          <button ref={searchRef} onClick={() => setSearchOpen(true)} aria-label={txa('Katalogda ara')} aria-haspopup="dialog" aria-expanded={searchOpen} className="flex h-12 min-w-0 flex-1 items-center gap-2.5 rounded-[14px] border border-border bg-card px-3.5 text-left text-[14.5px] font-semibold text-muted-foreground"><MagnifyingGlass size={19} className="shrink-0" /><span className="truncate">{d.searchQuery || txa('Seri, çevirmen veya tür ara...')}</span></button>
          <button ref={filterRef} aria-label={txa('Filtrele')} aria-haspopup="dialog" aria-expanded={filterOpen} onClick={() => setFilterOpen(true)}
            className="relative flex size-12 shrink-0 items-center justify-center rounded-[14px] border border-border bg-card">
            <SlidersHorizontal size={19} weight="bold" />
            {filtered && <span className="absolute -right-1 -top-1 flex size-[18px] items-center justify-center rounded-full bg-primary text-[10px] font-black text-primary-foreground">{d.selectedGenres.length + (d.selectedStatus !== 'all' ? 1 : 0)}</span>}
          </button>
        </div>
      </header>
      <div className="flex min-w-0 flex-col gap-[26px] px-4 pt-4">
        {!showingResults && <>
          {d.recommendedLoading ? <section aria-label={txa('Öneriler yükleniyor')} className="h-[284px] animate-pulse rounded-2xl bg-muted" /> : d.recommended.length > 0 && <section>
            <div className="flex items-start justify-between gap-2"><div className="min-w-0"><h2 className="explore-mobile-heading">{recommendationGenres.length ? txa('Sana özel') : txa('Okurların favorileri')}</h2><p className="explore-mobile-note">{recommendationGenres.length ? txa('{genres} ilgi alanlarından', { genres: recommendationGenres.map((genre) => txa(genre)).join(' · ') }) : txa('Şu an çok okunanlardan')}</p></div><button className="explore-mobile-more" onClick={openCatalog}>{txa('Tümü')}<CaretRight size={15} /></button></div>
            <div className="explore-mobile-rail gap-3">
              {d.recommended.slice(0, 6).map(({ manga, matchedGenres }) => <ExploreMobileCard key={manga.id} manga={manga} rail reason={matchedGenres.length ? txa('{genre} sevenlere', { genre: txa(matchedGenres[0]) }) : undefined} />)}
              <button onClick={openCatalog} className="flex h-[182px] w-24 shrink-0 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border text-xs font-extrabold text-primary"><ArrowRight size={20} />{txa('Tümünü gör')}</button>
            </div>
          </section>}
          <ExploreMobileMoods resolveGenreQueryValues={d.resolveGenreQueryValues} />
        </>}
        <section ref={catalogRef} className="scroll-mt-4" aria-label={txa('Katalog')}>
          {!searching && <div className="flex items-start justify-between gap-2"><div>
            <h2 className="explore-mobile-heading">{searching ? txa('Arama sonuçları') : txa('Katalog')}</h2>
          <p className="explore-mobile-note">{searching ? txa('“{query}” için eşleşmeler', { query: d.searchQuery.trim() }) : d.selectedStatus === 'completed' ? txa('Baştan sona okunabilir seriler') : d.selectedSort === 'latest' ? txa('En son bölüm gelen seriler') : d.selectedSort === 'rating' ? txa('Okur puanına göre sıralı') : d.selectedSort === 'title' ? txa('Alfabetik olarak sıralı') : txa('Toplam okunmaya göre sıralı')}</p>
          </div>{!showingResults && <button className="explore-mobile-more" onClick={openCatalog}>{txa('Tümü')}<CaretRight size={15} /></button>}</div>}
          {searching && <p role="status" className="mb-2 text-xs font-bold text-muted-foreground">{d.loading ? txa('Aranıyor…') : txa('{count} sonuç', { count: d.totalMangas.toLocaleString(intlLocale()) })}</p>}
          <div className="explore-mobile-rail mt-1 gap-2" aria-label={txa('Katalog sıralaması')}>
            {SORTS.map(({ id, label, icon: Icon }) => { const selected = id === 'completed' ? d.selectedStatus === 'completed' : d.selectedSort === id
              return <button key={id} aria-pressed={selected} onClick={() => sort(id)} className={cn('flex min-h-11 shrink-0 snap-start items-center gap-1.5 rounded-[14px] border px-3.5 text-[12px] font-extrabold', selected ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card')}><Icon size={15} weight="bold" />{txa(label)}</button>
            })}
          </div>
          {filtered && <div className="mt-3 flex flex-wrap gap-2" aria-label={txa('Etkin filtreler')}>
            {d.selectedGenres.map(id => <button key={id} onClick={() => d.toggleGenre(id)} aria-label={txa('{name} filtresini kaldır', { name: txa(d.genresById.get(id)?.name || prettifyGenreName(id)) })} className="flex min-h-11 items-center gap-1 rounded-xl border border-primary/40 px-3 text-xs font-bold text-primary">{txa(d.genresById.get(id)?.name || prettifyGenreName(id))}<X size={12} /></button>)}
            {d.selectedStatus !== 'all' && <button onClick={() => d.setSelectedStatus('all')} className="flex min-h-11 items-center gap-1 rounded-xl border border-primary/40 px-3 text-xs font-bold text-primary">{STATUS_OPTIONS.find(s => s.id === d.selectedStatus)?.name}<X size={12} /></button>}
          </div>}
          <div className="mt-4" aria-busy={d.loading}>
            {d.loadError ? <div role="alert" className="rounded-2xl border border-destructive/30 p-5 text-sm"><p>{txa('Seriler yüklenemedi.')}</p><button className="mt-2 min-h-11 font-bold text-primary" onClick={() => d.setQueryVersion(v => v + 1)}>{txa('Tekrar dene')}</button></div> : !d.loading && !visibleMangas.length ?
              <div className="flex min-h-[220px] flex-col items-center justify-center rounded-2xl border border-border p-6 text-center"><BookOpen size={32} className="mb-3 text-muted-foreground" /><h3 className="font-extrabold">{txa('Eşleşen seri bulunamadı')}</h3><p className="mt-2 text-sm text-muted-foreground">{txa('Başka bir arama dene veya filtrelerini değiştir.')}</p><button className="mt-3 min-h-11 font-bold text-primary" onClick={reset}>{txa('Filtreleri temizle')}</button></div> :
              <div className={searching ? "flex flex-col gap-2.5" : "grid grid-cols-2 gap-x-3 gap-y-5"}>
                {d.loading && !visibleMangas.length ? Array.from({ length: 6 }, (_, i) => <div key={i} className="aspect-[136/220] animate-pulse rounded-2xl bg-muted" />) : visibleMangas.map(m => searching ? <SearchResultCard key={m.id} manga={m} /> : <ExploreMobileCard key={m.id} manga={m} />)}
              </div>}
          </div>
          {d.loadMoreError && <p role="alert" className="mt-4 text-sm text-destructive">{txa('Daha fazla seri yüklenemedi. Aşağıdaki düğmeyle tekrar deneyebilirsin.')}</p>}
          {!d.loading && !d.loadError && (showingResults ? d.hasMoreMangas : d.totalMangas > 6) && <button disabled={d.isLoadingMore} className="mt-5 min-h-12 w-full rounded-[14px] border border-border text-sm font-bold disabled:opacity-50"
            onClick={() => { if (!showingResults) openCatalog(); else if (d.loadMoreError) d.setQueryVersion(v => v + 1); else d.setCurrentPage(p => p + 1) }}>{d.isLoadingMore ? txa('Yükleniyor…') : showingResults ? txa('Daha fazla yükle') : txa('Tüm {count} seriyi gör', { count: d.totalMangas.toLocaleString(intlLocale()) })}</button>}
        </section>
        {!showingResults && <>
          {popularError ? <p role="alert" className="text-sm">{txa('Popüler seriler yüklenemedi.')} <button className="min-h-11 font-bold text-primary" onClick={() => setRetry(v => v + 1)}>{txa('Tekrar dene')}</button></p> : <ExploreTopWeekly mangas={popular} loading={popularLoading} />}
          {genres.length > 0 && <section><div className="flex items-center justify-between"><h2 className="explore-mobile-heading">{txa('Türlere göre')}</h2>{genres.length > 6 && <button className="explore-mobile-more" onClick={() => setAllGenres(v => !v)}>{allGenres ? txa('Daha az') : txa('Tümü ({count})', { count: genres.length })}</button>}</div>
            <div className="mt-3 grid grid-cols-2 gap-[9px]">{(allGenres ? genres : genres.slice(0, 6)).map(g => <button key={g.id} className="flex min-h-16 items-center gap-2.5 rounded-[14px] border border-border bg-card px-3 py-2.5 text-left" onClick={() => { d.selectSingleGenre(g.id); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>
              {(() => { const Icon = GENRE_ICONS[g.id] || BookOpen; return <Icon size={22} weight="duotone" className="shrink-0 text-primary" /> })()}<span className="min-w-0"><span className="block truncate text-[12.5px] font-extrabold">{txa(g.name)}</span><span className="mt-[3px] block text-[10.5px] font-bold text-muted-foreground">{txa('{count} seri', { count: g.count?.toLocaleString(intlLocale()) ?? 0 })}</span></span>
            </button>)}</div></section>}
          <ExploreMobileLists />
          <ExploreFirstChapter mangas={popular} />
        </>}
      </div>
      {searchOpen && <SearchDialog initialQuery={d.searchQuery} onClose={() => { setSearchOpen(false); searchRef.current?.focus() }} onSearch={query => { d.clearAllFilters(); d.setSearchQuery(query); setExpanded(true); window.scrollTo({ top: 0 }) }} />}
      {filterOpen && <ExploreMobileFilters genres={d.mergedGenres} selectedGenres={d.selectedGenres} selectedStatus={d.selectedStatus} onClose={closeFilter} onApply={(genres, status) => {
        d.setSelectedGenres(genres); d.setSelectedStatus(status); setExpanded(true); closeFilter(); window.scrollTo({ top: 0, behavior: 'smooth' })
      }} />}
    </div>
  </ExploreSaveProvider>
}
