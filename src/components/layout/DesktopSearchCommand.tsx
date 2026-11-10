import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from '@/i18n/router'
import {
  ArrowRight,
  BookOpen,
  Loader2,
  PenLine,
  Search,
  UserRound,
  UsersRound,
} from 'lucide-react'
import { buildExplorePath } from '@/lib/routes'
import {
  CommandDialog,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command'
import {
  searchGlobalEntities,
  type GlobalSearchAuthorItem,
  type GlobalSearchFansubItem,
  type GlobalSearchMangaItem,
  type GlobalSearchResult,
  type GlobalSearchUserItem,
} from '@/services/globalSearchService'
import { txa } from '@/i18n/activeLocale'

const EMPTY_SEARCH_RESULT: GlobalSearchResult = {
  mangas: [],
  authors: [],
  fansubs: [],
  users: [],
}

export interface GlobalSearchCommandProps {
  /** 'sidebar': full-width row + Ctrl K; 'icon': icon button only (mobile strip). */
  variant?: 'sidebar' | 'icon'
  /** The Ctrl/Cmd+K shortcut should be on for one instance only (desktop sidebar). */
  enableHotkey?: boolean
}

export function GlobalSearchCommand({ variant = 'sidebar', enableHotkey = false }: GlobalSearchCommandProps) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchResult, setSearchResult] = useState<GlobalSearchResult>(EMPTY_SEARCH_RESULT)

  const trimmedQuery = query.trim()
  const canSearch = trimmedQuery.length >= 2
  const hasSearchResults = useMemo(
    () => searchResult.mangas.length > 0
      || searchResult.authors.length > 0
      || searchResult.fansubs.length > 0
      || searchResult.users.length > 0,
    [searchResult],
  )

  const closeSearch = useCallback(() => {
    setSearchOpen(false)
  }, [])

  const handleSearch = useCallback((nextQuery = query) => {
    const safeQuery = nextQuery.trim()
    if (!safeQuery) return
    navigate(buildExplorePath({ q: safeQuery }))
    setQuery('')
    closeSearch()
  }, [closeSearch, navigate, query])

  const navigateTo = useCallback((path: string) => {
    navigate(path)
    setQuery('')
    closeSearch()
  }, [closeSearch, navigate])

  useEffect(() => {
    if (!searchOpen || !canSearch) {
      setSearchResult(EMPTY_SEARCH_RESULT)
      setSearchLoading(false)
      return
    }

    let cancelled = false
    const timeoutId = window.setTimeout(() => {
      setSearchLoading(true)
      void searchGlobalEntities(trimmedQuery, 5)
        .then((result) => {
          if (!cancelled) setSearchResult(result)
        })
        .finally(() => {
          if (!cancelled) setSearchLoading(false)
        })
    }, 180)

    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [canSearch, searchOpen, trimmedQuery])

  useEffect(() => {
    if (!enableHotkey) return undefined

    const handleGlobalKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setSearchOpen(true)
      }
    }

    document.addEventListener('keydown', handleGlobalKey)
    return () => document.removeEventListener('keydown', handleGlobalKey)
  }, [enableHotkey])

  return (
    <>
      {variant === 'icon' ? (
        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label={txa('Arama komut paletini aç')}
          onClick={() => setSearchOpen(true)}
        >
          <Search className="h-5 w-5" />
        </button>
      ) : (
        <button
          type="button"
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-sidebar-foreground/70 outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-primary/30"
          aria-label={txa('Arama komut paletini aç')}
          onClick={() => setSearchOpen(true)}
        >
          <Search className="h-5 w-5 shrink-0" />
          <span className="min-w-0 flex-1 truncate">{txa('Ara')}</span>
          <kbd className="shrink-0 rounded-md border border-sidebar-border bg-sidebar-accent px-1.5 py-0.5 text-[10px] font-semibold text-sidebar-foreground/60">
            Ctrl K
          </kbd>
        </button>
      )}

      <CommandDialog
        open={searchOpen}
        onOpenChange={setSearchOpen}
        title={txa('Site araması')}
        description={txa('Manga, yazar, fansub ve kullanıcıları ara.')}
        className="top-[18%] max-w-[680px] translate-y-0 rounded-2xl border-border bg-popover shadow-2xl"
      >
        <CommandInput
          value={query}
          onValueChange={setQuery}
          placeholder={txa('Manga, yazar, fansub veya kullanıcı ara...')}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && canSearch && !hasSearchResults && !searchLoading) {
              event.preventDefault()
              handleSearch(trimmedQuery)
            }
          }}
        />

        <CommandList className="max-h-[62vh] p-2">
          {!canSearch ? (
            <div className="px-3 py-6 text-sm text-muted-foreground">
              {txa('Aramaya başlamak için en az 2 karakter yaz.')}
            </div>
          ) : searchLoading ? (
            <div className="flex items-center gap-2 px-3 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {txa('Aranıyor...')}
            </div>
          ) : hasSearchResults ? (
            <>
              <MangaResults items={searchResult.mangas} onNavigate={navigateTo} />
              <AuthorResults items={searchResult.authors} onNavigate={navigateTo} />
              <FansubResults items={searchResult.fansubs} onNavigate={navigateTo} />
              <UserResults items={searchResult.users} onNavigate={navigateTo} />
              <CommandSeparator className="my-1" />
              <CommandItem
                value={`tum-sonuclar ${trimmedQuery}`}
                className="rounded-lg px-3 py-3 text-primary"
                onSelect={() => handleSearch(trimmedQuery)}
              >
                <Search className="h-4 w-4" />
                <span className="font-semibold">{txa('Keşfet\'te tüm sonuçları gör')}</span>
                <CommandShortcut>
                  <ArrowRight className="h-3.5 w-3.5" />
                </CommandShortcut>
              </CommandItem>
            </>
          ) : (
            <div className="px-3 py-6">
              <p className="text-sm font-semibold text-foreground">{txa('Sonuç bulunamadı.')}</p>
              <button
                type="button"
                className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:text-primary/80"
                onClick={() => handleSearch(trimmedQuery)}
              >
                {txa('Keşfet sayfasında ara')}
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </CommandList>

        <div className="flex items-center justify-between border-t border-border/60 px-3 py-2 text-[11px] font-medium text-muted-foreground">
          <span>{txa('Ok tuşları ile gez, Enter ile aç.')}</span>
          <span>{txa('Esc ile kapat')}</span>
        </div>
      </CommandDialog>
    </>
  )
}

