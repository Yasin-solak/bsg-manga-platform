import avatarframe1Idle from '@/assets/frames/idle/avatarframe1-idle.webp'
import avatarframe2Idle from '@/assets/frames/idle/avatarframe2-idle.webp'
import avatarframe3Idle from '@/assets/frames/idle/avatarframe3-idle.webp'
import avatarframe4Idle from '@/assets/frames/idle/avatarframe4-idle.webp'
import type { StoreItem } from '@/data/storeProducts'
import { resolveStoreAssetUrl } from '@/services/assetUrlService'

// A still frame for built-in frames with no poster image.
const BUILT_IN_FRAME_POSTERS: Record<string, string> = {
  avatarframe1: avatarframe1Idle,
  avatarframe2: avatarframe2Idle,
  avatarframe3: avatarframe3Idle,
  avatarframe4: avatarframe4Idle,
}

export function resolveFrameOverlayUrl(item: StoreItem) {
  return resolveStoreAssetUrl(item.customAssetUrl) || item.customAssetUrl
}

export function resolveFramePosterUrl(item: StoreItem) {
  const builtIn = BUILT_IN_FRAME_POSTERS[(item.frameType || '').trim().toLowerCase()]
  return resolveStoreAssetUrl(item.posterAssetUrl) || item.posterAssetUrl || builtIn
}
