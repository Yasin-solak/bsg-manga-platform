import type { ReleaseScheduleEntry } from '@/services/releaseScheduleService'
import { formatChapterNumber, toDateKey } from './releaseSchedulePage.shared'
import { intlLocale, txa } from '@/i18n/activeLocale'

/*
 * Weekly release calendar (desktop prototype v3 "Schedule"): Mon-Sun columns, an hour axis,
 * releases at the same hour in one card. Same series + same hour merge:
 * - several chapters -> "N chapters" (Ch. a-b)
 * - same chapter from several teams -> "N translations" (team labels)
 * Pure functions; the desktop grid and mobile day list use the same model.
 */

export type ReleaseWeekFilter = 'all' | 'mine' | 'plan' | 'rem'

export const RELEASE_WEEK_FILTERS: Array<{ id: ReleaseWeekFilter, label: string }> = [
  { id: 'all', get label() { return txa('Tüm yayınlar') } },
  { id: 'mine', get label() { return txa('Takip ettiğim ekipler') } },
  { id: 'plan', get label() { return txa('Planım') } },
  { id: 'rem', get label() { return txa('Hatırlatmalarım') } },
]

export const HOUR_PX = 48
const DAY_MS = 86_400_000
const WEEKDAYS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz']
const WEEKDAYS_LONG = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar']
const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']

export interface ReleaseTeam { id?: string, name: string, slug?: string }

export interface ReleaseWeekItem {
  key: string
  /** Representative chapter for reminder / plan / link (smallest number). */
  entry: ReleaseScheduleEntry
  entries: ReleaseScheduleEntry[]
  at: number
  time: string
  title: string
  cover?: string
  chapterLabel: string
  batch: number
  teams: ReleaseTeam[]
  released: boolean
  reminded: boolean
  planned: boolean
}

export interface ReleaseWeekGroup {
  time: string
  top: number
  height: number
  items: ReleaseWeekItem[]
  tone: 'rem' | 'plan' | 'none'
}

export interface ReleaseWeekDay {
  key: string
  date: Date
  weekday: string
  weekdayLong: string
  day: number
  isToday: boolean
  items: ReleaseWeekItem[]
  groups: ReleaseWeekGroup[]
}

export interface ReleaseWeek {
  start: Date
  end: Date
  title: string
  note: string
  days: ReleaseWeekDay[]
  hours: Array<{ label: string, top: number }>
  startHour: number
  axisHeight: number
  nowTop: number | null
  total: number
  planTotal: number
  remTotal: number
  next: ReleaseWeekItem | null
}

export function startOfWeek(date: Date, offsetWeeks = 0) {
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate() - ((date.getDay() + 6) % 7) + offsetWeeks * 7)
  return monday
}

export function weekTitle(start: Date) {
  const end = new Date(start.getTime() + 6 * DAY_MS)
  if (start.getMonth() === end.getMonth()) return `${start.getDate()}–${end.getDate()} ${txa(MONTHS[start.getMonth()])} ${start.getFullYear()}`
  return `${start.getDate()} ${txa(MONTHS[start.getMonth()]).slice(0, 3)} – ${end.getDate()} ${txa(MONTHS[end.getMonth()]).slice(0, 3)} ${end.getFullYear()}`
}

export function weekNote(offset: number) {
  if (offset === 0) return txa('Bu hafta')
  if (offset === 1) return txa('Gelecek hafta')
  if (offset === -1) return txa('Geçen hafta')
  return txa('{note} hafta', { note: `${offset > 0 ? '+' : ''}${offset}` })
}

/** Bugunden hedef tarihe kac hafta (Pazartesi baslangicli). */
export function weekOffsetOf(target: Date, now: Date) {
  return Math.round((startOfWeek(target).getTime() - startOfWeek(now).getTime()) / (7 * DAY_MS))
}

const two = (value: number) => String(value).padStart(2, '0')
const timeOf = (date: Date) => `${two(date.getHours())}:${two(date.getMinutes())}`

function chapterRange(entries: ReleaseScheduleEntry[]) {
  const numbers = [...new Set(entries.map((entry) => entry.chapterNumber))].sort((a, b) => a - b)
  if (numbers.length <= 1) return { label: txa('Böl. {number}', { number: formatChapterNumber(numbers[0]) }), count: numbers.length }
  return { label: txa('Böl. {start}–{end}', { start: formatChapterNumber(numbers[0]), end: formatChapterNumber(numbers[numbers.length - 1]) }), count: numbers.length }
}

function uniqueTeams(entries: ReleaseScheduleEntry[]): ReleaseTeam[] {
  const seen = new Map<string, ReleaseTeam>()
  for (const entry of entries) {
    const key = entry.fansubId ?? entry.fansubName ?? ''
    if (!key || seen.has(key)) continue
    seen.set(key, { id: entry.fansubId, name: entry.fansubName ?? txa('Fansub'), slug: entry.fansubSlug })
  }
  return [...seen.values()]
}

/** Card height: one release 96 (+20 multi team), group 30 + 58 per row (+18). */
function groupHeight(items: ReleaseWeekItem[]) {
  if (items.length === 1) return 96 + (items[0].teams.length > 1 ? 20 : 0)
  return 30 + items.reduce((sum, item) => sum + (item.teams.length > 1 ? 76 : 58), 0)
}

