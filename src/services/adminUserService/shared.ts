import type {
    AdminManagedUser,
    AdminUserFansubPreview,
    AdminUserPresenceStatus,
    AdminUserRole,
    AdminUserTrustBand,
    AdminUserTrustConfidence,
    AdminUserTrustSummary,
} from '../adminUserTypes'
import { parseUserProgression } from '../userProgressionService'

export const DEFAULT_LIMIT = 10
export const MAX_LIMIT = 20

export type DbAdminUserRow = {
    id: string
    username: string
    display_name?: string | null
    avatar_url: string | null
    role: AdminUserRole | null
    is_banned: boolean | null
    ban_reason?: string | null
    ban_until?: string | null
    banned_at?: string | null
    banned_by?: string | null
    is_active: boolean | null
    level?: string | null
    created_at: string
    updated_at: string
}

type UnknownRecord = Record<string, unknown>

export function isBanActive(isBanned: boolean | null | undefined, banUntil?: string | null) {
    if (isBanned !== true) return false
    if (!banUntil) return true
    const parsed = new Date(banUntil)
    if (Number.isNaN(parsed.getTime())) return true
    return parsed.getTime() > Date.now()
}

export function toAvatarUrl(username: string, avatarUrl?: string | null) {
    const normalizedUsername = username.trim() || 'user'
    return avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(normalizedUsername)}`
}

export function mapDbAdminUserRow(row: DbAdminUserRow): AdminManagedUser {
    const activeBan = isBanActive(row.is_banned, row.ban_until)
    return {
        id: row.id,
        username: row.username,
        displayName: row.display_name?.trim() || row.username,
        avatarUrl: toAvatarUrl(row.username, row.avatar_url),
        role: row.role || 'user',
        isBanned: activeBan,
        banReason: activeBan ? row.ban_reason || undefined : undefined,
        banUntil: activeBan ? row.ban_until || undefined : undefined,
        bannedAt: activeBan ? row.banned_at || undefined : undefined,
        bannedBy: activeBan ? row.banned_by || undefined : undefined,
        isActive: row.is_active !== false,
        presenceStatus: 'unknown',
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    }
}

function toRecord(value: unknown): UnknownRecord {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as UnknownRecord
        : {}
}

function readString(record: UnknownRecord, ...keys: string[]): string | undefined {
    for (const key of keys) {
        const value = record[key]
        if (typeof value === 'string' && value.trim()) return value
    }
    return undefined
}

function readBoolean(record: UnknownRecord, fallback: boolean, ...keys: string[]): boolean {
    for (const key of keys) {
        if (typeof record[key] === 'boolean') return record[key] as boolean
    }
    return fallback
}

function readNumber(record: UnknownRecord, fallback: number, ...keys: string[]): number {
    for (const key of keys) {
        const value = Number(record[key])
        if (Number.isFinite(value)) return value
    }
    return fallback
}

function normalizeTrustBand(value: unknown, score: number): AdminUserTrustBand {
    if (value === 'trusted' || value === 'standard' || value === 'review' || value === 'low') return value
    if (score >= 80) return 'trusted'
    if (score >= 60) return 'standard'
    if (score >= 40) return 'review'
    return 'low'
}

function normalizeTrustConfidence(value: unknown): AdminUserTrustConfidence {
    if (value === 'low' || value === 'medium' || value === 'high') return value
    return 'low'
}

function normalizePresenceStatus(value: unknown): AdminUserPresenceStatus {
    if (value === 'online' || value === 'idle' || value === 'offline' || value === 'unknown' || value === 'blocked') {
        return value
    }
    return 'unknown'
}

function normalizeComponents(value: unknown): Record<string, number | boolean> {
    return Object.fromEntries(
        Object.entries(toRecord(value)).filter((entry): entry is [string, number | boolean] => (
            typeof entry[1] === 'number' || typeof entry[1] === 'boolean'
        )),
    )
}

function normalizeTrustSummary(value: unknown, fallbackCalculatedAt: string): AdminUserTrustSummary {
    const record = toRecord(value)
    const score = Math.min(100, Math.max(0, Math.round(readNumber(record, 60, 'score'))))
    const reasonCodes = Array.isArray(record.reasonCodes)
        ? record.reasonCodes.filter((item): item is string => typeof item === 'string')
        : Array.isArray(record.reason_codes)
            ? record.reason_codes.filter((item): item is string => typeof item === 'string')
            : []

    return {
        score,
        band: normalizeTrustBand(record.band, score),
        confidence: normalizeTrustConfidence(record.confidence),
        reasonCodes,
        components: normalizeComponents(record.components),
        algorithmVersion: readString(record, 'algorithmVersion', 'algorithm_version') || 'trust-v1',
        calculatedAt: readString(record, 'calculatedAt', 'calculated_at') || fallbackCalculatedAt,
    }
}

function normalizePrimaryFansub(value: unknown): AdminUserFansubPreview | undefined {
    const record = toRecord(value)
    const id = readString(record, 'id', 'fansubId', 'fansub_id')
    const name = readString(record, 'name', 'fansubName', 'fansub_name')
    const slug = readString(record, 'slug', 'fansubSlug', 'fansub_slug')
    const role = readString(record, 'role')
    if (!id || !name || !slug || !role || !['admin', 'moderator', 'member'].includes(role)) return undefined
    return { id, name, slug, role: role as AdminUserFansubPreview['role'] }
}

export function mapRpcAdminUserRow(value: unknown): AdminManagedUser {
    const envelope = toRecord(value)
    const profile = toRecord(envelope.profile)
    const membershipRows = Array.isArray(envelope.fansubMemberships) ? envelope.fansubMemberships : []
    const row: UnknownRecord = Object.keys(profile).length > 0
        ? {
            ...profile,
            lastActivityAt: envelope.lastActivityAt ?? envelope.lastActiveAt,
            lastSeenAt: envelope.lastSeenAt,
            presenceStatus: envelope.presenceStatus,
            trust: envelope.trust,
            fansubCount: membershipRows.length,
            primaryFansub: membershipRows[0],
            progression: envelope.progression,
        }
        : envelope
    const id = readString(row, 'id', 'userId', 'user_id') || ''
    const username = readString(row, 'username') || 'kullanici'
    const createdAt = readString(row, 'createdAt', 'created_at') || new Date(0).toISOString()
    const updatedAt = readString(row, 'updatedAt', 'updated_at') || createdAt
    const role = readString(row, 'role')
    const isBanned = readBoolean(row, false, 'isBanned', 'is_banned')

    return {
        id,
        username,
        displayName: readString(row, 'displayName', 'display_name') || username,
        avatarUrl: toAvatarUrl(username, readString(row, 'avatarUrl', 'avatar_url')),
        role: role === 'admin' || role === 'moderator' ? role : 'user',
        isBanned,
        banReason: isBanned ? readString(row, 'banReason', 'ban_reason') : undefined,
        banUntil: isBanned ? readString(row, 'banUntil', 'ban_until') : undefined,
        bannedAt: isBanned ? readString(row, 'bannedAt', 'banned_at') : undefined,
        bannedBy: isBanned ? readString(row, 'bannedBy', 'banned_by') : undefined,
        isActive: readBoolean(row, true, 'isActive', 'is_active'),
        level: readString(row, 'level') || '1',
        progression: parseUserProgression(row.progression),
        isVerified: readBoolean(row, false, 'isVerified', 'is_verified'),
        lastActivityAt: readString(row, 'lastActivityAt', 'lastActiveAt', 'last_activity_at', 'last_active_at'),
        lastSeenAt: readString(row, 'lastSeenAt', 'last_seen_at'),
        presenceStatus: normalizePresenceStatus(row.presenceStatus ?? row.presence_status),
        trust: normalizeTrustSummary(row.trust, updatedAt),
        fansubCount: Math.max(0, Math.round(readNumber(row, 0, 'fansubCount', 'fansub_count'))),
        primaryFansub: normalizePrimaryFansub(row.primaryFansub ?? row.primary_fansub),
        createdAt,
        updatedAt,
    }
}

export function normalizePageAndLimit(page?: number, limit?: number) {
    const safePage = Number.isFinite(page) && (page || 0) > 0 ? Number(page) : 1
    const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(Number(limit), 1), MAX_LIMIT) : DEFAULT_LIMIT
    return { page: safePage, limit: safeLimit }
}

export function sanitizeSearchTerm(input: string | undefined) {
    const withoutControlCharacters = [...(input || '')].map((character) => {
        const code = character.charCodeAt(0)
        return code < 32 || code === 127 ? ' ' : character
    }).join('')
    return withoutControlCharacters
        .trim()
        .replace(/\s+/g, ' ')
        .slice(0, 160)
}

export function escapeIlike(value: string) {
    return value
        .replace(/[\\%_,()]/g, (character) => character === '%' || character === '_' ? `\\${character}` : ' ')
        .replace(/\s+/g, ' ')
}

export function isUuid(value: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}
