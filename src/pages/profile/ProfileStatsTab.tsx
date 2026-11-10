import type { ReactNode } from 'react'
import { Link } from '@/i18n/router'
import {
  CalendarBlank, CalendarCheck, ChartBar, ChatCircle, Clock, Fire, Heart, Moon, Ranking, Sparkle, Stack, Sun, SunHorizon, UsersThree,
} from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { buildPublicMangaPath } from '@/lib/routes'
import { formatTimeSpent } from './helpers'
import { profileCover } from './profileMedia'
import { Meter, Panel, PanelEmpty, StatTile } from './ProfileTabKit'
import type { ProfileReadingSummary } from './useProfileReadingSummary'
import type { MockUser } from './types'
import { intlLocale, txa } from '@/i18n/activeLocale'

/*
 * Statistics (tabs v3): a summary scene (total + reading personality), a 26-week reading
 * calendar, monthly chart, day / hour rhythm, most read series, genre distribution, community trace
 * and (for the owner) completed quests. Data from get_profile_reading_summary.
 */

const MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara']
const WEEKDAYS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz']
const fmt = (value: number) => value.toLocaleString(intlLocale())

/** Saat dagilimindan okuma kisiligi (en yogun 3 saatlik pencere). */
function readerPersona(hourly: number[]) {
  if (!hourly.length || hourly.every((value) => value === 0)) return null
  let best = 0
  let bestSum = -1
  for (let hour = 0; hour < 24; hour += 1) {
    const sum = hourly[hour] + hourly[(hour + 1) % 24] + hourly[(hour + 2) % 24]
    if (sum > bestSum) { bestSum = sum; best = (hour + 1) % 24 }
  }
  if (best >= 5 && best < 11) return { label: txa('Sabahçı'), hint: txa('Güne bölümle başlıyor'), icon: SunHorizon }
  if (best >= 11 && best < 17) return { label: txa('Gündüz okuru'), hint: txa('Öğle arası bölüm bitiriyor'), icon: Sun }
  if (best >= 17 && best < 22) return { label: txa('Akşam okuru'), hint: txa('Günün sonunda okumayı seviyor'), icon: SunHorizon }
  return { label: txa('Gece kuşu'), hint: txa('En çok gece yarısı okuyor'), icon: Moon }
}

function SummaryHero({ user, summary }: { user: MockUser, summary: ProfileReadingSummary | null }) {
  const chapters = summary?.chaptersRead ?? user.stats.totalChaptersRead ?? 0
  const persona = summary ? readerPersona(summary.hourly) : null
  const last = summary?.lastReadAt ? new Date(summary.lastReadAt).toLocaleDateString(intlLocale(), { day: 'numeric', month: 'long' }) : null
  return (
    <section className='relative isolate overflow-hidden rounded-[20px] border border-border/70 bg-card/60 p-5 sm:p-6'>
      <span aria-hidden className='absolute -right-20 -top-24 -z-10 size-72 rounded-full bg-primary/20 blur-3xl' />
      <span aria-hidden className='absolute -bottom-28 left-1/3 -z-10 size-64 rounded-full bg-violet-500/10 blur-3xl' />
      <div className='flex flex-col gap-6 md:flex-row md:items-end md:justify-between'>
        <div className='min-w-0'>
          <span className='text-[11px] font-extrabold uppercase tracking-[0.16em] text-muted-foreground'>{txa('Toplam okuma')}</span>
          <div className='mt-2 flex items-baseline gap-2.5'>
            <span className='text-5xl font-black leading-none tracking-tighter tabular-nums sm:text-6xl'>{fmt(chapters)}</span>
            <span className='text-base font-bold text-muted-foreground'>{txa('bölüm')}</span>
          </div>
          <p className='mt-3 text-[13.5px] text-muted-foreground'>
            <b className='text-foreground'>{fmt(summary?.seriesRead ?? user.following.length)}</b>{' '}{txa('seride,')}{' '}
            <b className='text-foreground'>{fmt(summary?.activeDays ?? 0)}</b>{txa(' farklı günde okudu')}
            {last ? <> {txa('· son okuma')} <b className='text-foreground'>{last}</b></> : null}
          </p>
        </div>
        {persona && (
          <div className='flex flex-none items-center gap-3 rounded-2xl border border-border/70 bg-background/50 px-4 py-3 backdrop-blur'>
            <span className='flex size-10 items-center justify-center rounded-xl bg-amber-400/15 text-amber-300'><persona.icon weight='fill' size={20} /></span>
            <span>
              <span className='block text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground'>{txa('Okuma kişiliği')}</span>
              <span className='block text-[15px] font-black'>{persona.label}</span>
              <span className='block text-[11.5px] text-muted-foreground'>{persona.hint}</span>
            </span>
          </div>
        )}
      </div>
      <div className='mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4'>
        <StatTile icon={Fire} tone='amber' label={txa('Güncel seri')} value={txa('{v1} gün', { v1: summary?.currentStreak ?? 0 })} sub={(summary?.currentStreak ?? 0) > 0 ? txa('Seri devam ediyor') : txa('Bugün okuyarak başlat')} />
        <StatTile icon={Ranking} tone='rose' label={txa('En uzun seri')} value={txa('{v1} gün', { v1: summary?.longestStreak ?? 0 })} sub={txa('art arda okuma')} />
        <StatTile icon={CalendarCheck} tone='emerald' label={txa('Aktif gün')} value={fmt(summary?.activeDays ?? 0)} sub={txa('okuma yapılan gün')} />
        <StatTile icon={Stack} tone='violet' label={txa('Takipte')} value={fmt(user.following.length)} sub={txa('seri takip ediliyor')} />
      </div>
    </section>
  )
}

