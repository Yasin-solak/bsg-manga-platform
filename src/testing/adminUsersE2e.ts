import type {
    AdminManagedUser,
    AdminPagedResult,
    AdminUserBulkMutationResult,
    AdminUserDetail,
    AdminUserListParams,
    AdminUserOverview,
    AdminUserRole,
    AdminUserTrustBand,
} from '@/services/adminUserTypes'
import { E2E_ADMIN_USER_ID, isE2EModeEnabled } from './e2eMocks'

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

function isoAgo(milliseconds: number) {
    return new Date(Date.now() - milliseconds).toISOString()
}

function trust(
    score: number,
    confidence: 'low' | 'medium' | 'high',
    reasonCodes: string[],
) {
    const band: AdminUserTrustBand = score >= 80
        ? 'trusted'
        : score >= 60
            ? 'standard'
            : score >= 40
                ? 'review'
                : 'low'

    return {
        score,
        band,
        confidence,
        reasonCodes,
        components: {
            verifiedEmail: 10,
            accountAge: confidence === 'low' ? 0 : 12,
            cleanObservation: confidence === 'high' ? 15 : 5,
        },
        algorithmVersion: 'trust-v1',
        calculatedAt: new Date().toISOString(),
    }
}

function avatar(seed: string) {
    return `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(seed)}`
}

