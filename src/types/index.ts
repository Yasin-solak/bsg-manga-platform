import type { StoreProfileEffectAssets } from '@/data/storeProducts'
import type { NameTextStyleSelection } from '@/data/nameTextEffects'
import type { ProfileThemePattern, ProfileThemeStyle } from '@/lib/profileTheme'

/**
 * BSG Manga Type Definitions
 */

export type FrameTypeValue =
    | 'christmas'
    | 'halloween'
    | 'avatarframe1'
    | 'avatarframe2'
    | 'avatarframe3'
    | 'avatarframe4'
    | 'fire'
    | 'ice'
    | 'neon'
    | 'gold'
    | 'rainbow'
    | 'default'
    // Store tarafindan gelen ozel frame identifier degerleri.
    | (string & {})

/**
 * Manga tipi
 */
export interface Manga {
    id: string
    slug?: string
    title: string
    coverImage: string
    lastChapter?: string
    lastChapterTitle?: string
    isNew?: boolean
    rating?: number
    totalRatings?: number
    description?: string
    genres?: string[]
    /**
     * The series TYPE, not the source language. `original_lang` is separate:
     * a Korean webtoon and a Korean manhwa are both 'ko'.
     */
    seriesType?: 'manga' | 'manhwa' | 'manhua' | 'webtoon' | 'yerli'
    /** 18+ label. Visibility is also closed in RLS; this field is only for the badge. */
    isMature?: boolean
    status?: 'ongoing' | 'completed' | 'hiatus'
    views?: number
    followerCount?: number
    likes?: number
    createdAt?: string
    updatedAt?: string
}

export interface ChapterFansub {
    id: string
    name: string
    slug: string
    avatar?: string
    hasFullNameStyle?: boolean
    activeNameStyle?: {
        version?: number
        fontId?: string
        effectId?: string
        colorId?: string
        secondaryColorId?: string
    }
}

import type { FansubIdentityTagPresentation } from '@/lib/fansubIdentityTags'

/**
 * BÃ¶lÃ¼m tipi
 */
export interface Chapter {
    id: string
    mangaId: string
    chapterNumber: number
    title?: string
    notes?: string
    pages: string[]
    /**
     * Per-page `width / height` ratio (same order as pages); null for an unknown
     * page. Only for reserving space (layout shift): the reader measures an unknown
     * page's ratio once the image loads.
     */
    pageRatios?: Array<number | null>
    publishAt?: string
    isApproved?: boolean
    isActive?: boolean
    createdAt: string
    fansub?: ChapterFansub
}

/**
 * Fansub grubu tipi
 */
export interface Fansub {
    id: string
    name: string
    slug?: string
    avatar: string
    description?: string
    discordInviteUrl?: string
    mangaCount?: number
    followerCount?: number
    hasDiscoverBadge?: boolean
    hasGoldFrame?: boolean
    hasFullNameStyle?: boolean
    canUploadStaticBackground?: boolean
    canUploadVideoBackground?: boolean
    frameType?: FrameTypeValue
    patternType?: 'comic' | 'gradient' | 'sparkle' | 'halftone'
    primaryColor?: string
    secondaryColor?: string
    customBackgroundAssetUrl?: string
    profileBackgroundStyle?: string
    profileBackgroundVideoUrl?: string
    profilePatternStyle?: string
    frameCustomOverlayUrl?: string
    framePosterOverlayUrl?: string
    coinBalance?: number
    activeFrameId?: string
    activeBackgroundId?: string
    activePatternId?: string
    activeProfileEffectId?: string
    createdAt?: string
    updatedAt?: string
    boostFrameStyle?: string
    vanitySlugChangedAt?: string
    activeProfileEffectAssets?: StoreProfileEffectAssets
    /** Two-color hover card theme (boost capability: canUseHoverTheme) */
    hoverTheme?: {
        mainColor: string
        accentColor: string
        /** Theme v2: scene style and pattern (absent in old records; defaults to aurora / no pattern). */
        style?: ProfileThemeStyle
        pattern?: ProfileThemePattern
    }
    /** Name style; v2 also carries motion / fill / effect color (same schema as the user name style). */
    activeNameStyle?: {
        version?: number
        fontId?: string
        effectId?: string
        colorId?: string
        secondaryColorId?: string
        motionId?: string
        fillId?: string
        fxTint?: string
        fxColors?: string[]
    }
    /** Envanter (EÅŸya ID'leri listesi veya detaylÄ± obje) */
    inventory?: Array<{
        id: string
        storeItemId: string
        name: string
        type: string
        image: string
        customAssetUrl?: string
    }>

}

