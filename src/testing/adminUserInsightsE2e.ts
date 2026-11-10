import type { AdminUserDetailInsights } from '@/services/adminUserTypes'
import { E2E_ADMIN_USER_ID, isE2EModeEnabled } from './e2eMocks'

const DAY_MS = 24 * 60 * 60 * 1000

function isoDate(value: Date) {
    return value.toISOString().slice(0, 10)
}

export function getE2EAdminUserInsights(_userId: string, activityDays: number): AdminUserDetailInsights | null {
    if (!isE2EModeEnabled()) return null

    const now = new Date()
    const daily = Array.from({ length: activityDays }, (_, index) => {
        const date = new Date(now.getTime() - (activityDays - index - 1) * DAY_MS)
        const reads = index % 4 === 0 ? 0 : (index % 5) + 1
        const comments = index % 7 === 0 ? 1 : 0
        return { date: isoDate(date), reads, comments, total: reads + comments }
    })
    const total = daily.reduce((sum, day) => sum + day.total, 0)
    const reads = daily.reduce((sum, day) => sum + day.reads, 0)
    const comments = daily.reduce((sum, day) => sum + day.comments, 0)

    return {
        generatedAt: now.toISOString(),
        windowDays: activityDays,
        activity: {
            total,
            reads,
            comments,
            activeDays: daily.filter((day) => day.total > 0).length,
            lastAt: new Date(now.getTime() - 18 * 60 * 1000).toISOString(),
            daily,
            timeBuckets: [
                { weekday: 1, hour: 20, total: 4 },
                { weekday: 3, hour: 21, total: 7 },
                { weekday: 5, hour: 22, total: 9 },
                { weekday: 6, hour: 18, total: 5 },
            ],
            events: [
                {
                    id: 'e2e-read-1',
                    type: 'user_read',
                    summary: 'Kullanici bir bolum okudu.',
                    mangaTitle: 'One Piece',
                    chapterNumber: 1114,
                    createdAt: new Date(now.getTime() - 18 * 60 * 1000).toISOString(),
                },
                {
                    id: 'e2e-comment-1',
                    type: 'user_comment',
                    summary: 'Kullanici manga yorumu paylasti.',
                    mangaTitle: 'Solo Leveling',
                    createdAt: new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString(),
                },
            ],
        },
        moderation: {
            reports: { total: 1, pending: 0, resolved: 1, dismissed: 0 },
            securityEventCount: 1,
            adminActionCount: 0,
            currentBan: { isBanned: false },
            events: [
                {
                    id: 'e2e-moderation-1',
                    source: 'security',
                    type: 'user_role_changed',
                    severity: 'high',
                    summary: 'Kullanici rolu user -> moderator olarak guncellendi.',
                    actorUserId: E2E_ADMIN_USER_ID,
                    actorUsername: 'AylinAdmin',
                    actorRole: 'admin',
                    createdAt: new Date(now.getTime() - 8 * DAY_MS).toISOString(),
                    outcome: 'completed',
                    metadata: { previousRole: 'user', newRole: 'moderator' },
                },
            ],
        },
    }
}