const INITIAL_USERS: AdminManagedUser[] = [
    {
        id: E2E_ADMIN_USER_ID,
        username: 'AylinYonetici',
        displayName: 'Aylin Yılmaz',
        avatarUrl: avatar('Aylin Yonetici'),
        role: 'admin',
        isBanned: false,
        isActive: true,
        level: '50',
        isVerified: true,
        lastActivityAt: isoAgo(2 * 60 * 1000),
        lastSeenAt: isoAgo(30 * 1000),
        presenceStatus: 'online',
        trust: trust(98, 'high', ['verified_email', 'mature_account', 'clean_observation']),
        fansubCount: 1,
        primaryFansub: { id: '72000000-0000-4000-8000-000000000001', name: 'Akatsuki Scans', slug: 'akatsuki-scans', role: 'admin' },
        createdAt: isoAgo(520 * DAY_MS),
        updatedAt: isoAgo(2 * 60 * 1000),
    },
    {
        id: '71000000-0000-4000-8000-000000000002',
        username: 'MertModerator',
        displayName: 'Mert Kaya',
        avatarUrl: avatar('Mert Moderator'),
        role: 'moderator',
        isBanned: false,
        isActive: true,
        level: '38',
        isVerified: true,
        lastActivityAt: isoAgo(4 * 60 * 1000),
        lastSeenAt: isoAgo(55 * 1000),
        presenceStatus: 'online',
        trust: trust(95, 'high', ['verified_email', 'mature_account', 'clean_observation']),
        fansubCount: 1,
        primaryFansub: { id: '72000000-0000-4000-8000-000000000002', name: 'One Piece Turkiye', slug: 'one-piece-turkiye', role: 'moderator' },
        createdAt: isoAgo(410 * DAY_MS),
        updatedAt: isoAgo(4 * 60 * 1000),
    },
    {
        id: '71000000-0000-4000-8000-000000000003',
        username: 'ErenOkur',
        displayName: 'Eren Jaeger',
        avatarUrl: avatar('Eren Okur'),
        role: 'user',
        isBanned: false,
        isActive: true,
        level: '27',
        isVerified: true,
        lastActivityAt: isoAgo(18 * 60 * 1000),
        lastSeenAt: isoAgo(4 * 60 * 1000),
        presenceStatus: 'idle',
        trust: trust(92, 'high', ['verified_email', 'mature_account', 'clean_observation']),
        fansubCount: 1,
        primaryFansub: { id: '72000000-0000-4000-8000-000000000003', name: 'Titan Scans', slug: 'titan-scans', role: 'member' },
        createdAt: isoAgo(360 * DAY_MS),
        updatedAt: isoAgo(18 * 60 * 1000),
    },
    {
        id: '71000000-0000-4000-8000-000000000004',
        username: 'MikasaCizgi',
        displayName: 'Mikasa Ackerman',
        avatarUrl: avatar('Mikasa Cizgi'),
        role: 'user',
        isBanned: false,
        isActive: true,
        level: '45',
        isVerified: true,
        lastActivityAt: isoAgo(45 * 60 * 1000),
        lastSeenAt: isoAgo(45 * 60 * 1000),
        presenceStatus: 'offline',
        trust: trust(88, 'high', ['verified_email', 'mature_account', 'clean_observation']),
        fansubCount: 1,
        primaryFansub: { id: '72000000-0000-4000-8000-000000000003', name: 'Titan Scans', slug: 'titan-scans', role: 'member' },
        createdAt: isoAgo(310 * DAY_MS),
        updatedAt: isoAgo(45 * 60 * 1000),
    },
    {
        id: '71000000-0000-4000-8000-000000000005',
        username: 'LeviArsiv',
        displayName: 'Levi Ackerman',
        avatarUrl: avatar('Levi Arsiv'),
        role: 'user',
        isBanned: false,
        isActive: true,
        level: '31',
        isVerified: true,
        lastActivityAt: isoAgo(3 * HOUR_MS),
        lastSeenAt: isoAgo(3 * HOUR_MS),
        presenceStatus: 'offline',
        trust: trust(76, 'high', ['verified_email', 'mature_account']),
        fansubCount: 0,
        createdAt: isoAgo(240 * DAY_MS),
        updatedAt: isoAgo(3 * HOUR_MS),
    },
    {
        id: '71000000-0000-4000-8000-000000000006',
        username: 'SaitamaPanel',
        displayName: 'Saitama Sensei',
        avatarUrl: avatar('Saitama Panel'),
        role: 'user',
        isBanned: false,
        isActive: true,
        level: '42',
        isVerified: true,
        lastActivityAt: isoAgo(5 * HOUR_MS),
        lastSeenAt: isoAgo(5 * HOUR_MS),
        presenceStatus: 'offline',
        trust: trust(90, 'high', ['verified_email', 'mature_account', 'clean_observation']),
        fansubCount: 1,
        primaryFansub: { id: '72000000-0000-4000-8000-000000000004', name: 'One Punch Sub', slug: 'one-punch-sub', role: 'member' },
        createdAt: isoAgo(190 * DAY_MS),
        updatedAt: isoAgo(5 * HOUR_MS),
    },
    {
        id: '71000000-0000-4000-8000-000000000007',
        username: 'GutsBerserk',
        displayName: 'Guts Berserk',
        avatarUrl: avatar('Guts Berserk'),
        role: 'user',
        isBanned: true,
        banReason: 'Tekrarlanan topluluk kuralı ihlali',
        bannedAt: isoAgo(8 * DAY_MS),
        isActive: false,
        level: '29',
        isVerified: false,
        lastActivityAt: isoAgo(8 * DAY_MS),
        lastSeenAt: isoAgo(8 * DAY_MS),
        presenceStatus: 'blocked',
        trust: trust(0, 'high', ['active_ban', 'confirmed_admin_ban']),
        fansubCount: 0,
        createdAt: isoAgo(140 * DAY_MS),
        updatedAt: isoAgo(8 * DAY_MS),
    },
    {
        id: '71000000-0000-4000-8000-000000000008',
        username: 'HinataOkuma',
        displayName: 'Hinata Shoyo',
        avatarUrl: avatar('Hinata Okuma'),
        role: 'user',
        isBanned: false,
        isActive: true,
        level: '22',
        isVerified: true,
        lastActivityAt: isoAgo(2 * DAY_MS),
        lastSeenAt: isoAgo(2 * DAY_MS),
        presenceStatus: 'offline',
        trust: trust(78, 'medium', ['verified_email', 'account_age_90_days']),
        fansubCount: 1,
        primaryFansub: { id: '72000000-0000-4000-8000-000000000005', name: 'Karasuno Fansub', slug: 'karasuno-fansub', role: 'member' },
        createdAt: isoAgo(95 * DAY_MS),
        updatedAt: isoAgo(2 * DAY_MS),
    },
    {
        id: '71000000-0000-4000-8000-000000000009',
        username: 'NezukoYeni',
        displayName: 'Nezuko Kamado',
        avatarUrl: avatar('Nezuko Yeni'),
        role: 'user',
        isBanned: false,
        isActive: true,
        level: '4',
        isVerified: true,
        lastActivityAt: isoAgo(35 * 60 * 1000),
        lastSeenAt: isoAgo(35 * 60 * 1000),
        presenceStatus: 'offline',
        trust: trust(70, 'low', ['verified_email', 'new_account']),
        fansubCount: 0,
        createdAt: isoAgo(3 * DAY_MS),
        updatedAt: isoAgo(35 * 60 * 1000),
    },
    {
        id: '71000000-0000-4000-8000-000000000010',
        username: 'TanjiroBaslangic',
        // The display name is deliberately absent to keep old payload compatibility in the E2E flow.
        avatarUrl: avatar('Tanjiro Baslangic'),
        role: 'user',
        isBanned: false,
        isActive: true,
        level: '2',
        isVerified: false,
        lastActivityAt: isoAgo(20 * HOUR_MS),
        lastSeenAt: isoAgo(20 * HOUR_MS),
        presenceStatus: 'offline',
        trust: trust(60, 'low', ['new_account', 'insufficient_observation']),
        fansubCount: 0,
        createdAt: isoAgo(5 * DAY_MS),
        updatedAt: isoAgo(20 * HOUR_MS),
    },
]

