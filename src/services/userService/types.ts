import type { FansubIdentityTagPresentation } from '@/lib/fansubIdentityTags'

export interface UserProfile {
    id: string
    username: string
    display_name: string
    avatar_url: string
    bio: string
    level: string
    frame_type: string
    background_type?: string | null
    active_profile_effect_id?: string | null
    social_links: any[]
    owned_items: {
        frames: string[]
        backgrounds: any[]
        patterns: any[]
        profile_effects?: string[]
        uploaded_background_slots?: Array<Record<string, unknown>>
        profile_background_upload_slot_limit?: number | null
        profile_background_upload_slot_preset?: string | null
    }
    stones: number
    premium_expires_at?: string | null
    active_fansub_identity_tag?: FansubIdentityTagPresentation | null
    onboarding_completed_at?: string | null
    profile_visibility?: PrivacyVisibility
    stats_visibility?: PrivacyVisibility
    social_links_visibility?: PrivacyVisibility
    activity_visibility?: PrivacyVisibility
    created_at: string
}

export interface UserOnboardingState {
    completedAt: string | null
}

export type PrivacyVisibility = 'public' | 'followers' | 'private'

export interface UserPrivacySettings {
    profileVisibility: PrivacyVisibility
    statsVisibility: PrivacyVisibility
    socialLinksVisibility: PrivacyVisibility
    activityVisibility: PrivacyVisibility
}

export interface UserProfileViewAccess extends UserPrivacySettings {
    isOwner: boolean
    viewerIsFollower: boolean
    profileVisible: boolean
    statsVisible: boolean
    socialLinksVisible: boolean
    activityVisible: boolean
}

export interface UserBlockState {
    blockedByCurrentUser: boolean
}

export interface BlockedUserSummary {
    id: string
    username: string
    avatar: string
    blockedAt: string | null
}
