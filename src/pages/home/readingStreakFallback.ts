import type { ReadingStreakSummary, ReadingStreakWeekDay } from '@/services/rewardService'
import type { userService } from '@/services/userService'
import { txa } from '@/i18n/activeLocale'

type ReadingHistoryRows = Awaited<ReturnType<typeof userService.getReadingHistory>>

export function buildReadingStreakSummaryFromHistory(rows: ReadingHistoryRows): ReadingStreakSummary {
    const readDays = new Set<number>(
        (rows || [])
            .map((row) => {
                const date = new Date(String((row as any)?.read_at || ''))
                if (Number.isNaN(date.getTime())) return null
                return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
            })
            .filter((value): value is number => typeof value === 'number'),
    )
    const weekDays = buildWeekDays(readDays)

    if (readDays.size === 0) {
        return emptyReadingStreakSummary(weekDays)
    }

    const today = new Date()
    const todayKey = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
    const dayMs = 86_400_000
    let cursor = todayKey
    const lastReadAt = (rows || [])
        .map((row) => String((row as any)?.read_at || ''))
        .filter(Boolean)
        .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] || null

    if (!readDays.has(cursor)) {
        const yesterdayKey = cursor - dayMs
        if (!readDays.has(yesterdayKey)) {
            return {
                ...emptyReadingStreakSummary(weekDays),
                activeDaysThisWeek: weekDays.filter((day) => day.isRead).length,
                lastReadAt,
            }
        }
        cursor = yesterdayKey
    }

    let currentStreak = 0
    while (readDays.has(cursor)) {
        currentStreak += 1
        cursor -= dayMs
    }

    return {
        currentStreak,
        hasReadToday: readDays.has(todayKey),
        activeDaysThisWeek: weekDays.filter((day) => day.isRead).length,
        lastReadAt,
        weekDays,
        claimableRewards: [],
        nextReward: null,
        recentRewards: [],
        earnedTodayCoin: 0,
        totalClaimedCoin: 0,
    }
}

function emptyReadingStreakSummary(weekDays: ReadingStreakWeekDay[]): ReadingStreakSummary {
    return {
        currentStreak: 0,
        hasReadToday: false,
        activeDaysThisWeek: weekDays.filter((day) => day.isRead).length,
        lastReadAt: null,
        weekDays,
        claimableRewards: [],
        nextReward: null,
        recentRewards: [],
        earnedTodayCoin: 0,
        totalClaimedCoin: 0,
    }
}

function buildWeekDays(readDays: Set<number>): ReadingStreakWeekDay[] {
    const labels = [txa('Pzt'), txa('Sal'), txa('Çar'), txa('Per'), txa('Cum'), txa('Cmt'), txa('Bugün')]
    const today = new Date()
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    const mondayOffset = (todayStart.getDay() + 6) % 7
    const monday = new Date(todayStart)
    monday.setDate(todayStart.getDate() - mondayOffset)

    return labels.map((label, index) => {
        const date = new Date(monday)
        date.setDate(monday.getDate() + index)
        const key = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
        return {
            date: date.toISOString().slice(0, 10),
            label,
            isRead: readDays.has(key),
            isToday: key === todayStart.getTime(),
        }
    })
}
