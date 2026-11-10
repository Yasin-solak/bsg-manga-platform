import { useEffect, useMemo, useState } from 'react'
import { Link } from '@/i18n/router'
import { ArrowDownUp, ChevronDown, Flag, Search } from 'lucide-react'
import {
  buildPublicChapterPath,
  doesChapterRouteNeedVersionQuery,
} from '@/lib/routes'
import { cn } from '@/lib/utils'
import { showInactiveFeatureToast } from '@/services/inactiveFeatureToast'
import {
  CHAPTER_PAGE_SIZE,
  filterChapterGroups,
  formatChapterFoot,
  formatChapterMeta,
  groupChapters,
  nextSortOrder,
  sortOrderLabel,
  type ChapterSortOrder,
} from './mangaDetailChapters'
import type { Chapter, Manga } from '@/types'
import { txa } from '@/i18n/activeLocale'

interface MangaDetailChapterListProps {
  manga: Manga
  chapters: Chapter[]
  searchQuery: string
  onSearchQueryChange: (value: string) => void
  selectedVersions: Record<number, string>
  onSelectedVersionChange: (chapterNumber: number, versionId: string) => void
  continueReadingChapterNumber?: number | null
  /** Rapor bayragi kapaliysa undefined gelir; buton o zaman "pasif" toast'i basar. */
  onReportChapter?: (chapterId: string) => void
}

