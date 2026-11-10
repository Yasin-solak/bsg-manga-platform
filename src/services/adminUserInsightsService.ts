import { z } from 'zod'
import { getE2EAdminUserInsights } from '@/testing/adminUserInsightsE2e'
import { withAbortSignal, withServiceTimeout } from './apiResilience'
import { supabase } from './supabase'
import type { AdminUserDetailInsights } from './adminUserTypes'

const isoTimestampSchema = z.string().datetime({ offset: true })
const nullableTimestampSchema = isoTimestampSchema.nullable().transform((value) => value ?? undefined)
const nullableUuidSchema = z.string().uuid().nullable().transform((value) => value ?? undefined)
const nullableTextSchema = z.string().nullable().transform((value) => value ?? undefined)
const nonNegativeIntegerSchema = z.number().int().nonnegative()

const activityEventSchema = z.object({
    id: z.string().min(1).max(100),
    type: z.enum(['user_read', 'user_comment']),
    summary: z.string().max(500),
    mangaId: nullableUuidSchema.optional(),
    mangaTitle: nullableTextSchema.optional(),
    chapterId: nullableUuidSchema.optional(),
    chapterNumber: z.number().nullable().transform((value) => value ?? undefined).optional(),
    routeHint: nullableTextSchema.optional(),
    createdAt: isoTimestampSchema,
}).strict()

const moderationEventSchema = z.object({
    id: z.string().min(1).max(100),
    source: z.enum(['security', 'audit', 'report']),
    type: z.string().trim().min(1).max(120),
    severity: z.enum(['low', 'medium', 'high', 'critical']),
    summary: z.string().max(500),
    actorUserId: nullableUuidSchema.optional(),
    actorUsername: nullableTextSchema.optional(),
    actorRole: z.enum(['admin', 'moderator', 'user', 'system', 'anon']).nullable().transform((value) => value ?? undefined).optional(),
    createdAt: isoTimestampSchema,
    outcome: z.string().trim().min(1).max(40),
    metadata: z.object({
        banUntil: nullableTimestampSchema.optional(),
        previousRole: z.string().max(40).optional(),
        newRole: z.string().max(40).optional(),
        status: z.string().max(40).optional(),
        resolvedAt: nullableTimestampSchema.optional(),
    }).strict(),
}).strict()

const insightsSchema = z.object({
    generatedAt: isoTimestampSchema,
    windowDays: z.number().int().min(7).max(90),
    activity: z.object({
        total: nonNegativeIntegerSchema,
        reads: nonNegativeIntegerSchema,
        comments: nonNegativeIntegerSchema,
        activeDays: nonNegativeIntegerSchema,
        lastAt: nullableTimestampSchema.optional(),
        daily: z.array(z.object({
            date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
            total: nonNegativeIntegerSchema,
            reads: nonNegativeIntegerSchema,
            comments: nonNegativeIntegerSchema,
        }).strict()).min(7).max(90),
        timeBuckets: z.array(z.object({
            weekday: z.number().int().min(1).max(7),
            hour: z.number().int().min(0).max(23),
            total: nonNegativeIntegerSchema,
        }).strict()).max(168),
        events: z.array(activityEventSchema).max(200),
    }).strict(),
    moderation: z.object({
        reports: z.object({
            total: nonNegativeIntegerSchema,
            pending: nonNegativeIntegerSchema,
            resolved: nonNegativeIntegerSchema,
            dismissed: nonNegativeIntegerSchema,
        }).strict(),
        securityEventCount: nonNegativeIntegerSchema,
        adminActionCount: nonNegativeIntegerSchema,
        currentBan: z.object({
            isBanned: z.boolean(),
            reason: nullableTextSchema.optional(),
            until: nullableTimestampSchema.optional(),
            bannedAt: nullableTimestampSchema.optional(),
        }).strict(),
        events: z.array(moderationEventSchema).max(200),
    }).strict(),
}).strict()

const inputSchema = z.object({
    userId: z.string().uuid().transform((value) => value.toLowerCase()),
    activityDays: z.number().int().min(7).max(90).default(30),
    eventLimit: z.number().int().min(10).max(200).default(80),
}).strict()

const CACHE_TTL_MS = 30_000
const cache = new Map<string, { expiresAt: number; value: AdminUserDetailInsights }>()

function isMissingInsightsRpc(error: unknown) {
    if (!error || typeof error !== 'object') return false
    const typed = error as { code?: unknown; message?: unknown }
    const code = typeof typed.code === 'string' ? typed.code : ''
    const message = typeof typed.message === 'string' ? typed.message.toLowerCase() : ''
    return code === '42883'
        || code === 'PGRST202'
        || (message.includes('function') && (message.includes('does not exist') || message.includes('could not find')))
}

export function invalidateAdminUserInsightsCache(userId?: string) {
    if (!userId) {
        cache.clear()
        return
    }
    const normalizedId = userId.trim().toLowerCase()
    for (const key of cache.keys()) {
        if (key.startsWith(`${normalizedId}:`)) cache.delete(key)
    }
}

export async function getAdminUserDetailInsights(
    userId: string,
    options: { activityDays?: number; eventLimit?: number; forceRefresh?: boolean } = {},
): Promise<AdminUserDetailInsights | null> {
    const input = inputSchema.parse({
        userId,
        activityDays: options.activityDays ?? 30,
        eventLimit: options.eventLimit ?? 80,
    })
    const e2eInsights = getE2EAdminUserInsights(input.userId, input.activityDays)
    if (e2eInsights) return insightsSchema.parse(e2eInsights)

    const cacheKey = `${input.userId}:${input.activityDays}:${input.eventLimit}`
    const cached = cache.get(cacheKey)
    if (!options.forceRefresh && cached && cached.expiresAt > Date.now()) return cached.value

    const { data, error } = await withServiceTimeout(
        (signal) => withAbortSignal(
            supabase.rpc('get_admin_user_detail_insights', {
                p_user_id: input.userId,
                p_activity_days: input.activityDays,
                p_event_limit: input.eventLimit,
            }),
            signal,
        ),
        { label: 'Admin kullanici aktivite ve moderasyon detaylari' },
    )
    if (error) {
        if (isMissingInsightsRpc(error)) return null
        throw error
    }

    const payload = Array.isArray(data) && data.length === 1 ? data[0] : data
    const parsed = insightsSchema.parse(payload)
    cache.set(cacheKey, { value: parsed, expiresAt: Date.now() + CACHE_TTL_MS })
    return parsed
}