function Heatmap({ daily }: { daily: ProfileReadingSummary['daily'] }) {
  if (!daily.length) return null
  // Weeks start Monday: empty cells up to the first day's weekday index.
  const first = new Date(`${daily[0].day}T00:00:00`)
  const lead = (first.getDay() + 6) % 7
  const cells: Array<ProfileReadingSummary['daily'][number] | null> = [...Array.from({ length: lead }, () => null), ...daily]
  const max = Math.max(1, ...daily.map((entry) => entry.chapters))
  const weeks = Math.ceil(cells.length / 7)
  const level = (value: number) => (value === 0 ? 0 : Math.min(4, Math.ceil((value / max) * 4)))
  const shade = ['bg-foreground/[0.06]', 'bg-primary/30', 'bg-primary/50', 'bg-primary/75', 'bg-primary']
  const monthLabels: Array<{ week: number, label: string }> = []
  for (let week = 0; week < weeks; week += 1) {
    const cell = cells.slice(week * 7, week * 7 + 7).find((entry) => entry && entry.day.endsWith('-01')) ?? (week === 0 ? cells.find(Boolean) : null)
    if (cell) monthLabels.push({ week, label: txa(MONTHS[Number(cell.day.slice(5, 7)) - 1]) })
  }
  const total = daily.reduce((sum, entry) => sum + entry.chapters, 0)
  const days = daily.filter((entry) => entry.chapters > 0).length
  const last30 = daily.slice(-30).reduce((sum, entry) => sum + entry.chapters, 0)
  const last7 = daily.slice(-7).reduce((sum, entry) => sum + entry.chapters, 0)
  const peak = daily.reduce((best, entry) => (entry.chapters > best.chapters ? entry : best), daily[0])
  const facts = [
    { label: txa('Son 7 gün'), value: txa('{v1} bölüm', { v1: fmt(last7) }) },
    { label: txa('Son 30 gün'), value: txa('{v1} bölüm', { v1: fmt(last30) }) },
    { label: txa('En yoğun gün'), value: peak.chapters ? `${new Date(`${peak.day}T00:00:00`).toLocaleDateString(intlLocale(), { day: 'numeric', month: 'short' })} · ${peak.chapters}` : '—' },
  ]
  return (
    <Panel title={txa('Okuma takvimi')} icon={CalendarBlank} tone='emerald' meta={txa('Son 26 hafta · {v1} bölüm, {v2} gün', { v1: fmt(total), v2: days })} testId='profile-reading-heatmap'>
      <div className='flex flex-col gap-5 xl:flex-row xl:items-start'>
      <div className='min-w-0 flex-1'>
      <div className='overflow-x-auto pb-1'>
        <div className='flex min-w-[520px] gap-2'>
          <div className='flex w-7 flex-none flex-col text-[10px] font-semibold text-muted-foreground'>
            <span className='h-5' />
            <div className='grid flex-1 grid-rows-7 gap-[3px]'>
              {WEEKDAYS.map((day, index) => <span key={day} className='flex items-center'>{index % 2 === 0 ? txa(day) : ''}</span>)}
            </div>
          </div>
          <div className='min-w-0 flex-1'>
            <div className='relative h-5 text-[10.5px] font-semibold text-muted-foreground'>
              {monthLabels.map((entry) => (
                <span key={`${entry.week}-${entry.label}`} className='absolute top-0' style={{ left: `${(entry.week / weeks) * 100}%` }}>{entry.label}</span>
              ))}
            </div>
            <div className='grid grid-flow-col grid-rows-7 gap-[3px]' style={{ gridTemplateColumns: `repeat(${weeks}, minmax(0, 1fr))` }}>
              {cells.map((entry, index) => (
                <span
                  key={entry?.day ?? `lead-${index}`}
                  className={cn('aspect-square w-full rounded-[4px] transition-transform hover:scale-125', entry ? shade[level(entry.chapters)] : 'bg-transparent')}
                  title={entry ? `${new Date(`${entry.day}T00:00:00`).toLocaleDateString(intlLocale(), { day: 'numeric', month: 'long' })}: ${txa('{v1} bölüm', { v1: entry.chapters })}` : undefined}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
        <div className='mt-3 flex items-center gap-1.5 text-[10.5px] text-muted-foreground'>
          {txa('Az')}
          {shade.map((tone) => <span key={tone} className={cn('size-[11px] rounded-[3px]', tone)} />)}
          {txa('Çok')}
        </div>
      </div>
      <dl className='grid flex-none grid-cols-3 gap-2 xl:w-44 xl:grid-cols-1'>
        {facts.map((fact) => (
          <div key={fact.label} className='rounded-xl bg-background/50 px-3.5 py-2.5'>
            <dt className='text-[11px] font-semibold text-muted-foreground'>{fact.label}</dt>
            <dd className='text-[13px] font-black tabular-nums sm:text-[15px]'>{fact.value}</dd>
          </div>
        ))}
      </dl>
      </div>
    </Panel>
  )
}

function MonthlyChart({ monthly }: { monthly: ProfileReadingSummary['monthly'] }) {
  const max = Math.max(1, ...monthly.map((entry) => entry.chapters))
  const total = monthly.reduce((sum, entry) => sum + entry.chapters, 0)
  const average = monthly.length ? total / monthly.length : 0
  return (
    <Panel title={txa('Aylık okuma')} icon={ChartBar} meta={txa('Son 6 ay · ayda ortalama {v1} bölüm', { v1: Math.round(average) })} testId='profile-monthly-chart'>
      <div className='flex gap-2.5 sm:gap-4'>
        {monthly.map((entry) => (
          <span key={entry.month} className={cn('flex-1 text-center text-[11.5px] font-extrabold tabular-nums', entry.chapters === max && entry.chapters > 0 ? 'text-primary' : 'text-muted-foreground')}>{entry.chapters}</span>
        ))}
      </div>
      <div className='relative mt-1.5 flex h-32 items-end gap-2.5 sm:gap-4'>
        {average > 0 && (
          <span aria-hidden className='pointer-events-none absolute inset-x-0 z-10 border-t border-dashed border-primary/50' style={{ bottom: `${(average / max) * 100}%` }} />
        )}
        {monthly.map((entry) => {
          const isMax = entry.chapters === max && entry.chapters > 0
          return (
            <span key={entry.month} className='flex h-full flex-1 items-end justify-center' title={txa('{v1} bölüm', { v1: entry.chapters })}>
              <span
                className={cn(
                  'w-full max-w-[48px] rounded-t-[10px] transition-all duration-500',
                  isMax ? 'bg-gradient-to-t from-primary/70 to-primary shadow-[0_0_24px_-6px_hsl(var(--primary)/0.8)]' : 'bg-gradient-to-t from-foreground/[0.06] to-foreground/[0.18]',
                )}
                style={{ height: `${Math.max(entry.chapters ? 6 : 2, (entry.chapters / max) * 100)}%` }}
              />
            </span>
          )
        })}
      </div>
      <div className='mt-2 flex gap-2.5 sm:gap-4'>
        {monthly.map((entry, index) => {
          const [, month] = entry.month.split('-')
          return <span key={entry.month} className={cn('flex-1 text-center text-[11px] font-semibold', index === monthly.length - 1 ? 'text-foreground' : 'text-muted-foreground')}>{MONTHS[Number(month) - 1] ?? month}</span>
        })}
      </div>
    </Panel>
  )
}

function Rhythm({ weekdays, hourly }: { weekdays: number[], hourly: number[] }) {
  const weekMax = Math.max(1, ...weekdays)
  const hourMax = Math.max(1, ...hourly)
  const topDay = weekdays.some((value) => value > 0) ? txa(WEEKDAYS[weekdays.indexOf(Math.max(...weekdays))]) : null
  return (
    <Panel title={txa('Okuma ritmi')} icon={Clock} tone='sky' meta={topDay ? txa('En çok {v1} günleri okuyor', { v1: topDay }) : txa('Henüz yeterli veri yok')}>
      <div className='flex flex-col gap-5'>
        <div className='grid grid-cols-7 gap-2'>
          {WEEKDAYS.map((day, index) => {
            const value = weekdays[index] ?? 0
            return (
              <div key={day} className='flex flex-col items-center gap-1.5' title={txa('{v1} bölüm', { v1: value })}>
                <span className='flex h-20 w-full items-end overflow-hidden rounded-lg bg-foreground/[0.05]'>
                  <span className={cn('block w-full rounded-lg', value === weekMax && value > 0 ? 'bg-sky-400' : 'bg-sky-400/35')} style={{ height: `${(value / weekMax) * 100}%` }} />
                </span>
                <span className='text-[11px] font-semibold text-muted-foreground'>{txa(day)}</span>
              </div>
            )
          })}
        </div>
        <div>
          <div className='flex h-10 items-end gap-[3px]'>
            {Array.from({ length: 24 }, (_, hour) => {
              const value = hourly[hour] ?? 0
              return <span key={hour} className='flex-1 rounded-sm bg-violet-400/60' style={{ height: `${Math.max(value ? 12 : 4, (value / hourMax) * 100)}%`, opacity: value ? 1 : 0.35 }} title={txa('{v1}:00 · {v2} bölüm', { v1: String(hour).padStart(2, '0'), v2: value })} />
            })}
          </div>
          <div className='mt-1.5 flex justify-between text-[10.5px] font-semibold text-muted-foreground'>
            <span>00</span><span>06</span><span>12</span><span>18</span><span>23</span>
          </div>
        </div>
      </div>
    </Panel>
  )
}

function TopSeries({ series }: { series: ProfileReadingSummary['topSeries'] }) {
  const max = Math.max(1, ...series.map((entry) => entry.chapters))
  return (
    <Panel title={txa('En çok okunan seriler')} icon={Ranking} tone='rose' meta={txa('Okunan bölüm sayısına göre')}>
      <ol className='grid gap-x-6 gap-y-1 md:grid-cols-2'>
        {series.map((entry, index) => (
          <li key={entry.id}>
            <Link to={buildPublicMangaPath({ id: entry.id, slug: entry.slug ?? undefined, title: entry.title })} className='group flex items-center gap-3 rounded-xl px-1 py-2 text-inherit'>
              <span className={cn('w-5 flex-none text-center text-lg font-black tabular-nums', index === 0 ? 'text-primary' : 'text-muted-foreground/60')}>{index + 1}</span>
              <img src={profileCover(entry.coverImage, entry.title, 96)} alt='' className='h-12 w-9 flex-none rounded-md object-cover' />
              <span className='flex min-w-0 flex-1 flex-col gap-1.5'>
                <span className='flex items-baseline justify-between gap-2'>
                  <span className='truncate text-[13px] font-bold group-hover:text-primary'>{entry.title}</span>
                  <span className='flex-none text-[11.5px] font-bold tabular-nums text-muted-foreground'>{txa('{v1} bölüm', { v1: entry.chapters })}</span>
                </span>
                <Meter percent={(entry.chapters / max) * 100} className='h-1' barClassName={index === 0 ? undefined : 'from-foreground/40 to-foreground/25'} />
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </Panel>
  )
}

function GenreSplit({ genres }: { genres: NonNullable<MockUser['favoriteGenres']> }) {
  const palette = ['bg-primary', 'bg-violet-400', 'bg-sky-400', 'bg-emerald-400', 'bg-amber-400', 'bg-rose-400']
  const top = genres.slice(0, 6)
  return (
    <Panel title={txa('Tür dağılımı')} icon={Sparkle} tone='violet' meta={top[0] ? txa('{v1} ağırlıklı', { v1: top[0].name }) : undefined}>
      {top.length ? (
        <div className='flex flex-col gap-4'>
          <div className='flex h-3 overflow-hidden rounded-full bg-foreground/[0.06]'>
            {top.map((genre, index) => <span key={genre.name} className={palette[index]} style={{ width: `${genre.percent}%` }} title={`${genre.name} %${genre.percent}`} />)}
          </div>
          <ul className='grid grid-cols-2 gap-x-4 gap-y-2.5'>
            {top.map((genre, index) => (
              <li key={genre.name} className='flex items-center gap-2 text-[13px]'>
                <span className={cn('size-2.5 flex-none rounded-full', palette[index])} />
                <span className='min-w-0 flex-1 truncate font-semibold'>{genre.name}</span>
                <span className='font-bold tabular-nums text-muted-foreground'>{txa('%{v1}', { v1: genre.percent })}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : <PanelEmpty icon={Sparkle} title={txa('Tür verisi yok')} hint={txa('Okudukça en sevdiğin türler burada belirir.')} />}
    </Panel>
  )
}

function CommunityTrace({ user }: { user: MockUser }) {
  const rows: Array<{ icon: typeof Heart, tone: string, label: string, value: string }> = [
    { icon: ChatCircle, tone: 'text-amber-300', label: txa('Yorum'), value: fmt(user.stats.comments ?? 0) },
    { icon: UsersThree, tone: 'text-violet-300', label: txa('Takip edilen ekip'), value: fmt(user.followingFansubs.length) },
  ]
  if (user.stats.timeSpentMinutes) rows.push({ icon: Clock, tone: 'text-sky-300', label: txa('Okuma süresi'), value: formatTimeSpent(user.stats.timeSpentMinutes) })
  return (
    <Panel title={txa('Topluluk izi')} icon={UsersThree} tone='amber'>
      <ul className='flex flex-col divide-y divide-border/60'>
        {rows.map((row) => (
          <li key={row.label} className='flex items-center gap-3 py-2.5 text-[13px]'>
            <row.icon weight='fill' size={16} className={row.tone} />
            <span className='flex-1 text-muted-foreground'>{row.label}</span>
            <span className='font-extrabold tabular-nums'>{row.value}</span>
          </li>
        ))}
      </ul>
    </Panel>
  )
}

export function ProfileStatsTab({ user, summary, loading, tasks }: {
  user: MockUser
  summary: ProfileReadingSummary | null
  loading: boolean
  tasks: ReactNode
}) {
  return (
    <div className='flex flex-col gap-5' data-testid='profile-stats-tab'>
      <SummaryHero user={user} summary={summary} />

      {summary ? (
        <>
          <Heatmap daily={summary.daily} />
          <div className='grid gap-5 lg:grid-cols-2'>
            <MonthlyChart monthly={summary.monthly} />
            <Rhythm weekdays={summary.weekdays} hourly={summary.hourly} />
          </div>
          {summary.topSeries.length > 0 && <TopSeries series={summary.topSeries} />}
        </>
      ) : (
        <PanelEmpty icon={ChartBar} title={loading ? txa('Okuma verisi yükleniyor…') : txa('Okuma verisi yok')} />
      )}

      <div className='grid gap-5 lg:grid-cols-2'>
        <GenreSplit genres={user.favoriteGenres ?? []} />
        <CommunityTrace user={user} />
      </div>
      {tasks}
    </div>
  )
}
