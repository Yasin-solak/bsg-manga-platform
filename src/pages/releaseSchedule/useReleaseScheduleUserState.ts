import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReleaseScheduleEntry } from '@/services/releaseScheduleService'
import {
  buildEntryReminder,
  deleteReadingPlanEntry,
  deleteReleaseScheduleReminder,
  findReminderForEntry,
  getReleaseScheduleUserStateMode,
  loadReleaseScheduleUserState,
  MAX_STORED_REMINDERS_PER_DAY,
  readStoredReadingPlan,
  readStoredReminders,
  saveReadingPlanEntry,
  saveReleaseScheduleReminderEntries,
  writeStoredReadingPlan,
  writeStoredReminders,
} from '@/services/releaseScheduleUserStateService'
import { toast } from '@/services/toastService'
import { createScopedLogger } from '@/services/logger'
import { entryDateKey, type CalendarReminder } from './releaseSchedulePage.shared'
import { txa } from '@/i18n/activeLocale'

const logger = createScopedLogger('releaseSchedule.userState')

function removeReminderFromAllDates(remindersByDate: Record<string, CalendarReminder[]>, reminderId: string) {
  return Object.entries(remindersByDate).reduce<Record<string, CalendarReminder[]>>((acc, [dateKey, reminders]) => {
    const next = reminders.filter((reminder) => reminder.id !== reminderId)
    if (next.length > 0) acc[dateKey] = next
    return acc
  }, {})
}

/**
 * Schedule reminders and reading plan: the database when signed in, otherwise the browser
 * (local). Changes reflect on screen instantly; rolled back if saving fails.
 */
export function useReleaseScheduleUserState(userId: string | null, entries: ReleaseScheduleEntry[]) {
  const [remindersByDate, setRemindersByDate] = useState<Record<string, CalendarReminder[]>>(() => readStoredReminders())
  const [plannedChapterIds, setPlannedChapterIds] = useState<string[]>(() => readStoredReadingPlan())

  const refresh = useCallback(async () => {
    const state = await loadReleaseScheduleUserState({ userId, entries })
    setRemindersByDate(state.remindersByDate)
    setPlannedChapterIds(state.plannedChapterIds)
  }, [entries, userId])

  useEffect(() => {
    let cancelled = false
    loadReleaseScheduleUserState({ userId, entries })
      .then((state) => {
        if (cancelled) return
        setRemindersByDate(state.remindersByDate)
        setPlannedChapterIds(state.plannedChapterIds)
      })
      .catch((error: unknown) => {
        if (cancelled) return
        logger.warn('takip verileri yuklenemedi', { error })
        toast.error(txa('Takvim takip verileri yüklenemedi.'))
      })
    return () => { cancelled = true }
  }, [entries, userId])

  const plannedSet = useMemo(() => new Set(plannedChapterIds), [plannedChapterIds])
  const isReminded = useCallback(
    (entry: ReleaseScheduleEntry) => Boolean(findReminderForEntry(remindersByDate[entryDateKey(entry)] ?? [], entry)),
    [remindersByDate],
  )

  const toggleReminder = useCallback(async (entry: ReleaseScheduleEntry) => {
    const dateKey = entryDateKey(entry)
    const previous = remindersByDate
    const current = previous[dateKey] ?? []
    const existing = findReminderForEntry(current, entry)
    const next = existing
      ? removeReminderFromAllDates(previous, existing.id)
      : { ...previous, [dateKey]: [...current, buildEntryReminder(dateKey, entry)].slice(0, MAX_STORED_REMINDERS_PER_DAY) }
    setRemindersByDate(next)
    if (getReleaseScheduleUserStateMode(userId) === 'local' || !userId) {
      writeStoredReminders(next)
      return
    }
    try {
      if (existing) await deleteReleaseScheduleReminder({ userId, reminderId: existing.id })
      else await saveReleaseScheduleReminderEntries({ userId, entries: [entry] })
      await refresh()
    } catch (error) {
      logger.warn('hatirlatma guncellenemedi', { error })
      setRemindersByDate(previous)
      toast.error(txa('Hatırlatma güncellenemedi.'))
    }
  }, [refresh, remindersByDate, userId])

  /** In a bulk chapter all enter / leave the plan together. */
  const togglePlan = useCallback(async (group: ReleaseScheduleEntry[]) => {
    const previous = plannedChapterIds
    const allPlanned = group.every((entry) => previous.includes(entry.chapterId))
    const ids = group.map((entry) => entry.chapterId)
    const next = allPlanned ? previous.filter((id) => !ids.includes(id)) : [...new Set([...previous, ...ids])]
    setPlannedChapterIds(next)
    if (getReleaseScheduleUserStateMode(userId) === 'local' || !userId) {
      writeStoredReadingPlan(next)
      return
    }
    try {
      for (const entry of group) {
        if (allPlanned) await deleteReadingPlanEntry({ userId, chapterId: entry.chapterId })
        else if (!previous.includes(entry.chapterId)) await saveReadingPlanEntry({ userId, entry })
      }
      await refresh()
    } catch (error) {
      logger.warn('okuma plani guncellenemedi', { error })
      setPlannedChapterIds(previous)
      toast.error(txa('Okuma planı güncellenemedi.'))
    }
  }, [plannedChapterIds, refresh, userId])

  return { plannedSet, isReminded, toggleReminder, togglePlan }
}
