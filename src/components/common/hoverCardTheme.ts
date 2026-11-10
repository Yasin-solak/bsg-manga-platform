import type { CSSProperties } from 'react'

export interface HoverCardThemeColors {
  mainColor: string
  accentColor: string
}

const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i

export function isValidHoverThemeColor(value?: string | null) {
  return Boolean(value && HEX_COLOR_PATTERN.test(value))
}

export function normalizeHoverThemeColor(value: string, fallback: string) {
  const candidate = value.trim().replace(/^#?/, '#')
  return isValidHoverThemeColor(candidate) ? candidate.toLowerCase() : fallback
}

export function hasValidHoverCardTheme(
  colors?: HoverCardThemeColors | null,
): colors is HoverCardThemeColors {
  return Boolean(colors && isValidHoverThemeColor(colors.mainColor) && isValidHoverThemeColor(colors.accentColor))
}

/** Safely parses the jsonb hover theme from the DB; null if invalid. */
export function parseHoverCardTheme(value: unknown): HoverCardThemeColors | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const mainColor = typeof record.mainColor === 'string' ? record.mainColor.trim().toLowerCase() : ''
  const accentColor = typeof record.accentColor === 'string' ? record.accentColor.trim().toLowerCase() : ''
  const candidate = { mainColor, accentColor }
  return hasValidHoverCardTheme(candidate) ? candidate : null
}

interface Rgb {
  r: number
  g: number
  b: number
}

const DARK_TEXT: Rgb = { r: 26, g: 22, b: 32 }
const LIGHT_TEXT: Rgb = { r: 250, g: 250, b: 253 }

function hexToRgb(hex: string): Rgb {
  const value = Number.parseInt(hex.slice(1), 16)
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 }
}

function mixRgb(from: Rgb, to: Rgb, amount: number): Rgb {
  return {
    r: Math.round(from.r + (to.r - from.r) * amount),
    g: Math.round(from.g + (to.g - from.g) * amount),
    b: Math.round(from.b + (to.b - from.b) * amount),
  }
}

function toCssColor(color: Rgb, alpha = 1) {
  return alpha >= 1
    ? `rgb(${color.r} ${color.g} ${color.b})`
    : `rgb(${color.r} ${color.g} ${color.b} / ${alpha})`
}

function channelLuminance(channel: number) {
  const normalized = channel / 255
  return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
}

function relativeLuminance(color: Rgb) {
  return 0.2126 * channelLuminance(color.r) + 0.7152 * channelLuminance(color.g) + 0.0722 * channelLuminance(color.b)
}

export interface HoverCardThemeStyleOptions {
  /**
   * Did the user upload an image/video in the banner area? If so the banner
   * darkening uses neutral black, NOT the theme color, so it does not cover the
   * uploaded media. If the banner is empty the theme color paints the area.
   */
  hasCustomBackground?: boolean
}

/**
 * Discord-style hover theme: the body takes a Main -> Theme Color vertical gradient and
 * card-scoped design tokens (--foreground, --border, --primary...) are
 * recalculated to keep readability. On light themes text
 * darkens automatically.
 *
 * Banner: if the user uploaded a background the theme DOES NOT TOUCH COLOR (neutral black
 * darkening), so the theme paints only an empty banner area and does not cover the
 * uploaded image/video.
 */
export function buildHoverCardThemeStyle(
  colors?: HoverCardThemeColors | null,
  baseStyle?: CSSProperties,
  options?: HoverCardThemeStyleOptions,
): CSSProperties | undefined {
  if (!hasValidHoverCardTheme(colors)) {
    return baseStyle
  }

  const main = hexToRgb(colors.mainColor)
  const accent = hexToRgb(colors.accentColor)
  const mid = mixRgb(main, accent, 0.5)

  // Metnin uzerinde durdugu govde agirlikli ton: kartin alt 2/3'u mid->accent akar.
  const bodyLuminance = relativeLuminance(mid) * 0.55 + relativeLuminance(accent) * 0.45
  const useDarkText = bodyLuminance > 0.42

  const foreground = useDarkText ? DARK_TEXT : LIGHT_TEXT
  const mutedForeground = mixRgb(foreground, mid, 0.34)
  const surface = useDarkText ? mixRgb(mid, LIGHT_TEXT, 0.52) : mixRgb(mid, DARK_TEXT, 0.42)
  const border = mixRgb(foreground, mid, 0.6)
  const interactive = mixRgb(accent, foreground, 0.55)

  // With background media the banner darkening stays neutral; otherwise the theme's Main color.
  const hasCustomBackground = options?.hasCustomBackground === true
  const bannerFade = hasCustomBackground ? 'rgb(0 0 0 / 0.8)' : toCssColor(main, 0.92)
  const bannerFadeMid = hasCustomBackground ? 'rgb(0 0 0 / 0.4)' : toCssColor(main, 0.4)

  const themeVars: Record<string, string> = {
    '--background': toCssColor(surface),
    '--foreground': toCssColor(foreground),
    '--card': toCssColor(mid),
    '--card-foreground': toCssColor(foreground),
    '--muted': toCssColor(surface),
    '--muted-foreground': toCssColor(mutedForeground),
    '--border': toCssColor(border),
    '--input': toCssColor(border),
    '--ring': toCssColor(interactive),
    '--primary': toCssColor(interactive),
    '--primary-foreground': toCssColor(useDarkText ? LIGHT_TEXT : DARK_TEXT),
    '--hover-card-banner-fade': bannerFade,
    '--hover-card-banner-fade-mid': bannerFadeMid,
  }

  return {
    ...baseStyle,
    ...themeVars,
    // The body gradient ALSO covers the banner area; with background media the banner
    // layer (renderBannerLayer) covers this gradient.
    background: `linear-gradient(180deg, ${toCssColor(main)} 0%, ${toCssColor(mid)} 52%, ${toCssColor(accent)} 100%)`,
    borderColor: toCssColor(mixRgb(accent, foreground, 0.3), 0.9),
    color: toCssColor(foreground),
  } as CSSProperties
}
