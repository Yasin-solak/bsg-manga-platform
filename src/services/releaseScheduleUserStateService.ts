import { isE2EModeEnabled } from '@/testing/e2eMocks'
import { supabase } from './supabase'
import type { ReleaseScheduleEntry } from './releaseScheduleService'
import {
  entryDateKey,
  formatChapterNumber,
  formatTime,
  type CalendarReminder,
} from '@/pages/releaseSchedule/releaseSchedulePage.shared'
import { txa } from '@/i18n/activeLocale'

export type ReleaseScheduleUserStateMode = 'database' | 'local'

export type ReleaseScheduleUserState = {
  mode: ReleaseScheduleUserStateMode
  remindersByDate: Record<string, CalendarReminder[]>
  plannedChapterIds: string[]
}

type DbReleaseScheduleReminderRow = {
  id: string
  target_kind: 'chapter' | 'next_chapter'
  target_id: string
  manga_id: string
  chapter_id: string | null
  reminder_text: string | null
  created_at: string
}

type DbReadingPlanItemRow = {
  chapter_id: string
}

const REMINDERS_STORAGE_KEY = 'bsg-release-schedule-reminders:v1'
const READING_PLAN_STORAGE_KEY = 'bsg-release-schedule-reading-plan:v1'
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_STORED_READING_PLAN_ITEMS = 500
export const MAX_STORED_REMINDERS_PER_DAY = 50

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readStoredJson(key: string) {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function writeStoredRecord(key: string, value: unknown) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // localStorage tarayici politikalari veya kota nedeniyle kapanabilir; takvim bellekte calismayi surdurur.
  }
}

function isUuid(value: string) {
  return UUID_PATTERN.test(value)
}

function assertUuid(value: string, label: string) {
  if (!isUuid(value)) {
    throw new Error(`${label} gecersiz.`)
  }
}

function getUniqueValues(values: string[]) {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)))
}

function getUniqueUuidValues(values: string[]) {
  return getUniqueValues(values).filter(isUuid)
}

export function getReleaseScheduleUserStateMode(userId?: string | null): ReleaseScheduleUserStateMode {
  return userId && !isE2EModeEnabled() ? 'database' : 'local'
}

export function readStoredReminders() {
  const value = readStoredJson(REMINDERS_STORAGE_KEY)
  if (!isPlainRecord(value)) return {}

  return Object.entries(value).reduce<Record<string, CalendarReminder[]>>((acc, [dateKey, reminders]) => {
    if (!DATE_KEY_PATTERN.test(dateKey) || !Array.isArray(reminders)) return acc

    const normalized = reminders
      .filter(isPlainRecord)
      .map((reminder) => {
        const id = typeof reminder.id === 'string' ? reminder.id.trim().slice(0, 120) : ''
        const text = typeof reminder.text === 'string' ? reminder.text.trim().slice(0, 240) : ''
        const createdAt = typeof reminder.createdAt === 'string' ? reminder.createdAt.trim().slice(0, 40) : ''
        const scope = reminder.scope === 'chapter' || reminder.scope === 'next_chapter' ? reminder.scope : undefined
        const chapterId = typeof reminder.chapterId === 'string' ? reminder.chapterId.trim().slice(0, 120) : ''
        const mangaId = typeof reminder.mangaId === 'string' ? reminder.mangaId.trim().slice(0, 120) : ''

        return id && text && createdAt
          ? { id, text, createdAt, ...(scope ? { scope } : {}), ...(chapterId ? { chapterId } : {}), ...(mangaId ? { mangaId } : {}) }
          : null
      })
      .filter((reminder): reminder is CalendarReminder => Boolean(reminder))
      .slice(0, MAX_STORED_REMINDERS_PER_DAY)

    if (normalized.length > 0) acc[dateKey] = normalized
    return acc
  }, {})
}

export function writeStoredReminders(remindersByDate: Record<string, CalendarReminder[]>) {
  writeStoredRecord(REMINDERS_STORAGE_KEY, remindersByDate)
}

export function readStoredReadingPlan() {
  const value = readStoredJson(READING_PLAN_STORAGE_KEY)
  if (!Array.isArray(value)) return []

  return Array.from(
    new Set(
      value
        .filter((chapterId): chapterId is string => typeof chapterId === 'string' && chapterId.trim().length > 0)
        .map((chapterId) => chapterId.trim().slice(0, 120)),
    ),
  ).slice(0, MAX_STORED_READING_PLAN_ITEMS)
}

export function writeStoredReadingPlan(plannedChapterIds: string[]) {
  writeStoredRecord(READING_PLAN_STORAGE_KEY, plannedChapterIds)
}

