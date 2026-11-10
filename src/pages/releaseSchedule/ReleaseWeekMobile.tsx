import { Link } from '@/i18n/router'
import { cn } from '@/lib/utils'
import type { ReleaseScheduleEntry } from '@/services/releaseScheduleService'
import { ReleaseActions, ReleaseCover, ReleasePills, ReleaseTeams } from './ReleaseWeekParts'
import { getEntryDestination } from './releaseSchedulePage.shared'
import type { ReleaseWeek } from './releaseWeek'
import { txa } from '@/i18n/activeLocale'

/*
 * Mobile: the equivalent of the desktop weekly grid. A 7-day strip on top (day, date,
 * release count), the selected day's hour flow below; same card language as desktop.
 */
export function ReleaseWeekMobile({ week, selectedKey, onSelect, onReminder, onPlan }: {
  week: ReleaseWeek
  selectedKey: string
  onSelect: (key: string) => void
  onReminder: (entry: ReleaseScheduleEntry) => void
  onPlan: (entries: ReleaseScheduleEntry[]) => void
}) {
  const day = week.days.find((entry) => entry.key === selectedKey) ?? week.days[0]
  return (
    <div className='mt-4' data-testid='release-week-mobile'>
      <div className='-mx-4 grid grid-cols-7 gap-1 px-4' role='tablist' aria-label={txa('Haftanın günleri')}>
        {week.days.map((entry) => {
          const active = entry.key === day.key
          return (
            <button
              key={entry.key}
              type='button'
              role='tab'
              aria-selected={active}
              onClick={() => onSelect(entry.key)}
              className={cn(
                'flex min-w-0 flex-col items-center gap-1 rounded-xl border py-2 transition-colors',
                active ? 'border-primary/50 bg-primary/15' : entry.isToday ? 'border-primary/30 bg-card' : 'border-border bg-card',
              )}
              data-testid='release-week-day'
            >
              <span className={cn('text-[10px] font-extrabold uppercase tracking-[0.08em]', active || entry.isToday ? 'text-primary' : 'text-muted-foreground')}>{entry.weekday}</span>
              <span className={cn('rw-serif text-lg font-black leading-none', active ? 'text-primary' : 'text-foreground')}>{entry.day}</span>
              <span className={cn('h-[14px] text-[10px] font-bold', entry.items.length ? 'text-foreground' : 'text-transparent')}>{entry.items.length || '0'}</span>
            </button>
          )
        })}
      </div>

      <div className='mt-4 flex items-baseline justify-between'>
        <span className='text-sm font-extrabold'>{day.weekdayLong}{day.isToday ? ` · ${txa('Bugün')}` : ''}</span>
        <span className='text-xs font-semibold text-muted-foreground'>{day.items.length ? txa('{count} yayın', { count: day.items.length }) : txa('Yayın yok')}</span>
      </div>

      {day.items.length === 0 ? (
        <p className='mt-3 rounded-xl border border-dashed border-border px-4 py-6 text-center text-[13px] text-muted-foreground'>
          {txa('Bu gün için yayın yok. Başka bir gün seç.')}
        </p>
      ) : (
        <ol className='mt-3 flex flex-col gap-2.5'>
          {day.items.map((item) => (
            <li key={item.key} className='flex gap-3'>
              <span className={cn('w-11 flex-none pt-2.5 text-right text-xs font-extrabold', item.released ? 'text-muted-foreground' : 'text-foreground')}>{item.time}</span>
              <div
                className={cn(
                  'flex min-w-0 flex-1 gap-2.5 rounded-xl border bg-card p-2.5',
                  item.reminded ? 'border-amber-400' : item.planned ? 'border-[oklch(0.62_0.17_255)]' : 'border-border',
                )}
                data-testid='release-week-card'
              >
                <Link to={getEntryDestination(item.entry)} className='flex-none' tabIndex={-1} aria-hidden='true'>
                  <ReleaseCover item={item} className='h-[64px] w-[46px] rounded-md' />
                </Link>
                <div className='flex min-w-0 flex-1 flex-col'>
                  <span className='flex flex-wrap items-center gap-[5px]'>
                    <ReleasePills item={item} />
                  </span>
                  <Link to={getEntryDestination(item.entry)} className='block text-[13.5px] font-bold leading-snug text-inherit hover:text-primary'>{item.title}</Link>
                  <span className='mt-0.5 text-[11.5px] font-semibold text-muted-foreground'>{item.chapterLabel}{item.released ? txa(' · yayında') : ''}</span>
                  <span className='mt-1.5 flex flex-wrap items-center gap-1'>
                    <ReleaseTeams item={item} />
                  </span>
                </div>
                <ReleaseActions item={item} size={32} onReminder={() => onReminder(item.entry)} onPlan={() => onPlan(item.entries)} />
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
