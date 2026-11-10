export type FrameType =
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

export const FRAME_TYPES = new Set<FrameType>([
  'christmas',
  'halloween',
  'avatarframe1',
  'avatarframe2',
  'avatarframe3',
  'avatarframe4',
  'fire',
  'ice',
  'neon',
  'gold',
  'rainbow',
  'default',
])

export type LazyFrameAsset = 'christmas' | 'halloween' | 'avatarframe1' | 'avatarframe2' | 'avatarframe3' | 'avatarframe4'

export const FRAME_ASSET_LOADERS: Record<LazyFrameAsset, () => Promise<{ default: string }>> = {
  christmas: () => import('../../../assets/frames/christmas-frame.png'),
  halloween: () => import('../../../assets/frames/halloween-frame.png'),
  avatarframe1: () => import('../../../assets/frames/avatarframe1.webp'),
  avatarframe2: () => import('../../../assets/frames/avatarframe2.webp'),
  avatarframe3: () => import('../../../assets/frames/avatarframe3.webp'),
  avatarframe4: () => import('../../../assets/frames/avatarframe4.webp'),
}

export const FRAME_IDLE_ASSET_LOADERS: Partial<Record<LazyFrameAsset, () => Promise<{ default: string }>>> = {
  avatarframe1: () => import('../../../assets/frames/idle/avatarframe1-idle.webp'),
  avatarframe2: () => import('../../../assets/frames/idle/avatarframe2-idle.webp'),
  avatarframe3: () => import('../../../assets/frames/idle/avatarframe3-idle.webp'),
  avatarframe4: () => import('../../../assets/frames/idle/avatarframe4-idle.webp'),
}

export type AvatarFrameBehavior = 'asset-first' | 'legacy-loop-only' | 'particle' | 'default'

const ASSET_FIRST_FRAME_TYPES = new Set<FrameType>([
  'avatarframe1',
  'avatarframe2',
  'avatarframe3',
  'avatarframe4',
])

const LEGACY_LOOP_ONLY_FRAME_TYPES = new Set<FrameType>([
  'fire',
  'ice',
  'neon',
  'gold',
  'rainbow',
])

const PARTICLE_FRAME_TYPES = new Set<FrameType>([
  'christmas',
  'halloween',
])

function normalizeFrameType(value: string | null | undefined) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

// We keep avatar frame behavior in one place.
// Why: as new assets/presets arrive, old loop-only frames should not be
// forced into poster/idle logic by accident.
export function resolveAvatarFrameBehavior(frameType?: string | null): AvatarFrameBehavior {
  const normalized = normalizeFrameType(frameType)
  if (!normalized || normalized === 'default') return 'default'
  if (ASSET_FIRST_FRAME_TYPES.has(normalized as FrameType)) return 'asset-first'
  if (LEGACY_LOOP_ONLY_FRAME_TYPES.has(normalized as FrameType)) return 'legacy-loop-only'
  if (PARTICLE_FRAME_TYPES.has(normalized as FrameType)) return 'particle'
  return 'default'
}

export function isAssetFirstAvatarFrame(frameType?: string | null) {
  return resolveAvatarFrameBehavior(frameType) === 'asset-first'
}

export function isLegacyLoopOnlyAvatarFrame(frameType?: string | null) {
  return resolveAvatarFrameBehavior(frameType) === 'legacy-loop-only'
}

export interface AvatarFrameProps {
  src?: string | null
  alt?: string
  frameType: FrameType | string
  size?: number
  animated?: boolean
  customOverlayUrl?: string
  posterOverlayUrl?: string
  disableStoreLookup?: boolean
  hoverPlayback?: 'auto' | 'always' | 'never'
  hoverActive?: boolean
  hoverDelayMs?: number
}
