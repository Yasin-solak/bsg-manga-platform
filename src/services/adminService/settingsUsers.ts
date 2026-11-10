import type { AdminUser, DashboardStats } from '@/data/admin'
import { supabase } from '../supabase'
import {
    setAdminUserBanState as setAdminUserBanStateMutation,
    updateAdminUserRole as updateAdminUserRoleMutation,
} from '../adminUserService'
import {
    clearSiteSettingsPublicSnapshotCache,
    getSiteSettingsPublicContactSnapshot,
    getSiteSettingsPublicSnapshot,
} from '../siteSettingsPublicSnapshot'
import { updateAdminHomepageFeaturedMangaIds } from '../homepageConfigService'
import { updateAdminExploreConfig } from '../exploreConfigService'
import { updateAdminMangaListPageConfig } from '../mangaListPageConfigService'
import {
    DEFAULT_SETTINGS,
    fetchSiteSettingsRow,
    getAdminUsersCore,
    getDashboardStatsCore,
    mapDbSiteSettings,
    normalizeDiscordInviteUrl,
    tryWriteAdminAuditLog,
} from './shared'
import type { DbSiteSettings } from './shared.db'
import type { SiteSettings } from './types'

export async function getSiteSettings(): Promise<SiteSettings> {
    return fetchSiteSettingsRow()
}

export async function getPublicSiteSettings(): Promise<SiteSettings> {
    const [{ data, error }, { data: contactData, error: contactError }] = await Promise.all([
        getSiteSettingsPublicSnapshot(),
        getSiteSettingsPublicContactSnapshot(),
    ])

    if ((error || !data) && (contactError || !contactData)) return DEFAULT_SETTINGS

    const baseSnapshot = (data as Partial<DbSiteSettings> | null) ?? {}
    const contactSnapshot = (contactData as Partial<DbSiteSettings> | null) ?? {}

    return mapDbSiteSettings({
        ...baseSnapshot,
        ...contactSnapshot,
    } as DbSiteSettings)
}

export async function updateSiteSettings(settings: SiteSettings): Promise<void> {
    const payload = {
        id: 1,
        site_title: settings.siteTitle.trim() || DEFAULT_SETTINGS.siteTitle,
        site_description: settings.siteDescription.trim() || DEFAULT_SETTINGS.siteDescription,
        contact_email: settings.contactEmail.trim() || DEFAULT_SETTINGS.contactEmail,
        maintenance_mode: !!settings.maintenanceMode,
        registration_enabled: !!settings.registrationEnabled,
        discord_invite_url: normalizeDiscordInviteUrl(settings.discordInviteUrl),
        logo_url: settings.logoUrl?.trim() || null,
    }

    const { error } = await supabase
        .from('site_settings')
        .upsert(payload, { onConflict: 'id' })

    if (error) {
        console.error('[adminService] updateSiteSettings error', error)
        throw error
    }

    Object.assign(DEFAULT_SETTINGS, {
        siteTitle: payload.site_title,
        siteDescription: payload.site_description,
        contactEmail: payload.contact_email,
        maintenanceMode: payload.maintenance_mode,
        registrationEnabled: payload.registration_enabled,
        discordInviteUrl: payload.discord_invite_url,
        logoUrl: payload.logo_url || '',
        homepageFeaturedMangaIds: settings.homepageFeaturedMangaIds,
        exploreEditorMangaIds: settings.exploreEditorMangaIds,
        exploreCollections: settings.exploreCollections,
        mangaListCreateCoverImages: settings.mangaListCreateCoverImages,
    })
    clearSiteSettingsPublicSnapshotCache()
    await updateAdminHomepageFeaturedMangaIds(settings.homepageFeaturedMangaIds)
    await updateAdminExploreConfig({
        editorMangaIds: settings.exploreEditorMangaIds,
        collections: settings.exploreCollections,
    })
    await updateAdminMangaListPageConfig({
        createCoverImages: settings.mangaListCreateCoverImages,
    })

    await tryWriteAdminAuditLog({
        action: 'site_settings.update',
        resourceType: 'site_settings',
        resourceId: '1',
        summary: 'Site ayarlari guncellendi.',
        metadata: {
            maintenanceMode: payload.maintenance_mode,
            registrationEnabled: payload.registration_enabled,
            discordInviteUrl: payload.discord_invite_url,
        },
    })
}

export async function getDashboardStats(): Promise<DashboardStats> {
    return getDashboardStatsCore()
}

export async function getAdminUsers(): Promise<AdminUser[]> {
    return getAdminUsersCore()
}

export async function updateUserRole(userId: string, role: 'user' | 'admin' | 'moderator') {
    // Note: even in legacy admin flows we keep role changes in one place.
    // Why: if the raw table update path is misused, auditing and hardening must not scatter.
    await updateAdminUserRoleMutation(userId, role)

    await tryWriteAdminAuditLog({
        action: 'user.role.update',
        resourceType: 'user',
        resourceId: userId,
        summary: `Kullanici rolu "${role}" olarak guncellendi.`,
        metadata: { role },
    })
}

export async function banUser(userId: string) {
    await setAdminUserBanStateMutation({
        userId,
        isBanned: true,
        reason: 'Site admin legacy ban aksiyonu',
    })

    await tryWriteAdminAuditLog({
        action: 'user.ban',
        resourceType: 'user',
        resourceId: userId,
        summary: 'Kullanici banlandi.',
    })
}
