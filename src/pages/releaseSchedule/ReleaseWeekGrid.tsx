import { Link } from '@/i18n/router'
import { cn } from '@/lib/utils'
import type { ReleaseScheduleEntry } from '@/services/releaseScheduleService'
import { ReleaseActions, ReleaseCover, ReleasePills, ReleaseTeams } from './ReleaseWeekParts'
import { getEntryDestination } from './releaseSchedulePage.shared'
import type { ReleaseWeek, ReleaseWeekGroup } from './releaseWeek'
import { txa } from '@/i18n/activeLocale'

/* Desktop: hour axis + 7 day columns; releases at the same hour in one card. */

interface Handlers {
  onReminder: (entry: ReleaseScheduleEntry) => void
  onPlan: (entries: ReleaseScheduleEntry[]) => void
}

const TONE_EDGE: Record<ReleaseWeekGroup['tone'], string> = {
  rem: 'border-amber-400',
  plan: 'border-[oklch(0.62_0.17_255)]',
  none: 'border-border',
}

function GroupCard({ group, onReminder, onPlan }: { group: ReleaseWeekGroup } & Handlers) {
  const style = { top: group.top, height: group.height }
  const frame = cn('absolute inset-x-0 z-[2] box-border overflow-hidden rounded-[10px] border bg-card', TONE_EDGE[group.tone])
  if (group.items.length === 1) {
    const item = group.items[0]
    return (
      <div className={frame} style={style} data-testid='release-week-card'>
        <div className='box-border flex h-full gap-2 p-2'>
          <Link to={getEntryDestination(item.entry)} className='flex-none' tabIndex={-1} aria-hidden='true'>
            <ReleaseCover item={item} className='h-full w-[34px]' />
          </Link>
          <div className='flex min-w-0 flex-1 flex-col'>
            <Link to={getEntryDestination(item.entry)} className='block text-left text-inherit hover:text-primary'>
              <span className='flex flex-wrap items-center gap-[5px]'>
                <span className={cn('text-[11px] font-extrabold', item.released ? 'text-muted-foreground' : 'text-foreground')}>{item.time}</span>
                <ReleasePills item={item} />
              </span>
              <span className='mt-[3px] block max-h-[30px] overflow-hidden text-xs font-bold leading-[1.25]'>{item.title}</span>
            </Link>
            <span className='min-h-0 flex-1' />
            <span className='block text-[10.5px] font-semibold text-muted-foreground/80'>{item.chapterLabel}</span>
            <span className='mt-[3px] flex flex-wrap items-center gap-x-1 gap-y-[3px]'>
              <ReleaseTeams item={item} />
            </span>
          </div>
          <ReleaseActions item={item} onReminder={() => onReminder(item.entry)} onPlan={() => onPlan(item.entries)} />
        </div>
      </div>
    )
  }
  return (
    <div className={frame} style={style} data-testid='release-week-card'>
      <div className='flex h-full flex-col'>
        <div className='flex flex-none items-center justify-between gap-1.5 border-b border-border bg-accent px-[9px] py-[7px]'>
          <span className='text-[11px] font-extrabold'>{group.time}</span>
          <span className='text-[10px] font-bold text-muted-foreground'>{txa('{count} yayın', { count: group.items.length })}</span>
        </div>
        {group.items.map((item) => (
          <div key={item.key} className='flex min-h-0 flex-1 items-center gap-[7px] border-b border-border px-[9px] last:border-b-0'>
            <Link to={getEntryDestination(item.entry)} className='flex-none' tabIndex={-1} aria-hidden='true'>
              <ReleaseCover item={item} className='h-9 w-[26px] rounded-[4px]' />
            </Link>
            <span className='min-w-0 flex-1'>
              <Link to={getEntryDestination(item.entry)} className='flex items-center gap-1 text-inherit hover:text-primary'>
                <span className='truncate text-[11.5px] font-bold'>{item.title}</span>
                <ReleasePills item={item} />
              </Link>
              <span className='mt-[3px] flex flex-wrap items-center gap-x-1 gap-y-[3px]'>
                <span className='flex-none text-[10px] font-semibold text-muted-foreground/80'>{item.chapterLabel}</span>
                <ReleaseTeams item={item} small />
              </span>
            </span>
            <ReleaseActions item={item} size={20} vertical={false} onReminder={() => onReminder(item.entry)} onPlan={() => onPlan(item.entries)} />
          </div>
        ))}
      </div>
    </div>
  )
}

export function ReleaseWeekGrid({ week, onReminder, onPlan }: { week: ReleaseWeek } & Handlers) {
  return (
    <div className='mt-5 grid grid-cols-[58px_repeat(7,minmax(0,1fr))] gap-x-2.5' data-testid='release-week-grid'>
      <div />
      {week.days.map((day) => (
        <div
          key={day.key}
          className={cn('flex min-w-0 items-baseline justify-between gap-1.5 border-b-2 px-1 pb-2.5', day.isToday ? 'border-primary/40' : 'border-border')}
        >
          <span className='flex items-baseline gap-[7px]'>
            <span className={cn('text-[10.5px] font-extrabold uppercase tracking-[0.12em]', day.isToday ? 'text-primary' : 'text-muted-foreground')}>{day.weekday}</span>
            <span className={cn('rw-serif text-xl font-black leading-none', day.isToday ? 'text-primary' : 'text-foreground')}>{day.day}</span>
          </span>
          <span className='text-[11px] font-bold text-muted-foreground/70'>{day.items.length || ''}</span>
        </div>
      ))}

      <div className='relative' style={{ height: week.axisHeight }}>
        {week.hours.map((hour) => (
          <span key={hour.label} className='absolute right-2.5 -translate-y-1/2 text-[10.5px] font-bold text-muted-foreground/70' style={{ top: hour.top }}>{hour.label}</span>
        ))}
      </div>

      {week.days.map((day) => (
        <div key={day.key} className={cn('relative min-w-0', day.isToday ? 'bg-primary/10' : 'bg-card/60')} style={{ height: week.axisHeight }}>
          {week.hours.map((hour) => <span key={hour.label} className='absolute inset-x-0 h-px bg-border' style={{ top: hour.top }} />)}
          {day.isToday && week.nowTop !== null && (
            <>
              <span className='absolute inset-x-0 z-[3] h-0.5 bg-primary' style={{ top: week.nowTop }} data-testid='release-week-now' />
              <span className='absolute -left-[3px] z-[3] -mt-[3px] size-2 rounded-full bg-primary' style={{ top: week.nowTop }} />
            </>
          )}
          {day.groups.map((group) => <GroupCard key={group.time} group={group} onReminder={onReminder} onPlan={onPlan} />)}
        </div>
      ))}
    </div>
  )
}