function ResultSection({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <CommandGroup>
      <div className="flex items-center gap-2 px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
        {icon}
        {title}
      </div>
      {children}
    </CommandGroup>
  )
}

function MangaResults({ items, onNavigate }: { items: GlobalSearchMangaItem[]; onNavigate: (path: string) => void }) {
  if (items.length === 0) return null
  return (
    <ResultSection title={txa('Mangalar')} icon={<BookOpen className="h-3.5 w-3.5" />}>
      {items.map((item) => (
        <CommandItem
          key={item.id}
          value={`manga ${item.title} ${item.id}`}
          className="rounded-lg px-2 py-2"
          onSelect={() => onNavigate(item.href)}
        >
          <img src={item.coverImage} alt="" className="h-12 w-9 shrink-0 rounded-md object-cover" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-foreground">{item.title}</span>
            <span className="text-[11px] text-muted-foreground">{typeof item.rating === 'number' ? txa('{rating} puan', { rating: item.rating.toFixed(1) }) : txa('Puan yok')}</span>
          </span>
        </CommandItem>
      ))}
    </ResultSection>
  )
}

function AuthorResults({ items, onNavigate }: { items: GlobalSearchAuthorItem[]; onNavigate: (path: string) => void }) {
  if (items.length === 0) return null
  return (
    <ResultSection title={txa('Yazarlar')} icon={<PenLine className="h-3.5 w-3.5" />}>
      {items.map((item) => (
        <CommandItem
          key={item.name}
          value={`yazar ${item.name}`}
          className="rounded-lg px-2 py-2"
          onSelect={() => onNavigate(item.href)}
        >
          <span className="truncate text-sm font-semibold text-foreground">{item.name}</span>
          <CommandShortcut>{txa('{v1} seri', { v1: item.mangaCount })}</CommandShortcut>
        </CommandItem>
      ))}
    </ResultSection>
  )
}

function FansubResults({ items, onNavigate }: { items: GlobalSearchFansubItem[]; onNavigate: (path: string) => void }) {
  if (items.length === 0) return null
  return (
    <ResultSection title={txa('Fansublar')} icon={<UsersRound className="h-3.5 w-3.5" />}>
      {items.map((item) => (
        <CommandItem
          key={item.id}
          value={`fansub ${item.name} ${item.id}`}
          className="rounded-lg px-2 py-2"
          onSelect={() => onNavigate(item.href)}
        >
          <img src={item.avatar || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(item.name)}`} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-foreground">{item.name}</span>
            <span className="text-[11px] text-muted-foreground">{typeof item.followerCount === 'number' ? txa('{count} takipçi', { count: item.followerCount }) : txa('Fansub')}</span>
          </span>
        </CommandItem>
      ))}
    </ResultSection>
  )
}

function UserResults({ items, onNavigate }: { items: GlobalSearchUserItem[]; onNavigate: (path: string) => void }) {
  if (items.length === 0) return null
  return (
    <ResultSection title={txa('Kullanıcılar')} icon={<UserRound className="h-3.5 w-3.5" />}>
      {items.map((item) => (
        <CommandItem
          key={item.id}
          value={`kullanici ${item.displayName} ${item.username} ${item.id}`}
          className="rounded-lg px-2 py-2"
          onSelect={() => onNavigate(item.href)}
        >
          <img src={item.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(item.username)}`} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-foreground">{item.displayName}</span>
            <span className="block truncate text-[11px] text-muted-foreground">@{item.username}</span>
          </span>
        </CommandItem>
      ))}
    </ResultSection>
  )
}

export default GlobalSearchCommand