function e2eProgressionTitle(levelNumber: number) {
    if (levelNumber >= 40) return 'Usta Okur'
    if (levelNumber >= 20) return 'Deneyimli Okur'
    if (levelNumber >= 5) return 'Düzenli Okur'
    return 'Yeni Okur'
}

/** The E2E list carries the level summary in the real payload shape even without the detail RPC. */
function buildE2EProgression(levelText?: string) {
    const parsedLevel = Number.parseInt(levelText || '1', 10)
    const levelNumber = Number.isFinite(parsedLevel) && parsedLevel > 0 ? parsedLevel : 1
    const isMaxLevel = levelNumber >= 50
    const currentLevelXp = Math.max(0, (levelNumber - 1) * 350)
    const nextLevelXp = isMaxLevel ? null : levelNumber * 350
    const earnedInLevel = isMaxLevel ? 350 : 238
    const totalXp = currentLevelXp + earnedInLevel

    return {
        rulesetVersion: 1,
        levelNumber,
        title: e2eProgressionTitle(levelNumber),
        totalXp,
        currentLevelXp,
        nextLevelXp,
        xpToNextLevel: nextLevelXp === null ? null : Math.max(0, nextLevelXp - totalXp),
        progressPercent: isMaxLevel ? 100 : 68,
        isMaxLevel,
    }
}

let runtimeUsers: AdminManagedUser[] = INITIAL_USERS.map((user) => ({
    ...user,
    progression: user.progression ? { ...user.progression } : buildE2EProgression(user.level),
    trust: user.trust ? { ...user.trust } : undefined,
}))
const E2E_ADMIN_ACTOR_ID = E2E_ADMIN_USER_ID

function matchesView(user: AdminManagedUser, view: AdminUserListParams['view']) {
    if (!view || view === 'all') return true
    if (view === 'new') return Date.now() - new Date(user.createdAt).getTime() <= 7 * DAY_MS
    if (view === 'staff') return user.role === 'admin' || user.role === 'moderator'
    if (view === 'banned') return user.isBanned
    if (view === 'review') return !user.isBanned && (user.trust?.score || 100) < 60 && user.trust?.confidence !== 'low'
    return user.role === view
}

