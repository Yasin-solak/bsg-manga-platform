type StoreItemType = 'frame' | 'background' | 'pattern' | 'badge' | 'premium' | 'profile_effect'

export type StoreCosmeticRow = {
    id: string
    type: StoreItemType
    identifier: string
    image_key: string | null
    custom_asset_url: string | null
    poster_asset_url: string | null
}

export type CommunityCosmeticUserData = {
    id?: string | null
    frame_type?: string | null
    background_type?: string | null
}

export type CommunityCosmeticFansubData = {
    frame_type?: string | null
    active_frame_id?: string | null
    active_background_id?: string | null
    active_pattern_id?: string | null
    custom_background_asset_url?: string | null
    primary_color?: string | null
    secondary_color?: string | null
}

export type CommunityCosmeticPostRow = {
    id: string
    author_id?: string | null
    frame_type?: string | null
    primary_color?: string | null
    secondary_color?: string | null
    related_fansub_id?: string | null
    users?: CommunityCosmeticUserData | CommunityCosmeticUserData[] | null
    user?: CommunityCosmeticUserData | CommunityCosmeticUserData[] | null
    fansub?: CommunityCosmeticFansubData | CommunityCosmeticFansubData[] | null
}

export type CommunityCosmeticFansubRow = {
    id: string
    frame_type?: string | null
    active_frame_id?: string | null
    active_background_id?: string | null
    active_pattern_id?: string | null
    custom_background_asset_url?: string | null
    primary_color?: string | null
    secondary_color?: string | null
}

export type CommunityCardCosmetics = {
    frameType?: string
    frameOverlayUrl?: string
    framePosterUrl?: string
    backgroundStyle?: string
    backgroundVideoUrl?: string
    patternStyle?: string
    primaryColor?: string
    secondaryColor?: string
}
