import { useMemo, useState } from 'react'
import { Link } from '@/i18n/router'
import { ClockCounterClockwise, HourglassMedium } from '@phosphor-icons/react'
import { buildPublicChapterPath } from '@/lib/routes'
import { cn } from '@/lib/utils'
import { Panel, PanelEmpty } from '../../profile/ProfileTabKit'
import type { FansubChapterPreview } from '../types'
import { DAY_BUCKET_LABEL, groupInOrder, pastBucket, relativeAgo, relativeAhead, tabCover } from './fansubTabUtils'
import { txa } from '@/i18n/activeLocale'

/*
 * Latest Chapters tab (v2): a timeline grouped by day (Today / Yesterday / This week ...).
 * A series filter on top. Scheduled chapters (sent only to staff) are marked separately.
 */

const releasedAt = (chapter: FansubChapterPreview) => chapter.publishAt || chapter.createdAt

export function FansubReleasesTab({ chapters, fansubId, fansubSlug }: { chapters: FansubChapterPreview[], fansubId: string, fansubSlug?: string }) {
  const [manga, setManga] = useState<string | null>(null)
  const series = useMemo(() => {
    const seen = new Map<string, { id: string, title: string, count: number }>()
    for (const chapter of chapters) {
      const entry = seen.get(chapter.mangaId) ?? { id: chapter.mangaId, title: chapter.mangaTitle, count: 0 }
      entry.count += 1
      seen.set(chapter.mangaId, entry)
    }
    return [...seen.values()]
  }, [chapters])
  const filtered = manga ? chapters.filter((chapter) => chapter.mangaId === manga) : chapters
  const groups = groupInOrder(filtered, (chapter) => (chapter.isPending ? 'pending' : pastBucket(releasedAt(chapter))))

  return (
    <Panel title={txa('Son Bölümler')} icon={ClockCounterClockwise} tone='primary' meta={chapters.length ? txa('{v1} bölüm', { v1: chapters.length }) : undefined} testId='fansub-releases-tab'>
      {chapters.length ? (
        <div className='flex flex-col gap-4'>
          {series.length > 1 && (
            <div className='flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]'>
              {[{ id: null as string | null, title: txa('Tümü'), count: chapters.length }, ...series].map((entry) => (
                <button
                  key={entry.id ?? 'all'}
                  type='button'
                  onClick={() => setManga(entry.id)}
                  className={cn(
                    'flex-none rounded-full border px-3 py-1.5 text-[12px] font-bold transition-colors',
                    manga === entry.id ? 'border-foreground/20 bg-foreground text-background' : 'border-border/70 bg-transparent text-muted-foreground hover:text-foreground',
                  )}
                >
                  {entry.title} <span className='opacity-60'>{entry.count}</span>
                </button>
              ))}
            </div>
          )}

          {groups.map((group, groupIndex) => (
            <section key={`${group.key}-${groupIndex}`} className='flex flex-col gap-2'>
              <h3 className='flex items-center gap-2 text-[11.5px] font-extrabold uppercase tracking-[0.12em] text-muted-foreground'>
                {group.key === 'pending' ? txa('Zamanlanmış') : DAY_BUCKET_LABEL[group.key]}
                <span className='h-px flex-1 bg-border/60' />
              </h3>
              <div className='flex flex-col gap-1.5'>
                {group.items.map((chapter, index) => {
                  const isLatest = groupIndex === 0 && index === 0 && !chapter.isPending
                  return (
                    <Link
                      key={chapter.chapterId}
                      to={buildPublicChapterPath({
                        mangaId: chapter.mangaId,
                        mangaSlug: chapter.mangaSlug,
                        mangaTitle: chapter.mangaTitle,
                        chapterNumber: chapter.chapterNumber,
                        fansubId,
                        fansubSlug,
                        forceVersionQuery: Boolean(fansubId || fansubSlug),
                      })}
                      className={cn(
                        'group flex items-center gap-3 rounded-2xl border p-2.5 pr-4 transition-colors',
                        isLatest ? 'border-primary/30 bg-primary/[0.07] hover:border-primary/50' : 'border-transparent hover:border-border/70 hover:bg-background/50',
                      )}
                      data-testid='fansub-release-row'
                    >
                      <img src={tabCover(chapter.coverImage, chapter.mangaTitle, 120)} alt='' loading='lazy' className='h-[60px] w-[44px] flex-none rounded-lg object-cover' />
                      <span className='min-w-0 flex-1'>
                        <span className='block truncate text-[14px] font-bold group-hover:text-primary'>{chapter.mangaTitle}</span>
                        <span className='flex min-w-0 items-center gap-2 text-[12.5px]'>
                          <span className='flex-none font-extrabold text-primary'>{txa('Bölüm {v1}', { v1: chapter.chapterNumber })}</span>
                          {chapter.title && <span className='truncate text-muted-foreground'>{chapter.title}</span>}
                        </span>
                      </span>
                      {chapter.isPending ? (
                        <span className='flex flex-none items-center gap-1 rounded-full bg-amber-400/15 px-2 py-0.5 text-[11px] font-bold text-amber-300'>
                          <HourglassMedium size={12} weight='fill' />
                          {chapter.publishAt ? relativeAhead(chapter.publishAt) : txa('Onay bekliyor')}
                        </span>
                      ) : (
                        <span className='flex-none text-[11.5px] font-semibold text-muted-foreground'>
                          {isLatest && <span className='mr-1.5 inline-block size-1.5 rounded-full bg-primary align-middle' />}
                          {relativeAgo(releasedAt(chapter))}
                        </span>
                      )}
                    </Link>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <PanelEmpty icon={ClockCounterClockwise} title={txa('Henüz bölüm yok')} hint={txa('Yayınlanan bölümler burada en yeniden eskiye sıralanır.')} />
      )}
    </Panel>
  )
}
