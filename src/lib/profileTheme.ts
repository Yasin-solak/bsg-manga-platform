import type { CSSProperties } from 'react'
import { parseHoverCardTheme, type HoverCardThemeColors } from '@/components/common/hoverCardTheme'
import { txa } from '@/i18n/activeLocale'

/*
 * Profile theme (formerly hover card theme): two colors + scene style + pattern. Paints the profile page's
 * scene, side showcase cards, buttons and the hover card. Stored on the server as owned_items
 * .active_hover_theme (version 2); old records without style / pattern use defaults.
 */

export const PROFILE_THEME_STYLES = ['aurora', 'gradient', 'spotlight', 'mesh'] as const
export const PROFILE_THEME_PATTERNS = ['none', 'dots', 'grid', 'stars', 'waves', 'noise'] as const
export type ProfileThemeStyle = (typeof PROFILE_THEME_STYLES)[number]
export type ProfileThemePattern = (typeof PROFILE_THEME_PATTERNS)[number]

export interface ProfileTheme extends HoverCardThemeColors {
  style: ProfileThemeStyle
  pattern: ProfileThemePattern
}

export const PROFILE_THEME_STYLE_LABEL: Record<ProfileThemeStyle, string> = {
  get aurora() { return txa('Aurora') },
  get gradient() { return txa('Gradyan') },
  get spotlight() { return txa('Spot ışık') },
  get mesh() { return txa('Mozaik') },
}

export const PROFILE_THEME_PATTERN_LABEL: Record<ProfileThemePattern, string> = {
  get none() { return txa('Yok') },
  get dots() { return txa('Noktalar') },
  get grid() { return txa('Izgara') },
  get stars() { return txa('Yıldızlar') },
  get waves() { return txa('Dalgalar') },
  get noise() { return txa('Gren') },
}

export interface ProfileThemePreset extends ProfileTheme {
  id: string
  name: string
}

// Ready-made themes: color + style + pattern together (a consistent look in one tap).
export const PROFILE_THEME_PRESETS: ProfileThemePreset[] = [
  { id: 'neon-uzay', get name() { return txa('Neon Uzay') }, mainColor: '#14b8a6', accentColor: '#5b21b6', style: 'aurora', pattern: 'stars' },
  { id: 'fusya-gece', get name() { return txa('Fuşya Gece') }, mainColor: '#d916b8', accentColor: '#1a1024', style: 'spotlight', pattern: 'none' },
  { id: 'kizil-alacakaranlik', get name() { return txa('Kızıl Alacakaranlık') }, mainColor: '#ef4444', accentColor: '#3b0a12', style: 'gradient', pattern: 'noise' },
  { id: 'sakura-ink', get name() { return txa('Sakura Ink') }, mainColor: '#f08ab7', accentColor: '#4d253f', style: 'mesh', pattern: 'dots' },
  { id: 'bulut-teal', get name() { return txa('Bulut Teal') }, mainColor: '#0ea5b7', accentColor: '#9aad7f', style: 'aurora', pattern: 'waves' },
  { id: 'altin-saat', get name() { return txa('Altın Saat') }, mainColor: '#f5c451', accentColor: '#7c2d12', style: 'spotlight', pattern: 'noise' },
  { id: 'okyanus', get name() { return txa('Okyanus') }, mainColor: '#3b82f6', accentColor: '#0e7490', style: 'gradient', pattern: 'waves' },
  { id: 'zumrut', get name() { return txa('Zümrüt') }, mainColor: '#10b981', accentColor: '#064e3b', style: 'mesh', pattern: 'grid' },
  { id: 'lavanta', get name() { return txa('Lavanta') }, mainColor: '#a78bfa', accentColor: '#f0abfc', style: 'aurora', pattern: 'dots' },
  { id: 'gece-yarisi', get name() { return txa('Gece Yarısı') }, mainColor: '#334155', accentColor: '#0c0f16', style: 'spotlight', pattern: 'stars' },
  { id: 'grafit-altin', get name() { return txa('Grafit Altın') }, mainColor: '#f5c451', accentColor: '#1f2937', style: 'gradient', pattern: 'grid' },
  { id: 'siber', get name() { return txa('Siber') }, mainColor: '#22d3ee', accentColor: '#e11d48', style: 'mesh', pattern: 'grid' },
]

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? value as T : fallback
}