export interface FansubTransaction {
    id: string
    fansubId: string
    amount: number
    type: 'redeem' | 'purchase' | 'reward_view' | 'reward_rank' | 'reward_task' | 'donation' | 'system'
    description: string
    createdAt: string
}


/** Comment type, shared by manga detail and community detail */
export interface Comment {
    id: string
    username: string
    userId: string
    activeFansubIdentityTag?: FansubIdentityTagPresentation | null
    avatar: string
    text: string
    isSpoiler?: boolean
    likes: number
    dislikes: number
    date: string
    replies?: Comment[]
    isLiked?: boolean
    isDisliked?: boolean
    frameType?: CommunityPost['frameType']
    frameCustomOverlayUrl?: string
    framePosterOverlayUrl?: string
    isPinned?: boolean
    canModerate?: boolean
    reportCount?: number
    profileBackgroundStyle?: string
    profileBackgroundVideoUrl?: string
    profilePatternStyle?: string
    primaryColor?: string
    secondaryColor?: string
    /** The author's public name style (premium); otherwise the name renders plainly. */
    nameStyle?: NameTextStyleSelection | null
}

/** Ä°liÅŸkili manga (inceleme / bÃ¶lÃ¼m tartÄ±ÅŸmasÄ± / teori) */
export interface RelatedManga {
    id: string
    title: string
    slug?: string
    coverImage?: string
}

/** Ä°liÅŸkili fansub (duyuru vb.) */
export interface RelatedFansub {
    id: string
    name: string
    slug?: string
    avatar?: string
    description?: string
    mangaCount?: number
    followerCount?: number
    frameType?: FrameTypeValue
    primaryColor?: string
    secondaryColor?: string
    profileBackgroundStyle?: string
    profileBackgroundVideoUrl?: string
    profilePatternStyle?: string
}

export interface RelatedUser {
    id: string
    username: string
    activeFansubIdentityTag?: FansubIdentityTagPresentation | null
    avatar?: string
    displayName?: string
    bio?: string
    followerCount?: number
    frameType?: FrameTypeValue
    primaryColor?: string
    secondaryColor?: string
    profileBackgroundStyle?: string
    profileBackgroundVideoUrl?: string
    profilePatternStyle?: string
}

export interface CommunityPostAuthorFansub {
    id: string
    name: string
    slug: string
    avatar?: string
    /** The fansub's name style if boosted (v1/v2); otherwise the name renders plainly. */
    activeNameStyle?: Record<string, unknown> | null
}

export interface CommunityGifSelection {
    provider: 'tenor'
    providerAssetId: string
    originalUrl: string
    previewUrl: string
    width: number
    height: number
    altText?: string
}

export interface CommunityPostAsset {
    id: string
    postId: string
    assetType: 'gif' | 'image'
    provider: 'tenor' | 'r2'
    providerAssetId: string
    originalUrl: string
    previewUrl: string
    width: number
    height: number
    altText?: string
    position?: number
    isSpoiler?: boolean
    metadata?: Record<string, unknown>
}

export interface CommunityPostPollOption {
    id: string
    label: string
    position: number
    votesCount: number
}

export interface CommunityPostPoll {
    id: string
    postId: string
    closesAt: string
    isClosed: boolean
    totalVotesCount: number
    viewerHasVoted: boolean
    viewerOptionId?: string
    options: CommunityPostPollOption[]
}

