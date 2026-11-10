export const FANSUB_SUPPORTER_ASSET_SHORTCODE_MIN_LENGTH = 2
export const FANSUB_SUPPORTER_ASSET_SHORTCODE_MAX_LENGTH = 16
export const FANSUB_SUPPORTER_ASSET_LABEL_MAX_LENGTH = 20
export const FANSUB_SUPPORTER_ASSET_MIN_SCALE = 1
export const FANSUB_SUPPORTER_ASSET_MAX_SCALE = 2.75
export const FANSUB_SUPPORTER_ASSET_OFFSET_LIMIT = 45
export const FANSUB_SUPPORTER_ASSET_ROTATION_STEP = 90

export type FansubSupporterAssetFitMode = 'cover' | 'contain'

export interface FansubSupporterAssetPresentation {
  version: 1
  fitMode: FansubSupporterAssetFitMode
  scale: number
  offsetX: number
  offsetY: number
  rotation: number
}

export function getDefaultFansubSupporterAssetPresentation(
  kind: 'emoji' | 'sticker',
): FansubSupporterAssetPresentation {
  return {
    version: 1,
    fitMode: kind === 'emoji' ? 'cover' : 'contain',
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    rotation: 0,
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function normalizeRotation(value: number) {
  if (!Number.isFinite(value)) return 0
  const normalized = ((Math.round(value / FANSUB_SUPPORTER_ASSET_ROTATION_STEP) * FANSUB_SUPPORTER_ASSET_ROTATION_STEP) % 360 + 360) % 360
  return normalized
}

export function normalizeFansubSupporterAssetPresentation(
  input: Partial<FansubSupporterAssetPresentation> | null | undefined,
  kind: 'emoji' | 'sticker',
): FansubSupporterAssetPresentation {
  const fallback = getDefaultFansubSupporterAssetPresentation(kind)
  return {
    version: 1,
    fitMode: input?.fitMode === 'contain' || input?.fitMode === 'cover' ? input.fitMode : fallback.fitMode,
    scale: clamp(Number(input?.scale) || fallback.scale, FANSUB_SUPPORTER_ASSET_MIN_SCALE, FANSUB_SUPPORTER_ASSET_MAX_SCALE),
    offsetX: clamp(Number(input?.offsetX) || fallback.offsetX, -FANSUB_SUPPORTER_ASSET_OFFSET_LIMIT, FANSUB_SUPPORTER_ASSET_OFFSET_LIMIT),
    offsetY: clamp(Number(input?.offsetY) || fallback.offsetY, -FANSUB_SUPPORTER_ASSET_OFFSET_LIMIT, FANSUB_SUPPORTER_ASSET_OFFSET_LIMIT),
    rotation: normalizeRotation(Number(input?.rotation) || fallback.rotation),
  }
}

export function buildFansubSupporterAssetTransformStyle(
  presentation: FansubSupporterAssetPresentation,
) {
  return {
    objectFit: presentation.fitMode,
    transform: `translate(${presentation.offsetX}%, ${presentation.offsetY}%) scale(${presentation.scale}) rotate(${presentation.rotation}deg)`,
    transformOrigin: 'center center',
  } as const
}