export function parseProfileTheme(value: unknown): ProfileTheme | null {
  const colors = parseHoverCardTheme(value)
  if (!colors) return null
  const record = value as Record<string, unknown>
  return {
    ...colors,
    style: pick(record.style, PROFILE_THEME_STYLES, 'aurora'),
    pattern: pick(record.pattern, PROFILE_THEME_PATTERNS, 'none'),
  }
}

export function sameProfileTheme(a: ProfileTheme | null, b: ProfileTheme | null) {
  if (!a || !b) return a === b
  return a.mainColor === b.mainColor && a.accentColor === b.accentColor && a.style === b.style && a.pattern === b.pattern
}

type Rgb = { r: number, g: number, b: number }

function hexToRgb(hex: string): Rgb {
  const value = Number.parseInt(hex.slice(1), 16)
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 }
}

function mix(a: Rgb, b: Rgb, amount: number): Rgb {
  return { r: Math.round(a.r + (b.r - a.r) * amount), g: Math.round(a.g + (b.g - a.g) * amount), b: Math.round(a.b + (b.b - a.b) * amount) }
}

function css(color: Rgb, alpha = 1) {
  return alpha >= 1 ? `rgb(${color.r} ${color.g} ${color.b})` : `rgb(${color.r} ${color.g} ${color.b} / ${alpha})`
}

function luminance(color: Rgb) {
  const channel = (value: number) => {
    const normalized = value / 255
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b)
}

const WHITE: Rgb = { r: 255, g: 255, b: 255 }
const INK: Rgb = { r: 7, g: 8, b: 11 }

// Tema yokken sahnenin notr hali.
const NEUTRAL: ProfileTheme = { mainColor: '#3a3f4b', accentColor: '#14161c', style: 'spotlight', pattern: 'none' }

export function resolveStageTheme(theme: ProfileTheme | null): ProfileTheme {
  return theme ?? NEUTRAL
}

/**
 * Scene-scoped tokens: an accent readable on the dark scene (buttons), a theme-tinted surface
 * (side cards) and a frame. The scene is dark in every theme, so text is light.
 */
export function profileStageVars(theme: ProfileTheme | null): CSSProperties {
  const resolved = resolveStageTheme(theme)
  const main = hexToRgb(resolved.mainColor)
  const accent = hexToRgb(resolved.accentColor)
  // Button color: the brighter of the two colors, lightened enough to read on the dark scene.
  let button = luminance(main) >= luminance(accent) ? main : accent
  let guard = 0
  while (luminance(button) < 0.2 && guard < 6) { button = mix(button, WHITE, 0.22); guard += 1 }
  // Button text: whichever of dark ink and white gives more contrast (a fixed threshold misleads on mid tones).
  const buttonLuminance = luminance(button)
  const inkContrast = (buttonLuminance + 0.05) / (luminance(INK) + 0.05)
  const whiteContrast = 1.05 / (buttonLuminance + 0.05)
  const buttonInk = inkContrast >= whiteContrast ? INK : WHITE
  const surface = mix(mix(main, accent, 0.5), INK, 0.78)
  return {
    '--profile-main': css(main),
    '--profile-accent': css(accent),
    '--profile-surface': css(surface, 0.62),
    '--profile-surface-border': css(mix(button, WHITE, 0.3), 0.16),
    '--profile-glow': css(button, 0.35),
    '--primary': css(button),
    '--primary-foreground': css(buttonInk),
    '--ring': css(button),
  } as CSSProperties
}

/** A very faint theme trace for the page under the scene (readable in both site themes). */
export function profilePageTint(theme: ProfileTheme | null) {
  if (!theme) return undefined
  return `radial-gradient(1200px 520px at 50% 0%, color-mix(in oklch, ${theme.mainColor} 14%, transparent), transparent 70%)`
}

export function themeSwatch(theme: Pick<ProfileTheme, 'mainColor' | 'accentColor'>) {
  return `linear-gradient(135deg, ${theme.mainColor}, ${theme.accentColor})`
}
