import { useMemo, useState } from 'react'
import { Link } from '@/i18n/router'
import { BookOpen, Clock, MagnifyingGlass } from '@phosphor-icons/react'
import { buildPublicMangaPath } from '@/lib/routes'
import { cn } from '@/lib/utils'
import { Panel, PanelEmpty } from '../../profile/ProfileTabKit'
import type { FansubMangaShelfItem } from '../types'
import { DAY_MS, relativeAgo, tabCover, toTime } from './fansubTabUtils'
import { intlLocale, txa } from '@/i18n/activeLocale'

/*
 * Manga tab (v2): poster grid. Search + sort (recently updated / most chapters /
 * A-Z). Status, chapter count and new chapter marker on the cover; admins see pending chapters.
 */

type SortKey = 'recent' | 'chapters' | 'title'

const SORTS: { key: SortKey, label: string }[] = [
  { key: 'recent', get label() { return txa('Son güncellenen') } },
  { key: 'chapters', get label() { return txa('En çok bölüm') } },
  { key: 'title', label: 'A-Z' },
]

const STATUS: Record<NonNullable<FansubMangaShelfItem['status']>, { label: string, className: string }> = {
  ongoing: { get label() { return txa('Devam ediyor') }, className: 'bg-emerald-500/85' },
  completed: { get label() { return txa('Tamamlandı') }, className: 'bg-sky-500/85' },
  hiatus: { get label() { return txa('Arada') }, className: 'bg-amber-500/85' },
}

export function FansubMangasTab({ mangas, canSeePending }: { mangas: FansubMangaShelfItem[], canSeePending: boolean }) {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortKey>('recent')
  const visible = useMemo(() => (canSeePending ? mangas : mangas.filter((manga) => !manga.isPendingOwned)), [canSeePending, mangas])
  const shown = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase(intlLocale())
    const filtered = needle ? visible.filter((manga) => manga.title.toLocaleLowerCase(intlLocale()).includes(needle)) : visible
    return [...filtered].sort((a, b) => {
      if (sort === 'title') return a.title.localeCompare(b.title, 'tr-TR')
      if (sort === 'chapters') return b.approvedChapterCount - a.approvedChapterCount
      return (toTime(b.latestReleaseAt) ?? 0) - (toTime(a.latestReleaseAt) ?? 0)
    })
  }, [query, sort, visible])
  const totalChapters = visible.reduce((sum, manga) => sum + manga.approvedChapterCount, 0)
  const now = Date.now()

  return (
    <Panel title={txa('Mangalar')} icon={BookOpen} tone='emerald' meta={visible.length ? txa('{v1} seri · {v2} bölüm', { v1: visible.length, v2: totalChapters.toLocaleString(intlLocale()) }) : undefined} testId='fansub-mangas-tab'>
      {visible.length ? (
        <div className='flex flex-col gap-4'>
          <div className='flex flex-col gap-2 sm:flex-row sm:items-center'>
            <label className='flex h-10 min-w-0 flex-1 items-center gap-2 rounded-xl border border-border/70 bg-background/40 px-3 focus-within:border-primary/50'>
              <MagnifyingGlass size={15} className='flex-none text-muted-foreground' />
              <input
                value={query}
                onChange={(event) => setQuery(event.currentTarget.value)}
                placeholder={txa('Seri ara')}
                className='min-w-0 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-muted-foreground'
                aria-label={txa('Seri ara')}
              />
            </label>
            <div className='flex gap-1.5 overflow-x-auto [scrollbar-width:none]' role='tablist' aria-label={txa('Sıralama')}>
              {SORTS.map((entry) => (
                <button
                  key={entry.key}
                  type='button'
                  onClick={() => setSort(entry.key)}
                  className={cn(
                    'flex-none rounded-full border px-3 py-1.5 text-[12px] font-bold transition-colors',
                    sort === entry.key ? 'border-foreground/20 bg-foreground text-background' : 'border-border/70 bg-transparent text-muted-foreground hover:text-foreground',
                  )}
                >
                  {entry.label}
                </button>
              ))}
            </div>
          </div>

          {shown.length ? (
            <div className='grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5'>
              {shown.map((manga) => {
                const latest = toTime(manga.latestReleaseAt)
                const isFresh = latest !== null && now - latest < 3 * DAY_MS
                const status = manga.status ? STATUS[manga.status] : null
                return (
                  <Link key={manga.id} to={buildPublicMangaPath({ id: manga.id, slug: manga.slug, title: manga.title })} className='group flex min-w-0 flex-col gap-2 text-inherit' data-testid='fansub-manga-card'>
                    <span className='relative block aspect-[3/4] overflow-hidden rounded-2xl border border-border/60 bg-muted shadow-[0_14px_30px_-18px_rgb(0_0_0/0.8)]'>
                      <img src={tabCover(manga.coverImage, manga.title)} alt='' loading='lazy' className='size-full object-cover transition-transform duration-500 group-hover:scale-[1.06]' />
                      <span className='absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/85 to-transparent' />
                      {status && <span className={cn('absolute left-2 top-2 rounded-md px-1.5 py-0.5 text-[10px] font-extrabold text-white', status.className)}>{status.label}</span>}
                      {isFresh && <span className='absolute right-2 top-2 rounded-full bg-primary px-1.5 py-0.5 text-[9.5px] font-black text-primary-foreground'>{txa('YENİ')}</span>}
                      {manga.isPendingOwned && <span className='absolute right-2 top-2 rounded-md bg-amber-500 px-1.5 py-0.5 text-[10px] font-extrabold text-black'>{txa('Onay bekliyor')}</span>}
                      <span className='absolute inset-x-2.5 bottom-2 flex items-center justify-between gap-2 text-[11.5px] font-bold text-white'>
                        <span className='tabular-nums'>{txa('{count} bölüm', { count: manga.approvedChapterCount })}</span>
                        {canSeePending && manga.pendingChapterCount > 0 && <span className='rounded bg-amber-400/90 px-1 text-[10px] text-black'>+{manga.pendingChapterCount}</span>}
                      </span>
                    </span>
                    <span className='line-clamp-2 text-[13px] font-bold leading-snug group-hover:text-primary'>{manga.title}</span>
                    {latest !== null && (
                      <span className='-mt-1 flex items-center gap-1 text-[11px] text-muted-foreground'>
                        <Clock size={11} />
                        {relativeAgo(manga.latestReleaseAt)}
                      </span>
                    )}
                  </Link>
                )
              })}
            </div>
          ) : (
            <PanelEmpty icon={MagnifyingGlass} title={txa('Eşleşen seri yok')} hint={txa('"{v1}" için sonuç bulunamadı.', { v1: query })} />
          )}
        </div>
      ) : (
        <PanelEmpty icon={BookOpen} title={txa('Henüz seri yok')} hint={txa('Fansub yayında bir seri eklediğinde burada görünür.')} />
      )}
    </Panel>
  )
}
