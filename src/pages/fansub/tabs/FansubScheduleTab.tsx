import { useEffect, useMemo, useState } from 'react'
import { Link } from '@/i18n/router'
import { ArrowUpRight, CalendarDots, SpinnerGap } from '@phosphor-icons/react'
import { buildPublicChapterPath, buildPublicMangaPath } from '@/lib/routes'
import { cn } from '@/lib/utils'
import { listFansubReleaseSchedule, type ReleaseScheduleEntry } from '@/services/releaseScheduleService'
import { Panel, PanelEmpty } from '../../profile/ProfileTabKit'
import { DAY_MS, dayDiff, formatChapterNumber, relativeAhead, tabCover, toTime } from './fansubTabUtils'
import { intlLocale, txa } from '@/i18n/activeLocale'

/*
 * Calendar tab (v2): a strip of the next 14 days (chapters per day) + a list of the selected day
 * or all planned releases; a countdown on each row. Data up to 30 days ahead.
 */

const STRIP_DAYS = 14

const dayKey = (time: number) => {
  const date = new Date(time)
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

export function FansubScheduleTab({ fansubId, fansubName }: { fansubId: string, fansubName: string }) {
  const [entries, setEntries] = useState<ReleaseScheduleEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    listFansubReleaseSchedule(fansubId, { daysAhead: 30, limit: 60 })
      .then((data) => { if (!cancelled) setEntries(data) })
      .catch((fetchError: unknown) => {
        if (cancelled) return
        setEntries([])
        setError(fetchError instanceof Error ? fetchError.message : txa('Yayın takvimi yüklenemedi.'))
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [fansubId])

  const upcoming = useMemo(() => entries.filter((entry) => entry.isUpcoming), [entries])
  const counts = useMemo(() => {
    const map = new Map<string, number>()
    for (const entry of upcoming) {
      const time = toTime(entry.publishAt)
      if (time !== null) map.set(dayKey(time), (map.get(dayKey(time)) ?? 0) + 1)
    }
    return map
  }, [upcoming])
  const strip = useMemo(() => {
    const today = new Date()
    today.setHours(12, 0, 0, 0)
    return Array.from({ length: STRIP_DAYS }, (_, index) => {
      const time = today.getTime() + index * DAY_MS
      const date = new Date(time)
      return {
        key: dayKey(time),
        weekday: index === 0 ? txa('Bugün') : date.toLocaleDateString(intlLocale(), { weekday: 'short' }),
        day: date.getDate(),
        count: counts.get(dayKey(time)) ?? 0,
      }
    })
  }, [counts])
  const list = selected ? upcoming.filter((entry) => {
    const time = toTime(entry.publishAt)
    return time !== null && dayKey(time) === selected
  }) : upcoming
  const recent = entries.filter((entry) => !entry.isUpcoming).slice(0, 4)

  return (
    <Panel
      title={txa('Yayın takvimi')}
      icon={CalendarDots}
      tone='amber'
      meta={upcoming.length ? txa('{v1} planlı bölüm · 30 gün', { v1: upcoming.length }) : undefined}
      action={{ label: txa('Site takvimi'), to: '/yayin-takvimi' }}
      testId='fansub-schedule-tab'
    >
      {loading ? (
        <div className='flex flex-col items-center gap-2 py-12 text-[13px] text-muted-foreground'>
          <SpinnerGap size={24} className='animate-spin text-primary' />
          {txa('Takvim yükleniyor')}
        </div>
      ) : error ? (
        <PanelEmpty icon={CalendarDots} title={txa('Takvim yüklenemedi')} hint={error} />
      ) : (
        <div className='flex flex-col gap-5'>
          <div className='grid grid-cols-7 gap-1.5 sm:gap-2' role='tablist' aria-label={txa('Günler')}>
            {strip.map((day) => (
              <button
                key={day.key}
                type='button'
                disabled={!day.count}
                onClick={() => setSelected(selected === day.key ? null : day.key)}
                className={cn(
                  'relative flex flex-col items-center gap-0.5 rounded-xl border py-2 transition-colors disabled:cursor-default',
                  selected === day.key ? 'border-amber-400/60 bg-amber-400/15' : day.count ? 'border-border/70 bg-background/40 hover:border-amber-400/40' : 'border-transparent bg-foreground/[0.03] opacity-60',
                )}
                aria-pressed={selected === day.key}
              >
                <span className='text-[10.5px] font-bold capitalize text-muted-foreground'>{day.weekday}</span>
                <span className='text-[16px] font-black tabular-nums'>{day.day}</span>
                <span className={cn('h-1.5 rounded-full', day.count ? 'bg-amber-400' : 'bg-transparent')} style={{ width: `${Math.min(24, 6 + day.count * 6)}px` }} />
              </button>
            ))}
          </div>

          {list.length ? (
            <div className='flex flex-col gap-1.5'>
              {list.map((entry) => {
                const time = toTime(entry.publishAt)
                const soon = time !== null && dayDiff(time) <= 1
                return (
                  <Link
                    key={entry.chapterId}
                    to={buildPublicMangaPath({ id: entry.mangaId, slug: entry.mangaSlug, title: entry.mangaTitle })}
                    className='group flex items-center gap-3 rounded-2xl border border-transparent p-2.5 pr-4 hover:border-border/70 hover:bg-background/50'
                    data-testid='fansub-schedule-row'
                  >
                    <img src={tabCover(entry.mangaCoverImageUrl, entry.mangaTitle, 120)} alt='' loading='lazy' className='h-[60px] w-[44px] flex-none rounded-lg object-cover' />
                    <span className='min-w-0 flex-1'>
                      <span className='block truncate text-[14px] font-bold group-hover:text-primary'>{entry.mangaTitle}</span>
                      <span className='block truncate text-[12.5px] text-muted-foreground'>
                        {txa('Bölüm {number}', { number: formatChapterNumber(entry.chapterNumber) })}{entry.chapterTitle ? ` · ${entry.chapterTitle}` : ''}
                      </span>
                    </span>
                    <span className={cn('flex-none rounded-full px-2.5 py-1 text-[11.5px] font-extrabold', soon ? 'bg-amber-400 text-black' : 'bg-amber-400/15 text-amber-300')}>
                      {relativeAhead(entry.publishAt)}
                    </span>
                  </Link>
                )
              })}
            </div>
          ) : (
            <PanelEmpty icon={CalendarDots} title={txa('Planlı yayın yok')} hint={txa('{v1} önümüzdeki 30 gün için bir bölüm zamanlamadı.', { v1: fansubName })} />
          )}

          {recent.length ? (
            <div className='flex flex-col gap-2 border-t border-border/60 pt-4'>
              <span className='text-[11.5px] font-extrabold uppercase tracking-[0.12em] text-muted-foreground'>{txa('Yeni yayınlananlar')}</span>
              <div className='flex flex-wrap gap-2'>
                {recent.map((entry) => (
                  <Link
                    key={entry.chapterId}
                    to={buildPublicChapterPath({
                      mangaId: entry.mangaId,
                      mangaSlug: entry.mangaSlug,
                      mangaTitle: entry.mangaTitle,
                      chapterId: entry.chapterId,
                      chapterNumber: entry.chapterNumber,
                      fansubId: entry.fansubId,
                      fansubSlug: entry.fansubSlug,
                      forceVersionQuery: Boolean(entry.chapterId && (entry.fansubId || entry.fansubSlug)),
                    })}
                    className='flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-[12px] font-bold text-emerald-300 hover:border-emerald-400/50'
                  >
                    {entry.mangaTitle} · {formatChapterNumber(entry.chapterNumber)}
                    <ArrowUpRight size={11} weight='bold' />
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </Panel>
  )
}