export function getEntryReminderScope(entry: ReleaseScheduleEntry): NonNullable<CalendarReminder['scope']> {
  return entry.isUpcoming ? 'chapter' : 'next_chapter'
}

export function getEntryReminderTargetKey(entry: ReleaseScheduleEntry) {
  return getEntryReminderScope(entry) === 'chapter'
    ? `chapter:${entry.chapterId}`
    : `next:${entry.mangaId}`
}

export function getEntryReminderMatchTargetKeys(entry: ReleaseScheduleEntry) {
  const keys = [getEntryReminderTargetKey(entry)]
  if (entry.isUpcoming) keys.push(`next:${entry.mangaId}`)
  return keys
}

export function getReminderTargetKey(reminder: CalendarReminder) {
  if (reminder.scope === 'next_chapter' && reminder.mangaId) return `next:${reminder.mangaId}`
  if (reminder.chapterId) return `chapter:${reminder.chapterId}`
  if (reminder.mangaId) return `next:${reminder.mangaId}`
  return null
}

export function getEntryReminderId(dateKey: string, entry: ReleaseScheduleEntry) {
  return `${dateKey}:${getEntryReminderTargetKey(entry)}`.slice(0, 120)
}

export function buildEntryReminder(dateKey: string, entry: ReleaseScheduleEntry): CalendarReminder {
  const scope = getEntryReminderScope(entry)

  return {
    id: getEntryReminderId(dateKey, entry),
    scope,
    mangaId: entry.mangaId.slice(0, 120),
    ...(scope === 'chapter' ? { chapterId: entry.chapterId.slice(0, 120) } : {}),
    text: scope === 'chapter'
      ? `${formatTime(entry.publishAt)} - ${entry.mangaTitle} ${txa('{v1}. bolum', { v1: formatChapterNumber(entry.chapterNumber) })}`
      : txa('Yeni bolum gelince - {v1}', { v1: entry.mangaTitle }),
    createdAt: new Date().toISOString(),
  }
}

export function entryHasReminderTarget(reminderTargetKeys: Iterable<string>, entry: ReleaseScheduleEntry) {
  const targetKeySet = reminderTargetKeys instanceof Set ? reminderTargetKeys : new Set(reminderTargetKeys)
  return getEntryReminderMatchTargetKeys(entry).some((targetKey) => targetKeySet.has(targetKey))
}

export function findReminderForEntry(reminders: CalendarReminder[], entry: ReleaseScheduleEntry) {
  const primaryTargetKey = getEntryReminderTargetKey(entry)
  const matchTargetKeys = new Set(getEntryReminderMatchTargetKeys(entry))
  return reminders.find((reminder) => getReminderTargetKey(reminder) === primaryTargetKey)
    || reminders.find((reminder) => {
      const targetKey = getReminderTargetKey(reminder)
      return targetKey ? matchTargetKeys.has(targetKey) : false
    })
    || null
}

function extractTargetId(targetKey: string) {
  const [, targetId] = targetKey.split(':')
  return targetId || ''
}

function mapDbReminderRow(row: DbReleaseScheduleReminderRow, fallbackEntry?: ReleaseScheduleEntry): CalendarReminder {
  const fallback = fallbackEntry ? buildEntryReminder(entryDateKey(fallbackEntry), fallbackEntry) : null

  return {
    id: row.id,
    scope: row.target_kind,
    mangaId: row.manga_id,
    ...(row.target_kind === 'chapter' && row.chapter_id ? { chapterId: row.chapter_id } : {}),
    text: row.reminder_text?.trim() || fallback?.text || 'Takvim hatirlaticisi',
    createdAt: row.created_at,
  }
}

function mapDbRemindersToDates(rows: DbReleaseScheduleReminderRow[], entries: ReleaseScheduleEntry[]) {
  const entriesByTargetKey = new Map<string, ReleaseScheduleEntry[]>()

  entries.forEach((entry) => {
    getEntryReminderMatchTargetKeys(entry).forEach((targetKey) => {
      entriesByTargetKey.set(targetKey, [...(entriesByTargetKey.get(targetKey) || []), entry])
    })
  })

  return rows.reduce<Record<string, CalendarReminder[]>>((acc, row) => {
    const targetKey = row.target_kind === 'chapter'
      ? `chapter:${row.target_id}`
      : `next:${row.target_id}`
    const matchedEntries = entriesByTargetKey.get(targetKey) || []

    matchedEntries.forEach((entry) => {
      const dateKey = entryDateKey(entry)
      if (dateKey === 'invalid') return

      const current = acc[dateKey] || []
      if (current.some((reminder) => reminder.id === row.id)) return
      acc[dateKey] = [...current, mapDbReminderRow(row, entry)]
    })

    return acc
  }, {})
}

