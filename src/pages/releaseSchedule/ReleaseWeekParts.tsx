import { Link } from '@/i18n/router'
import { Bell, BellRinging, BookmarkSimple } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { buildPublicFansubPath } from '@/lib/routes'
import { buildCoverPlaceholder } from './releaseSchedulePage.shared'
import type { ReleaseWeekItem } from './releaseWeek'
import { txa } from '@/i18n/activeLocale'

/* Shared parts of the desktop grid and mobile list (prototype v3 schedule card). */

const PLAN_INK = 'text-[oklch(0.62_0.17_255)]'

export function ReleaseCover({ item, className }: { item: ReleaseWeekItem, className?: string }) {
  return (
    <img
      src={item.cover || buildCoverPlaceholder(item.title)}
      alt=''
      loading='lazy'
      className={cn('flex-none rounded-[5px] bg-muted object-cover', className)}
    />
  )
}

export function ReleasePills({ item }: { item: ReleaseWeekItem }) {
  return (
    <>
      {item.batch > 1 && (
        <span className='rounded-full bg-primary/15 px-[5px] text-[9px] font-extrabold leading-[1.5] text-primary'>{txa('{count} bölüm', { count: item.batch })}</span>
      )}
      {item.teams.length > 1 && (
        <span className='rounded-full bg-accent px-[5px] text-[9px] font-extrabold leading-[1.5] text-muted-foreground'>{txa('{count} çeviri', { count: item.teams.length })}</span>
      )}
    </>
  )
}

export function ReleaseTeams({ item, small = false }: { item: ReleaseWeekItem, small?: boolean }) {
  return (
    <>
      {item.teams.map((team) => (
        <Link
          key={team.id ?? team.name}
          to={buildPublicFansubPath({ id: team.id, slug: team.slug })}
          className={cn(
            'min-w-0 truncate whitespace-nowrap rounded-full bg-accent px-1.5 py-px font-bold text-muted-foreground hover:text-primary',
            small ? 'text-[9.5px]' : 'text-[10px]',
          )}
        >
          {team.name}
        </Link>
      ))}
    </>
  )
}

export function ReleaseActions({ item, onReminder, onPlan, size = 22, vertical = true }: {
  item: ReleaseWeekItem
  onReminder: () => void
  onPlan: () => void
  size?: number
  vertical?: boolean
}) {
  const button = 'flex items-center justify-center rounded-md border-0 bg-transparent hover:bg-accent'
  const icon = size >= 22 ? 13 : 12
  return (
    <span className={cn('flex flex-none gap-[3px]', vertical ? 'flex-col' : 'flex-row')}>
      <button
        type='button'
        onClick={onReminder}
        title={item.reminded ? txa('Hatırlatmayı kaldır') : txa('Hatırlat')}
        aria-label={item.reminded ? txa('Hatırlatmayı kaldır') : txa('Hatırlat')}
        aria-pressed={item.reminded}
        className={cn(button, item.reminded ? 'text-amber-400' : 'text-muted-foreground/70')}
        style={{ width: size, height: size }}
        data-testid='release-week-reminder'
      >
        {item.reminded ? <BellRinging weight='fill' size={icon} /> : <Bell weight='bold' size={icon} />}
      </button>
      <button
        type='button'
        onClick={onPlan}
        title={item.planned ? txa('Planımdan çıkar') : txa('Planıma ekle')}
        aria-label={item.planned ? txa('Planımdan çıkar') : txa('Planıma ekle')}
        aria-pressed={item.planned}
        className={cn(button, item.planned ? PLAN_INK : 'text-muted-foreground/70')}
        style={{ width: size, height: size }}
        data-testid='release-week-plan'
      >
        <BookmarkSimple weight={item.planned ? 'fill' : 'bold'} size={icon} />
      </button>
    </span>
  )
}
