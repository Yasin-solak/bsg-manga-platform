import { useRef, useState } from 'react'
import { useNavigate } from '@/i18n/router'
import { ArrowLeft, ArrowUpLeft, MagnifyingGlass, X, CaretRight } from '@phosphor-icons/react'
import { Command as CommandPrimitive } from 'cmdk'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Command, CommandGroup, CommandItem, CommandList } from '@/components/ui/command'
import { clearRecentSearches, forgetRecentSearch, readRecentSearches, rememberRecentSearch } from '@/lib/recentSearches'
import { buildExplorePath, buildPublicMangaPath } from '@/lib/routes'
import { useSearchSuggestions } from './useSearchSuggestions'
import { txa } from '@/i18n/activeLocale'

export function SearchDialog({ initialQuery = '', onClose, onSearch }: {
  initialQuery?: string; onClose: () => void; onSearch?: (query: string) => void
}) {
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  function editQuery(value: string) { setQuery(value); inputRef.current?.focus() }
  const [query, setQuery] = useState(initialQuery.slice(0, 80))
  const [recent, setRecent] = useState(readRecentSearches)
  const [retry, setRetry] = useState(0)
  const result = useSearchSuggestions(query, retry)
  const clean = query.trim()
  const entities = result.entities
  const hasResults = result.mangas.length > 0 || Boolean(entities && (entities.authors.length || entities.fansubs.length || entities.users.length))
  function visit(path: string) { if (clean) rememberRecentSearch(clean); onClose(); navigate(path) }
  function search() {
    if (clean.length < 2) return
    rememberRecentSearch(clean)
    onClose()
    if (onSearch) onSearch(clean)
    else navigate(buildExplorePath({ q: clean }))
  }
  return <Dialog open onOpenChange={open => { if (!open) onClose() }}>
    <DialogContent showCloseButton={false} className="left-0 top-0 flex h-[100dvh] max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-0 p-0 sm:left-1/2 sm:top-[12%] sm:h-[min(720px,80dvh)] sm:max-w-[680px] sm:-translate-x-1/2 sm:rounded-[22px] sm:border" data-testid="search-dialog">
      <DialogTitle className="sr-only">{txa('Site araması')}</DialogTitle>
      <DialogDescription className="sr-only">{txa('Seri, tür, yazar, fansub veya kullanıcı ara. Son aramalar bu cihazda tutulur.')}</DialogDescription>
      <Command shouldFilter={false} className="rounded-none bg-background sm:rounded-[22px]">
        <div className="flex shrink-0 items-center gap-2 px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))]">
          <button type="button" onClick={onClose} aria-label={txa('Aramadan geri dön')} className="-ml-2 flex size-11 shrink-0 items-center justify-center rounded-xl hover:bg-accent"><ArrowLeft size={23} weight="bold" /></button>
          <div className="flex h-12 min-w-0 flex-1 items-center gap-2 rounded-[14px] border border-primary/40 bg-card px-3 focus-within:border-primary">
            <MagnifyingGlass size={19} weight="bold" className="shrink-0 text-primary" />
            <CommandPrimitive.Input ref={inputRef} autoFocus value={query} onValueChange={setQuery} maxLength={80} aria-label={txa('Seri, çevirmen veya tür ara')} placeholder={txa('Seri, çevirmen ya da tür')} className="h-11 min-w-0 flex-1 bg-transparent text-[14.5px] font-semibold outline-none" />
            {query && <button type="button" aria-label={txa('Aramayı temizle')} onClick={() => editQuery('')} className="-mr-2 flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground"><X size={16} weight="bold" /></button>}
          </div>
        </div>
        <CommandList className="max-h-none flex-1 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]" aria-busy={result.loading}>
          {!clean && <>
            <div className="mb-2 flex items-center justify-between"><h2 className="text-[13px] font-extrabold uppercase tracking-[.045em]">{txa('Son aramalar')}</h2>{recent.length > 0 && <button className="min-h-11 text-xs font-bold text-muted-foreground" onClick={() => setRecent(clearRecentSearches())}>{txa('Temizle')}</button>}</div>
            {recent.length ? <div className="flex flex-wrap gap-2">{recent.map(item => <div key={item} className="flex max-w-full items-center rounded-xl border border-border bg-card">
              <button className="min-h-11 min-w-0 truncate pl-3 text-[12.5px] font-bold" onClick={() => editQuery(item)}>{item}</button>
              <button aria-label={txa('{query} aramasını geçmişten kaldır', { query: item })} className="flex size-11 shrink-0 items-center justify-center text-muted-foreground" onClick={() => setRecent(forgetRecentSearch(item))}><X size={12} weight="bold" /></button>
            </div>)}</div> : <p className="text-[12.5px] text-muted-foreground">{txa('Son aramaların bu cihazda görünecek.')}</p>}
            <h2 className="mb-2 mt-[26px] text-[13px] font-extrabold uppercase tracking-[.045em]">{txa('Çok okunan seriler')}</h2>
          </>}
          <div role="status" aria-live="polite" className="text-sm text-muted-foreground">
            {clean.length === 1 ? <p className="py-6">{txa('Aramak için en az 2 karakter yaz.')}</p> : result.loading ? <p className="py-6">{clean ? txa('Aranıyor…') : txa('Seriler yükleniyor…')}</p> : null}
          </div>
          {result.error ? <div role="alert" className="py-8 text-center"><p className="font-bold">{txa('Arama yüklenemedi')}</p><p className="mt-2 text-sm text-muted-foreground">{txa('Bağlantını kontrol edip tekrar dene.')}</p><button className="mt-3 min-h-11 font-bold text-primary" onClick={() => setRetry(r => r + 1)}>{txa('Tekrar dene')}</button></div> : !result.loading && <>
            {result.partial && <p role="status" className="mb-3 text-xs text-muted-foreground">{txa('Bazı arama kategorileri yüklenemedi.')} <button className="min-h-11 font-bold text-primary" onClick={() => setRetry(r => r + 1)}>{txa('Tekrar dene')}</button></p>}
            {result.mangas.length > 0 && <CommandGroup className="p-0" heading={clean ? txa('SERİ ÖNERİLERİ') : undefined}>{result.mangas.map((manga, index) => <CommandItem key={manga.id} value={`manga-${manga.id}`} onSelect={() => clean ? visit(buildPublicMangaPath(manga)) : editQuery(manga.title)} className="min-h-11 gap-3 rounded-xl px-0 py-[9px] font-semibold">
              {clean ? <img src={manga.coverImage} alt="" className="h-[60px] w-11 shrink-0 rounded-[9px] border border-border object-cover" /> : <span className="w-5 shrink-0 text-center text-[13px] font-black text-primary">{index + 1}</span>}
              <span className="min-w-0 flex-1"><span className="block truncate text-[13.5px] font-extrabold">{manga.title}</span>{clean && <span className="mt-1 block text-[11.5px] text-muted-foreground">{manga.genres?.slice(0, 2).join(' · ') || txa('Seri')}{typeof manga.rating === 'number' ? txa(' · {v1} puan', { v1: manga.rating.toFixed(1) }) : ''}</span>}</span>
              <ArrowUpLeft size={16} className="shrink-0 text-muted-foreground" />
            </CommandItem>)}</CommandGroup>}
            {clean.length >= 2 && entities && <>
              {entities.fansubs.length > 0 && <CommandGroup heading={txa('ÇEVİRMENLER / FANSUBLAR')}>{entities.fansubs.map(item => <CommandItem key={item.id} value={`fansub-${item.id}`} onSelect={() => visit(item.href)} className="min-h-12 rounded-xl font-semibold"><span className="min-w-0 flex-1 truncate">{item.name}</span><CaretRight size={16} /></CommandItem>)}</CommandGroup>}
              {entities.authors.length > 0 && <CommandGroup heading={txa('YAZARLAR')}>{entities.authors.map(item => <CommandItem key={item.name} value={`author-${item.name}`} onSelect={() => visit(item.href)} className="min-h-12 rounded-xl font-semibold">{item.name}</CommandItem>)}</CommandGroup>}
              {entities.users.length > 0 && <CommandGroup heading={txa('KULLANICILAR')}>{entities.users.map(item => <CommandItem key={item.id} value={`user-${item.id}`} onSelect={() => visit(item.href)} className="min-h-12 rounded-xl"><span className="min-w-0"><span className="block truncate font-semibold">{item.displayName}</span><span className="text-xs text-muted-foreground">@{item.username}</span></span></CommandItem>)}</CommandGroup>}
            </>}
            {clean.length >= 2 && !hasResults && <div className="flex flex-col items-center px-6 py-12 text-center"><MagnifyingGlass size={34} className="text-muted-foreground" /><h2 className="mt-3 text-[15px] font-extrabold">{txa('Sonuç yok')}</h2><p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{txa('Yazımı kontrol et ya da tür adıyla ara.')}</p><button className="mt-4 min-h-11 rounded-[13px] border border-primary/30 bg-primary/10 px-5 text-[13px] font-extrabold text-primary" onClick={() => editQuery('')}>{txa('Aramayı temizle')}</button></div>}
          </>}
          {clean.length >= 2 && (result.loading || result.error || result.count > 0) && <CommandItem value="all-results" onSelect={search} className="mt-3 min-h-12 justify-center rounded-[14px] border border-primary/40 bg-primary/10 text-center text-[13.5px] font-extrabold text-primary">{txa('“{v1}” için tüm seri sonuçları', { v1: clean })}{!result.loading && !result.error ? ` (${result.count})` : ''}</CommandItem>}
        </CommandList>
        <div className="hidden shrink-0 border-t border-border px-5 py-3 text-xs text-muted-foreground sm:block">{txa('↑ ↓ Seç · Enter Aç · Esc Kapat')}</div>
      </Command>
    </DialogContent>
  </Dialog>
}