export default function MangaDetailChapterList({
  manga,
  chapters,
  searchQuery,
  onSearchQueryChange,
  selectedVersions,
  onSelectedVersionChange,
  continueReadingChapterNumber,
  onReportChapter,
}: MangaDetailChapterListProps) {
  const [sortOrder, setSortOrder] = useState<ChapterSortOrder>('newest')
  const [visibleCount, setVisibleCount] = useState(CHAPTER_PAGE_SIZE)

  const groups = useMemo(() => groupChapters(chapters, sortOrder), [chapters, sortOrder])
  const matched = useMemo(() => filterChapterGroups(groups, searchQuery), [groups, searchQuery])

  /*
   * Reset the window on search/sort change. Otherwise a user searching with 60 rows open
   * would still see Show more on a 3-result list.
   */
  useEffect(() => { setVisibleCount(CHAPTER_PAGE_SIZE) }, [searchQuery, sortOrder])

  const visible = matched.slice(0, visibleCount)
  const hasMore = visible.length < matched.length

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-[9px]">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-[15px] -translate-y-1/2 text-muted-foreground" />
          <input
            placeholder={txa('Bölüm ara...')}
            value={searchQuery}
            onChange={(event) => onSearchQueryChange(event.target.value)}
            aria-label={txa('Bölüm ara')}
            className="h-[42px] w-full rounded-[12px] border border-border bg-card pl-[34px] pr-3 text-[13.5px] font-semibold outline-none transition-colors focus:border-primary"
          />
        </div>
        <button
          type="button"
          data-testid="chapter-sort-toggle"
          onClick={() => setSortOrder(nextSortOrder)}
          aria-label={sortOrder === 'newest' ? txa('En eski bölümden sırala') : txa('En yeni bölümden sırala')}
          className="flex h-[42px] shrink-0 items-center gap-1.5 rounded-[12px] border border-border px-[13px] text-[12.5px] font-extrabold text-foreground/80 transition-colors hover:border-primary hover:text-primary"
        >
          <ArrowDownUp className="size-[15px]" />
          {sortOrderLabel(sortOrder)}
        </button>
      </div>

      {matched.length > 0 ? (
        <div id="chapter-list" className="divide-y divide-border overflow-hidden rounded-[14px] border border-border">
          {visible.map(({ chapterNumber, versions }) => {
            const selectedVersionId = selectedVersions[chapterNumber] || versions[0].id
            const activeVersion = versions.find((entry) => entry.id === selectedVersionId) || versions[0]
            const isContinueReadingRow = continueReadingChapterNumber === chapterNumber

            return (
              <div
                key={chapterNumber}
                className={cn(
                  'flex items-center gap-[11px] px-[11px] py-2.5 transition-colors hover:bg-accent/40',
                  isContinueReadingRow && 'bg-primary/5',
                )}
              >
                <Link
                  to={buildPublicChapterPath({
                    mangaId: manga.id,
                    mangaSlug: manga.slug,
                    mangaTitle: manga.title,
                    chapterNumber,
                    chapterId: activeVersion.id,
                    fansubId: activeVersion.fansub?.id,
                    fansubSlug: activeVersion.fansub?.slug,
                    forceVersionQuery: doesChapterRouteNeedVersionQuery(versions, activeVersion),
                  })}
                  className="flex min-w-0 flex-1 items-center gap-2.5 transition-opacity hover:opacity-80"
                >
                  <span className="flex size-[30px] shrink-0 items-center justify-center rounded-[8px] bg-primary/15 text-[11.5px] font-black text-primary">
                    {chapterNumber}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-[7px]">
                      <span className="min-w-0 truncate text-[13px] font-bold">
                        {activeVersion.title || txa('Bölüm {number}', { number: chapterNumber })}
                      </span>
                      {isContinueReadingRow ? (
                        <span className="shrink-0 rounded-[6px] bg-secondary px-[7px] py-0.5 text-[9.5px] font-black text-secondary-foreground">
                          {txa('Kaldığın Yer')}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-[3px] text-[11px] font-semibold text-muted-foreground">
                      {formatChapterMeta(activeVersion.createdAt, versions.length)}
                    </div>
                  </div>
                </Link>

                <div className="flex shrink-0 items-center gap-[7px]" onClick={(event) => event.stopPropagation()}>
                  {versions.length > 1 ? (
                    <select
                      value={selectedVersionId}
                      onChange={(event) => onSelectedVersionChange(chapterNumber, event.target.value)}
                      aria-label={txa('Bölüm {number} için çeviri sürümü', { number: chapterNumber })}
                      className="h-9 max-w-[104px] rounded-[8px] border border-border bg-muted/40 px-1.5 text-[11px] font-bold text-foreground/90 outline-none focus:border-primary"
                    >
                      {versions.map((version) => (
                        <option key={version.id} value={version.id}>
                          {version.fansub?.name || txa('Bilinmeyen')}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="max-w-[104px] truncate text-[11px] font-bold text-muted-foreground">
                      {activeVersion.fansub?.name || ''}
                    </span>
                  )}

                  <button
                    type="button"
                    data-testid="chapter-report-button"
                    onClick={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      if (!onReportChapter) { showInactiveFeatureToast('Bolum raporlama'); return }
                      onReportChapter(activeVersion.id)
                    }}
                    /*
                     * Visual size from the prototype (32x32), but the TOUCH TARGET is
                     * widened to 44x44 with a pseudo-element. It used to be 16x16:
                     * on a phone the finger either missed or hit the row's
                     * link and opened the reader.
                     */
                    className="relative flex size-8 items-center justify-center rounded-[9px] text-muted-foreground transition-colors after:absolute after:-inset-1.5 after:content-[''] hover:bg-accent hover:text-destructive"
                    aria-label={onReportChapter ? txa('Bölüm {number} için rapor gönder', { number: chapterNumber }) : txa('Bölüm raporlama şu anda aktif değil')}
                    title={onReportChapter ? txa('Bölümü raporla') : txa('Bölüm raporlama şu anda aktif değil')}
                  >
                    <Flag className="size-[15px]" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {chapters.length === 0 ? txa('Henüz bölüm eklenmemiş.') : txa('Aramanla eşleşen bölüm yok.')}
        </p>
      )}

      {hasMore ? (
        <div className="flex gap-2 pt-[3px]">
          <button
            type="button"
            data-testid="chapter-load-more"
            onClick={() => setVisibleCount((current) => current + CHAPTER_PAGE_SIZE)}
            className="flex h-[46px] flex-1 items-center justify-center gap-[7px] rounded-[13px] border border-border bg-card text-[13px] font-extrabold text-foreground/80 transition-colors hover:border-primary hover:text-primary"
          >
            <ChevronDown className="size-[15px]" />
            {txa('Daha fazla')}
          </button>
          <button
            type="button"
            data-testid="chapter-load-all"
            onClick={() => setVisibleCount(matched.length)}
            className="h-[46px] shrink-0 rounded-[13px] border border-border px-[15px] text-[13px] font-extrabold text-foreground/80 transition-colors hover:border-primary hover:text-primary"
          >
            {txa('Tümü')}
          </button>
        </div>
      ) : null}

      {matched.length > 0 ? (
        <p
          data-testid="chapter-list-foot"
          className="pt-[3px] text-center text-[11.5px] font-bold text-muted-foreground"
        >
          {formatChapterFoot(visible.length, matched.length)}
        </p>
      ) : null}
    </div>
  )
}
