import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight } from '@phosphor-icons/react'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'
import { listPublicReleaseSchedule, type ReleaseScheduleEntry } from '@/services/releaseScheduleService'
import { listFollowedFansubIds } from '@/services/userService/follows'
import { createScopedLogger } from '@/services/logger'
import { toDateKey } from './releaseSchedule/releaseSchedulePage.shared'
import {
  buildReleaseWeek, formatWhen, RELEASE_WEEK_FILTERS, startOfWeek, weekOffsetOf, type ReleaseWeekFilter,
} from './releaseSchedule/releaseWeek'
import { ReleaseWeekGrid } from './releaseSchedule/ReleaseWeekGrid'
import { ReleaseWeekMobile } from './releaseSchedule/ReleaseWeekMobile'
import { useReleaseScheduleUserState } from './releaseSchedule/useReleaseScheduleUserState'
import './releaseSchedule/release-week.css'
import { txa } from '@/i18n/activeLocale'

const logger = createScopedLogger('releaseSchedule.page')

/**
 * Release schedule (desktop prototype v3): a weekly hour grid, filters (all
 * releases / teams I follow / my plan / my reminders), reminders and reading
 * plan. On mobile the same week shows as a day strip + the selected day's hour flow.
 */
function ReleaseSchedulePage() {
  const { currentUser } = useAuth()
  const userId = currentUser?.id ?? null
  const [offset, setOffset] = useState(0)
  const [filter, setFilter] = useState<ReleaseWeekFilter>('all')
  const [entries, setEntries] = useState<ReleaseScheduleEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [nextUpcoming, setNextUpcoming] = useState<ReleaseScheduleEntry | null>(null)
  const [followed, setFollowed] = useState<ReadonlySet<string>>(new Set())
  const [now, setNow] = useState(() => new Date())
  const [selectedKey, setSelectedKey] = useState(() => toDateKey(new Date()))

  // The "Now" line and live / soon distinction refresh every minute.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    let cancelled = false
    const start = startOfWeek(new Date(), offset)
    setLoading(true)
    setError(null)
    listPublicReleaseSchedule({ from: start.toISOString(), daysAhead: 7, limit: 500 })
      .then((rows) => { if (!cancelled) setEntries(rows) })
      .catch((reason: unknown) => {
        logger.warn('haftalik takvim yuklenemedi', { error: reason })
        if (!cancelled) {
          setEntries([])
          setError(txa('Yayın takvimi yüklenemedi.'))
        }
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [offset])

  // The next release (may be outside this week): an empty week jumps there.
  useEffect(() => {
    let cancelled = false
    listPublicReleaseSchedule({ from: new Date().toISOString(), daysAhead: 120, limit: 1 })
      .then((rows) => { if (!cancelled) setNextUpcoming(rows[0] ?? null) })
      .catch((reason: unknown) => logger.warn('siradaki yayin okunamadi', { error: reason }))
    return () => { cancelled = true }
  }, [])

  const fansubIds = useMemo(() => [...new Set(entries.map((entry) => entry.fansubId).filter((id): id is string => Boolean(id)))], [entries])
  useEffect(() => {
    if (!userId || fansubIds.length === 0) {
      setFollowed(new Set())
      return undefined
    }
    let cancelled = false
    listFollowedFansubIds(userId, fansubIds)
      .then((ids) => { if (!cancelled) setFollowed(new Set(ids)) })
      .catch((reason: unknown) => logger.warn('takip edilen ekipler okunamadi', { error: reason }))
    return () => { cancelled = true }
  }, [fansubIds, userId])

  const { plannedSet, isReminded, toggleReminder, togglePlan } = useReleaseScheduleUserState(userId, entries)
  const week = useMemo(() => buildReleaseWeek(entries, {
    offset, now, filter, followedFansubIds: followed, plannedChapterIds: plannedSet, isReminded,
  }), [entries, filter, followed, isReminded, now, offset, plannedSet])

  // On mobile if the selected day falls outside the week it moves to today or the first day with a release.
  useEffect(() => {
    if (week.days.some((day) => day.key === selectedKey)) return
    const today = week.days.find((day) => day.isToday)
    setSelectedKey((today ?? week.days.find((day) => day.items.length) ?? week.days[0]).key)
  }, [selectedKey, week.days])

  const nextOutside = !week.next && nextUpcoming ? nextUpcoming : null
  const goToWeekOf = (iso: string) => {
    const target = new Date(iso)
    setOffset(weekOffsetOf(target, new Date()))
    setSelectedKey(toDateKey(target))
  }
  const navButton = 'flex size-[38px] items-center justify-center rounded-[10px] border border-border bg-transparent text-muted-foreground hover:border-primary/40 hover:text-foreground'

  return (
    <div className='min-h-screen bg-background' data-testid='release-week-page'>
      <div className='mx-auto w-full max-w-[1640px] px-4 pb-14 pt-6 sm:px-6'>
        <div className='flex flex-wrap items-end justify-between gap-5 border-b border-border pb-4'>
          <div className='min-w-0'>
            <div className='text-[11px] font-extrabold uppercase tracking-[0.16em] text-primary'>{week.note}</div>
            <h1 className='rw-serif mt-1.5 text-[28px] font-black leading-none sm:text-[34px]'>{week.title}</h1>
          </div>
          <div className='flex flex-none items-center gap-2'>
            <button type='button' onClick={() => setOffset((value) => value - 1)} className={navButton} aria-label={txa('Önceki hafta')}>
              <ArrowLeft weight='bold' size={15} />
            </button>
            <button
              type='button'
              onClick={() => { setOffset(0); setSelectedKey(toDateKey(new Date())) }}
              className={cn(
                'h-[38px] rounded-[10px] border px-4 text-[13px] font-bold',
                offset === 0 ? 'border-primary bg-primary/15 text-primary' : 'border-border bg-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {txa('Bugün')}
            </button>
            <button type='button' onClick={() => setOffset((value) => value + 1)} className={navButton} aria-label={txa('Sonraki hafta')}>
              <ArrowRight weight='bold' size={15} />
            </button>
          </div>
        </div>

        <div className='mt-4 flex flex-wrap items-center justify-between gap-4'>
          <div className='-mx-4 flex gap-5 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0' role='tablist' aria-label={txa('Takvim filtresi')}>
            {RELEASE_WEEK_FILTERS.map((entry) => (
              <button
                key={entry.id}
                type='button'
                role='tab'
                aria-selected={filter === entry.id}
                onClick={() => setFilter(entry.id)}
                className={cn(
                  'flex-none whitespace-nowrap border-b-2 bg-transparent pb-1.5 text-[13px] font-bold',
                  filter === entry.id ? 'border-foreground/40 text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
                data-testid='release-week-filter'
              >
                {txa(entry.label)}
              </button>
            ))}
          </div>
          <div className='flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[12.5px] font-semibold text-muted-foreground'>
            <span><b className='font-extrabold text-foreground'>{week.total}</b>{txa(' bölüm')}</span>
            <span><b className='font-extrabold text-[oklch(0.62_0.17_255)]'>{week.planTotal}</b>{txa(' planda')}</span>
            <span><b className='font-extrabold text-amber-400'>{week.remTotal}</b>{txa(' hatırlatma')}</span>
            <span className='sm:border-l sm:border-border sm:pl-5' data-testid='release-week-next'>
              {txa('Sıradaki')}{' '}
              {week.next ? (
                <><b className='font-extrabold text-foreground'>{week.next.title}</b> · {formatWhen(week.next.at, now)}</>
              ) : nextOutside ? (
                <button type='button' onClick={() => goToWeekOf(nextOutside.publishAt)} className='bg-transparent p-0 font-extrabold text-foreground hover:text-primary'>
                  {nextOutside.mangaTitle} · {formatWhen(new Date(nextOutside.publishAt).getTime(), now)}
                </button>
              ) : (
                <b className='font-extrabold text-foreground'>{offset < 0 ? txa('Hafta tamamlandı') : txa('planlanmış yayın yok')}</b>
              )}
            </span>
          </div>
        </div>

        {filter === 'mine' && !userId && (
          <p className='mt-4 rounded-xl border border-border bg-card px-4 py-3 text-[13px] text-muted-foreground'>
            {txa('Takip ettiğin ekiplerin yayınlarını görmek için giriş yap.')}
          </p>
        )}
        {error && <p className='mt-4 text-sm text-destructive'>{error}</p>}

        <div className={cn('transition-opacity', loading && 'opacity-60')} aria-busy={loading}>
          <div className='hidden lg:block'>
            <ReleaseWeekGrid week={week} onReminder={(entry) => { void toggleReminder(entry) }} onPlan={(rows) => { void togglePlan(rows) }} />
          </div>
          <div className='lg:hidden'>
            <ReleaseWeekMobile
              week={week}
              selectedKey={selectedKey}
              onSelect={setSelectedKey}
              onReminder={(entry) => { void toggleReminder(entry) }}
              onPlan={(rows) => { void togglePlan(rows) }}
            />
          </div>
        </div>

        {!loading && week.total === 0 && (
          <div className='mt-5 rounded-[14px] border border-dashed border-border px-5 py-8 text-center' data-testid='release-week-empty'>
            <div className='text-sm font-extrabold'>{filter === 'all' ? txa('Bu hafta yayın yok') : txa('Bu filtreyle yayın yok')}</div>
            <div className='mt-1.5 text-[13px] text-muted-foreground'>
              {filter === 'all' ? txa('Başka bir haftaya geç') : txa('Başka bir hafta seç ya da filtreyi “Tüm yayınlar”a al.')}
              {nextOutside ? txa('; sıradaki yayın aşağıda.') : '.'}
            </div>
            {nextOutside && (
              <button
                type='button'
                onClick={() => goToWeekOf(nextOutside.publishAt)}
                className='mt-4 inline-flex h-9 items-center gap-2 rounded-[10px] bg-primary px-4 text-[13px] font-extrabold text-primary-foreground'
              >
                {txa('Sıradaki yayına git: {title}', { title: nextOutside.mangaTitle })} · {formatWhen(new Date(nextOutside.publishAt).getTime(), now)}
                <ArrowRight weight='bold' size={14} />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default ReleaseSchedulePage