export function getE2EAdminUsersPage(params: AdminUserListParams = {}): AdminPagedResult<AdminManagedUser> | null {
    if (!isE2EModeEnabled()) return null

    const search = params.search?.trim().toLocaleLowerCase('tr-TR') || ''
    const limit = Math.max(1, Math.min(params.limit || 20, 60))
    const filtered = runtimeUsers.filter((user) => {
        const matchesDisplayName = user.displayName?.toLocaleLowerCase('tr-TR').includes(search) === true
        if (search && !matchesDisplayName && !user.username.toLocaleLowerCase('tr-TR').includes(search) && user.id !== search) return false
        if (!matchesView(user, params.view)) return false
        if (params.role && params.role !== 'all' && user.role !== params.role) return false
        if (params.verification === 'verified' && !user.isVerified) return false
        if (params.verification === 'unverified' && user.isVerified) return false
        if (params.trust && params.trust !== 'all' && user.trust?.band !== params.trust) return false
        if (params.fansub === 'member' && (user.fansubCount || 0) === 0) return false
        if (params.fansub === 'none' && (user.fansubCount || 0) > 0) return false
        return true
    })

    const cursorIndex = params.cursor
        ? filtered.findIndex((user) => user.id === params.cursor?.userId) + 1
        : 0
    const start = Math.max(0, cursorIndex)
    const data = filtered.slice(start, start + limit)
    const hasNext = start + data.length < filtered.length
    const lastUser = data[data.length - 1]

    return {
        data,
        count: filtered.length,
        page: params.page || Math.floor(start / limit) + 1,
        limit,
        hasNext,
        nextCursor: hasNext && lastUser ? { createdAt: lastUser.createdAt, userId: lastUser.id } : undefined,
    }
}

export function getE2EAdminUserOverview(): AdminUserOverview | null {
    if (!isE2EModeEnabled()) return null
    const newUsersCurrent = runtimeUsers.filter((user) => Date.now() - new Date(user.createdAt).getTime() <= 7 * DAY_MS).length

    return {
        generatedAt: new Date().toISOString(),
        total: runtimeUsers.length,
        activeLast30Days: runtimeUsers.filter((user) => !user.isBanned && user.lastActivityAt && Date.now() - new Date(user.lastActivityAt).getTime() <= 30 * DAY_MS).length,
        onlineNow: runtimeUsers.filter((user) => user.presenceStatus === 'online').length,
        verified: runtimeUsers.filter((user) => user.isVerified).length,
        lowTrustReview: runtimeUsers.filter((user) => !user.isBanned && (user.trust?.score || 100) < 60 && user.trust?.confidence !== 'low').length,
        newUsersCurrent,
        newUsersPrevious: 1,
        newUsersDelta: newUsersCurrent - 1,
        newUsersDeltaPercent: 100 * (newUsersCurrent - 1),
        active: runtimeUsers.filter((user) => user.isActive && !user.isBanned).length,
        banned: runtimeUsers.filter((user) => user.isBanned).length,
        admins: runtimeUsers.filter((user) => user.role === 'admin').length,
        moderators: runtimeUsers.filter((user) => user.role === 'moderator').length,
    }
}

export function getE2EAdminUserById(userId: string): AdminManagedUser | null {
    if (!isE2EModeEnabled()) return null
    return runtimeUsers.find((user) => user.id === userId) || null
}

export function updateE2EAdminUserRole(userId: string, role: AdminUserRole): AdminManagedUser | null {
    if (!isE2EModeEnabled()) return null
    const target = runtimeUsers.find((user) => user.id === userId)
    if (!target) throw new Error('Kullanici bulunamadi.')
    if (userId === E2E_ADMIN_ACTOR_ID && role !== 'admin') {
        throw new Error('Kendi admin rolunu dusuremezsin.')
    }
    const availableAdminCount = runtimeUsers.filter((user) => user.role === 'admin' && user.isActive && !user.isBanned).length
    if (target.role === 'admin' && role !== 'admin' && target.isActive && !target.isBanned && availableAdminCount <= 1) {
        throw new Error('Son kullanilabilir admin rolu kaldirilamaz.')
    }
    runtimeUsers = runtimeUsers.map((user) => user.id === userId ? { ...user, role } : user)
    return getE2EAdminUserById(userId)
}

