import { resolveSafeAssetUrl } from './assetUrlService'

export const PATTERN_PRESET_STYLES: Record<string, string> = {
  dots: 'radial-gradient(circle, rgba(0, 0, 0, 0.35) 2px, transparent 2px) 0 0 / 18px 18px',
  stripes: 'repeating-linear-gradient(90deg, rgba(0, 0, 0, 0.28) 0, rgba(0, 0, 0, 0.28) 2px, transparent 2px, transparent 18px)',
  grid: 'linear-gradient(rgba(0, 0, 0, 0.22) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 0, 0, 0.22) 1px, transparent 1px)',
  halftone: 'radial-gradient(circle at 20% 80%, rgba(0, 0, 0, 0.28) 2px, transparent 2px), radial-gradient(circle at 80% 20%, rgba(0, 0, 0, 0.28) 2px, transparent 2px)',
  zigzag: 'repeating-linear-gradient(45deg, rgba(0, 0, 0, 0.25) 0, rgba(0, 0, 0, 0.25) 8px, transparent 8px, transparent 16px)',
  waves: 'repeating-linear-gradient(0deg, rgba(0, 0, 0, 0.25) 0, rgba(0, 0, 0, 0.25) 2px, transparent 2px, transparent 8px)',
}

function isDirectPatternAsset(value: string) {
  return /^(https?:|data:|blob:|\/)/i.test(value)
}

export function resolvePatternStyle(rawValue?: string | null): string | undefined {
  if (!rawValue) return undefined

  const rawPreset = rawValue.trim().toLowerCase()
  const resolved = resolveSafeAssetUrl(rawValue)

  if (resolved && isDirectPatternAsset(resolved)) {
    return `center / cover no-repeat url("${resolved}")`
  }

  return PATTERN_PRESET_STYLES[rawPreset] || undefined
}

export function resolvePatternStyleWithFallback(
  rawValue?: string | null,
  fallbackPreset: keyof typeof PATTERN_PRESET_STYLES = 'dots',
): string {
  return resolvePatternStyle(rawValue) || PATTERN_PRESET_STYLES[fallbackPreset]
}