export interface BuildWeekOptions {
  offset: number
  now: Date
  filter: ReleaseWeekFilter
  followedFansubIds: ReadonlySet<string>
  plannedChapterIds: ReadonlySet<string>
  isReminded: (entry: ReleaseScheduleEntry) => boolean
}

export function buildReleaseWeek(entries: ReleaseScheduleEntry[], options: BuildWeekOptions): ReleaseWeek {
  const start = startOfWeek(options.now, options.offset)
  const end = new Date(start.getTime() + 7 * DAY_MS)
  const nowMs = options.now.getTime()
  const todayKey = toDateKey(options.now)

  // Series + hour merge (same moment, same series: bulk chapters or multiple translations).
  const merged = new Map<string, ReleaseScheduleEntry[]>()
  for (const entry of entries) {
    const at = new Date(entry.publishAt)
    if (Number.isNaN(at.getTime()) || at < start || at >= end) continue
    const key = `${entry.mangaId}|${at.getTime()}`
    merged.set(key, [...(merged.get(key) ?? []), entry])
  }

  const items: ReleaseWeekItem[] = []
  for (const [key, group] of merged) {
    const sorted = [...group].sort((a, b) => a.chapterNumber - b.chapterNumber)
    const entry = sorted[0]
    const at = new Date(entry.publishAt)
    const range = chapterRange(sorted)
    const teams = uniqueTeams(sorted)
    const item: ReleaseWeekItem = {
      key,
      entry,
      entries: sorted,
      at: at.getTime(),
      time: timeOf(at),
      title: entry.mangaTitle,
      cover: entry.mangaCoverImageUrl,
      chapterLabel: range.label,
      batch: range.count,
      teams,
      released: at.getTime() <= nowMs,
      reminded: sorted.some(options.isReminded),
      planned: sorted.every((row) => options.plannedChapterIds.has(row.chapterId)),
    }
    if (options.filter === 'mine' && !teams.some((team) => team.id && options.followedFansubIds.has(team.id))) continue
    if (options.filter === 'plan' && !item.planned) continue
    if (options.filter === 'rem' && !item.reminded) continue
    items.push(item)
  }
  items.sort((a, b) => a.at - b.at || a.title.localeCompare(b.title, intlLocale()))

  // Hour axis: 10:00-24:00 in the prototype; the axis widens for earlier releases.
  const earliest = items.reduce((min, item) => Math.min(min, new Date(item.at).getHours()), 10)
  const startHour = Math.max(0, Math.min(10, earliest))
  const hourCount = 24 - startHour + 1
  const topOf = (date: Date) => Math.max(0, Math.round(((date.getHours() * 60 + date.getMinutes()) - startHour * 60) / 60 * HOUR_PX))

  let axisHeight = (hourCount - 1) * HOUR_PX
  const days: ReleaseWeekDay[] = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index)
    const key = toDateKey(date)
    const dayItems = items.filter((item) => toDateKey(new Date(item.at)) === key)
    const byTime = new Map<string, ReleaseWeekItem[]>()
    for (const item of dayItems) byTime.set(item.time, [...(byTime.get(item.time) ?? []), item])
    let floor = 0
    const groups: ReleaseWeekGroup[] = [...byTime.entries()].map(([time, groupItems]) => {
      const height = groupHeight(groupItems)
      // Cards at nearby hours do not overlap; the next card shifts down.
      const top = Math.max(topOf(new Date(groupItems[0].at)), floor)
      floor = top + height + 6
      return {
        time,
        top,
        height,
        items: groupItems,
        tone: groupItems.some((item) => item.reminded) ? 'rem' : groupItems.some((item) => item.planned) ? 'plan' : 'none',
      }
    })
    axisHeight = Math.max(axisHeight, floor)
    return {
      key,
      date,
      weekday: txa(WEEKDAYS[index]),
      weekdayLong: txa(WEEKDAYS_LONG[index]),
      day: date.getDate(),
      isToday: key === todayKey,
      items: dayItems,
      groups,
    }
  })

  const upcoming = items.filter((item) => !item.released)
  // The "Now" line draws only in this week and inside the hour axis.
  const inThisWeek = nowMs >= start.getTime() && nowMs < end.getTime() && options.now.getHours() >= startHour
  return {
    start,
    end,
    title: weekTitle(start),
    note: weekNote(options.offset),
    days,
    hours: Array.from({ length: hourCount }, (_, index) => ({ label: `${two(startHour + index)}:00`, top: index * HOUR_PX })),
    startHour,
    axisHeight,
    nowTop: inThisWeek ? topOf(options.now) : null,
    total: items.reduce((sum, item) => sum + item.entries.length, 0),
    planTotal: items.filter((item) => item.planned).length,
    remTotal: items.filter((item) => item.reminded).length,
    next: upcoming[0] ?? null,
  }
}

/** "Mon 19:00" / "Today 19:00" / "Tomorrow 19:00" / "3 Oct 19:00". */
export function formatWhen(at: number, now: Date) {
  const date = new Date(at)
  const dayDiff = Math.round((new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
    - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / DAY_MS)
  const time = timeOf(date)
  if (dayDiff === 0) return txa('Bugün {time}', { time })
  if (dayDiff === 1) return txa('Yarın {time}', { time })
  if (dayDiff > 1 && dayDiff < 7) return `${txa(WEEKDAYS[(date.getDay() + 6) % 7])} ${time}`
  return `${date.getDate()} ${txa(MONTHS[date.getMonth()]).slice(0, 3)} ${time}`
}