export function setE2EAdminUsersBanState(
    userIds: string[],
    isBanned: boolean,
    reason?: string,
    banUntil?: string,
): AdminUserBulkMutationResult | null {
    if (!isE2EModeEnabled()) return null
    const uniqueIds = [...new Set(userIds)]
    let availableAdminCount = runtimeUsers.filter((user) => user.role === 'admin' && user.isActive && !user.isBanned).length
    const items: AdminUserBulkMutationResult['items'] = []

    for (const userId of uniqueIds.sort()) {
        const target = runtimeUsers.find((user) => user.id === userId)
        if (!target) {
            items.push({ userId, status: 'not_found' })
            continue
        }
        if (isBanned && userId === E2E_ADMIN_ACTOR_ID) {
            items.push({ userId, status: 'self_rejected' })
            continue
        }
        if (isBanned && target.role === 'admin' && target.isActive && !target.isBanned && availableAdminCount <= 1) {
            items.push({ userId, status: 'last_admin_rejected' })
            continue
        }
        if (target.isBanned === isBanned) {
            items.push({ userId, status: 'unchanged' })
            continue
        }

        items.push({ userId, status: 'updated' })
        if (isBanned && target.role === 'admin' && target.isActive) availableAdminCount -= 1
    }

    const updatedIds = new Set(items.filter((item) => item.status === 'updated').map((item) => item.userId))
    runtimeUsers = runtimeUsers.map((user) => {
        if (!updatedIds.has(user.id)) return user
        const baseline = INITIAL_USERS.find((initialUser) => initialUser.id === user.id)?.trust
        const unbannedScore = Math.max(40, (baseline?.score || 60) - 20)
        return {
            ...user,
            isBanned,
            banReason: isBanned ? reason : undefined,
            banUntil: isBanned ? banUntil : undefined,
            bannedAt: isBanned ? new Date().toISOString() : undefined,
            presenceStatus: isBanned ? 'blocked' : 'offline',
            trust: isBanned
                ? trust(0, user.trust?.confidence || 'low', ['active_ban'])
                : trust(unbannedScore, baseline?.confidence || 'medium', ['confirmed_admin_ban']),
        }
    })

    const updated = items.filter((item) => item.status === 'updated').length
    const unchanged = items.filter((item) => item.status === 'unchanged').length
    return { requested: items.length, updated, unchanged, rejected: items.length - updated - unchanged, items }
}

export function getE2EAdminUserDetail(userId: string): AdminUserDetail | null {
    const user = getE2EAdminUserById(userId)
    if (!user) return null

    return {
        profile: {
            id: user.id,
            username: user.username,
            displayName: user.displayName?.trim() || user.username,
            avatarUrl: user.avatarUrl,
            bio: 'Manga topluluğunda düzenli okuma ve paylaşım yapan kullanıcı.',
            level: user.level || '1',
            socialLinks: [],
            role: user.role,
            stones: 1280,
            frameType: 'default',
            isBanned: user.isBanned,
            banReason: user.banReason,
            banUntil: user.banUntil,
            bannedAt: user.bannedAt,
            bannedBy: user.bannedBy,
            isActive: user.isActive,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
        },
        stats: {
            followers: 124,
            following: 86,
            mangaFollows: 32,
            fansubFollows: 5,
            readingCount: 248,
            mangaCommentCount: 28,
            badgeCount: 4,
            estimatedReadMinutes: 5720,
            fansubMembershipCount: user.fansubCount || 0,
            fansubRoleHistoryCount: user.fansubCount || 0,
            sentInviteCount: 0,
            joinRequestCount: 1,
        },
        inventory: { frames: [], backgrounds: [], patterns: [], badges: [], premium: [] },
        badges: [],
        recentReads: [],
        favoriteGenres: [],
        favoriteGenreMethod: 'E2E kullanıcı yönetimi önizlemesi',
        topMangas: [],
        topChapters: [],
        mangaComments: [],
        fansubMemberships: user.primaryFansub ? [{
            fansubId: user.primaryFansub.id,
            fansubName: user.primaryFansub.name,
            fansubSlug: user.primaryFansub.slug,
            fansubIsActive: true,
            role: user.primaryFansub.role,
            joinedAt: user.createdAt,
        }] : [],
        fansubMembershipHistory: [],
        sentFansubInvites: [],
        joinRequests: [],
    }
}