export async function loadReleaseScheduleUserState({
  userId,
  entries,
}: {
  userId?: string | null
  entries: ReleaseScheduleEntry[]
}): Promise<ReleaseScheduleUserState> {
  const mode = getReleaseScheduleUserStateMode(userId)
  if (mode === 'local') {
    return {
      mode,
      remindersByDate: readStoredReminders(),
      plannedChapterIds: readStoredReadingPlan(),
    }
  }

  const safeUserId = userId || ''
  assertUuid(safeUserId, 'Kullanici')

  const chapterIds = getUniqueUuidValues(entries.map((entry) => entry.chapterId))
  const reminderTargetIds = getUniqueUuidValues(
    entries.flatMap((entry) => getEntryReminderMatchTargetKeys(entry).map(extractTargetId)),
  )

  const [remindersResult, planResult] = await Promise.all([
    reminderTargetIds.length > 0
      ? supabase
        .from('release_schedule_reminders')
        .select('id, target_kind, target_id, manga_id, chapter_id, reminder_text, created_at')
        .eq('user_id', safeUserId)
        .in('target_id', reminderTargetIds)
      : Promise.resolve({ data: [], error: null }),
    chapterIds.length > 0
      ? supabase
        .from('user_reading_plan_items')
        .select('chapter_id')
        .eq('user_id', safeUserId)
        .in('chapter_id', chapterIds)
      : Promise.resolve({ data: [], error: null }),
  ])

  if (remindersResult.error) throw remindersResult.error
  if (planResult.error) throw planResult.error

  return {
    mode,
    remindersByDate: mapDbRemindersToDates(
      (remindersResult.data || []) as DbReleaseScheduleReminderRow[],
      entries,
    ),
    plannedChapterIds: ((planResult.data || []) as DbReadingPlanItemRow[])
      .map((row) => row.chapter_id)
      .filter(Boolean),
  }
}

export async function saveReleaseScheduleReminderEntries({
  userId,
  entries,
}: {
  userId: string
  entries: ReleaseScheduleEntry[]
}) {
  assertUuid(userId, 'Kullanici')
  if (entries.length === 0) return

  const rows = entries.map((entry) => {
    assertUuid(entry.mangaId, 'Manga')
    assertUuid(entry.chapterId, 'Bolum')

    const scope = getEntryReminderScope(entry)
    const reminder = buildEntryReminder(entryDateKey(entry), entry)
    return {
      user_id: userId,
      target_kind: scope,
      target_id: scope === 'chapter' ? entry.chapterId : entry.mangaId,
      manga_id: entry.mangaId,
      chapter_id: scope === 'chapter' ? entry.chapterId : null,
      reminder_text: reminder.text.slice(0, 240),
      notification_due_at: scope === 'chapter' ? entry.publishAt : null,
      notification_status: 'queued',
    }
  })

  const { error } = await supabase
    .from('release_schedule_reminders')
    .upsert(rows, { onConflict: 'user_id,target_kind,target_id' })

  if (error) throw error
}

export async function deleteReleaseScheduleReminder({
  userId,
  reminderId,
}: {
  userId: string
  reminderId: string
}) {
  assertUuid(userId, 'Kullanici')
  assertUuid(reminderId, 'Hatirlatici')

  const { error } = await supabase
    .from('release_schedule_reminders')
    .delete()
    .eq('user_id', userId)
    .eq('id', reminderId)

  if (error) throw error
}

export async function saveReadingPlanEntry({
  userId,
  entry,
}: {
  userId: string
  entry: ReleaseScheduleEntry
}) {
  assertUuid(userId, 'Kullanici')
  assertUuid(entry.mangaId, 'Manga')
  assertUuid(entry.chapterId, 'Bolum')

  const { error } = await supabase
    .from('user_reading_plan_items')
    .upsert({
      user_id: userId,
      manga_id: entry.mangaId,
      chapter_id: entry.chapterId,
      source: 'release_schedule',
      release_publish_at: entry.publishAt,
    }, { onConflict: 'user_id,chapter_id' })

  if (error) throw error
}

export async function deleteReadingPlanEntry({
  userId,
  chapterId,
}: {
  userId: string
  chapterId: string
}) {
  assertUuid(userId, 'Kullanici')
  assertUuid(chapterId, 'Bolum')

  const { error } = await supabase
    .from('user_reading_plan_items')
    .delete()
    .eq('user_id', userId)
    .eq('chapter_id', chapterId)

  if (error) throw error
}