export interface CommunityReactionSummaryItem {
    emoji: '😂' | '😮' | '😢' | '😡' | '👎' | '🔥' | '👏'
    count: number
}

export interface CommunityReactionSummary {
    currentEmoji?: '😂' | '😮' | '😢' | '😡' | '👎' | '🔥' | '👏'
    totalCount: number
    items: CommunityReactionSummaryItem[]
}

/**
 * Topluluk kartÄ± tipi
 */
export interface CommunityPost {
    id: string
    username: string
    displayName?: string
    activeFansubIdentityTag?: FansubIdentityTagPresentation | null
    avatar: string
    authorType?: 'user' | 'fansub'
    authorUserId?: string
    authorFansub?: CommunityPostAuthorFansub
    category?: string
    title?: string
    description?: string
    likes?: number
    comments?: number
    primaryColor?: string
    secondaryColor?: string
    profileBackgroundStyle?: string
    profileBackgroundVideoUrl?: string
    profilePatternStyle?: string
    frameType?: FrameTypeValue
    frameCustomOverlayUrl?: string
    framePosterOverlayUrl?: string
    isVerified?: boolean
    /** Manga incelemesi / bÃ¶lÃ¼m tartÄ±ÅŸmasÄ± / teori iÃ§in */
    relatedManga?: RelatedManga
    /** BÃ¶lÃ¼m tartÄ±ÅŸmasÄ± iÃ§in */
    chapterNumber?: number
    /** Duyuru vb. iÃ§in iliÅŸkili fansublar */
    relatedFansubs?: RelatedFansub[]
    /** Icerikte mention edilen mangalar */
    mentionedMangas?: RelatedManga[]
    /** Users tagged in the content */
    mentionedUsers?: RelatedUser[]
    /** Kullanici paylasim etiketleri */
    tags?: string[]
    /** Duyuru alt kategorisi */
    announcementCategory?: string
    /** Duyuru metin rengi */
    announcementTextColor?: string
    /** Duyuru metin animasyonu */
    announcementTextAnimation?: 'marquee' | 'pulse' | 'blink' | 'slide' | 'none'
    /** Duyuru aksiyon metni */
    announcementActionLabel?: string
    /** Duyuru aksiyon adresi */
    announcementActionUrl?: string
    /** Moderation status info (admin) */
    status?: 'pending' | 'approved' | 'rejected'
    /** Gorunurluk bilgisi (admin) */
    isActive?: boolean
    /** Kayit zamanlari (admin) */
    createdAt?: string
    updatedAt?: string
    /** Goruntulenme bilgisi (admin/detail) */
    viewCount?: number
    /** Paylasim sayisi */
    shareCount?: number
    /** Emoji reaction sayisi */
    reactionCount?: number
    /** Ankette kullanilan toplam oy */
    pollVotesCount?: number
    /** Zengin medya/GIF */
    asset?: CommunityPostAsset
    /** Zengin medya galeri sirasi */
    assets?: CommunityPostAsset[]
    /** Tek secimli anket */
    poll?: CommunityPostPoll
    /** Post reaction ozetleri */
    reactionSummary?: CommunityReactionSummary
    /** Red nedeni (admin) */
    rejectReason?: string
    /** Onay / ret zamani (admin) */
    approvedAt?: string
    rejectedAt?: string
}

/**
 * KullanÄ±cÄ± profili tipi
 */
export interface UserProfile {
    id: string
    username: string
    email?: string
    avatar?: string
    bio?: string
    joinDate?: string
    level?: string
    stats?: {
        reading: number
        followers: number
        following: number
    }
    badges?: Array<{
        id: number
        icon: string
        name: string
        color: string
    }>
    socialLinks?: Array<{
        platform: string
        username: string
    }>
}

/**
 * Filtre seÃ§enekleri
 */
export interface FilterOptions {
    genre?: string | null
    status?: string | null
    sort?: string
    search?: string
}

/**
 * Sayfalama bilgisi
 */
export interface Pagination {
    currentPage: number
    totalPages: number
    totalItems: number
    itemsPerPage: number
}
