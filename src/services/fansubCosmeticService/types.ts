import type { FrameType } from '@/components/common/AvatarFrame'

export type StoreItemType = 'frame' | 'background' | 'pattern' | 'badge' | 'premium'

export type StoreCosmeticRow = {
  id: string
  type: StoreItemType
  identifier: string
  image_key: string | null
  custom_asset_url: string | null
  poster_asset_url: string | null
}

export type FansubCosmeticSource = {
  id: string
  frame_type?: string | null
  primary_color?: string | null
  secondary_color?: string | null
  custom_background_asset_url?: string | null
  active_frame_id?: string | null
  active_background_id?: string | null
  active_pattern_id?: string | null
}

export type FansubCardCosmetics = {
  frameType?: FrameType | string
  frameCustomOverlayUrl?: string
  framePosterOverlayUrl?: string
  primaryColor?: string
  secondaryColor?: string
  profileBackgroundStyle?: string
  profileBackgroundVideoUrl?: string
  profilePatternStyle?: string
}
