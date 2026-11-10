import type { CSSProperties } from 'react'
import {
  DEFAULT_NAME_TEXT_COLOR_ID,
  DEFAULT_NAME_TEXT_EFFECT_ID,
  DEFAULT_NAME_TEXT_FONT_ID,
  DEFAULT_NAME_TEXT_MOTION_ID,
  DEFAULT_NAME_TEXT_SECONDARY_COLOR_ID,
  buildNameTextStyleVars,
  buildStandardNameTextStyleVars,
  getNameTextStyleClassName,
  getStandardNameTextClassName,
  hasNameTextPremiumAccess,
  isNameAssetEffectId,
  isNameTextCustomColor,
  nameColorContrast,
  nameColorLuminance,
  resolveKnownNameTextColorId,
  resolveKnownNameTextEffectId,
  resolveKnownNameTextFontId,
  resolveKnownNameTextMotionId,
  resolveNameTextColorHex,
  type NameTextCustomColor,
  type NameTextEffectId,
  type NameTextFillId,
  type NameTextFxTint,
  type NameTextStyleSelection,
} from './nameTextEffects'

function toRecord(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {} as Record<string, unknown>
  return value as Record<string, unknown>
}

/*
 * User name style (v2): typeface + color (solid / gradient, palette or free color) + only
 * animated effects (Shop Control) + effect color + motion. Old CSS effects (Glow, Glitch...)
 * can no longer be selected by users: saved ones become a plain style keeping typeface and color;
 * gradient effects (Satin / Prismatic) become gradient fills. Fansub name styles keep using
 * old effects (getNameTextStyleClassName renders the raw selection).
 */
const LEGACY_GRADIENT_EFFECT_IDS = new Set<string>(['gradient', 'prism'])
export const DEFAULT_NAME_TEXT_FX_COLORS: [NameTextCustomColor, NameTextCustomColor] = ['#22d3ee', '#3b82f6']

/** Fill + effect color selection in the profile editor (one state object). */
export type NameTextFxSelection = {
  fillId: NameTextFillId
  fxTint: NameTextFxTint
  fxColors: [NameTextCustomColor, NameTextCustomColor]
}

export const DEFAULT_NAME_TEXT_FX_SELECTION: NameTextFxSelection = {
  fillId: 'solid',
  fxTint: 'original',
  fxColors: ['#22d3ee', '#3b82f6'],
}

export function pickNameTextFxSelection(style: NameTextStyleSelection | null | undefined): NameTextFxSelection {
  return {
    fillId: style?.fillId ?? DEFAULT_NAME_TEXT_FX_SELECTION.fillId,
    fxTint: style?.fxTint ?? DEFAULT_NAME_TEXT_FX_SELECTION.fxTint,
    fxColors: style?.fxColors ?? DEFAULT_NAME_TEXT_FX_SELECTION.fxColors,
  }
}

function readFxColors(value: unknown): [NameTextCustomColor, NameTextCustomColor] | undefined {
  if (!Array.isArray(value)) return undefined
  const [a, b] = value.map((entry) => (typeof entry === 'string' ? entry.trim().toLowerCase() : ''))
  if (!isNameTextCustomColor(a)) return undefined
  return [a, isNameTextCustomColor(b) ? b : a]
}

export function normalizeUserNameTextStyle(raw: unknown, legacyEffectId?: string | null): NameTextStyleSelection {
  const style = toRecord(raw)
  const read = (key: string) => (typeof style[key] === 'string' ? style[key] as string : null)
  const rawEffectId = resolveKnownNameTextEffectId(read('effectId') || legacyEffectId || null)
  const fillId: NameTextFillId = read('fillId') === 'gradient' || (rawEffectId !== null && LEGACY_GRADIENT_EFFECT_IDS.has(rawEffectId)) ? 'gradient' : 'solid'
  const effectId: NameTextEffectId = isNameAssetEffectId(rawEffectId) ? rawEffectId : DEFAULT_NAME_TEXT_EFFECT_ID
  const tint = read('fxTint')
  const fxTint: NameTextFxTint = tint === 'name' || tint === 'custom' ? tint : 'original'
  return {
    fontId: resolveKnownNameTextFontId(read('fontId')) || DEFAULT_NAME_TEXT_FONT_ID,
    effectId,
    colorId: resolveKnownNameTextColorId(read('colorId')) || DEFAULT_NAME_TEXT_COLOR_ID,
    secondaryColorId: resolveKnownNameTextColorId(read('secondaryColorId')) || DEFAULT_NAME_TEXT_SECONDARY_COLOR_ID,
    motionId: resolveKnownNameTextMotionId(read('motionId')) || DEFAULT_NAME_TEXT_MOTION_ID,
    fillId,
    fxTint,
    fxColors: readFxColors(style.fxColors) ?? DEFAULT_NAME_TEXT_FX_COLORS,
  }
}

/**
 * Public name style passed through the server's premium gate (public_user_directory.active_name_style).
 * Null if empty or invalid: the name renders in the standard style.
 */
export function parsePublicNameTextStyle(value: unknown): NameTextStyleSelection | null {
  const style = toRecord(value)
  if (!Object.keys(style).length) return null
  return normalizeUserNameTextStyle(style)
}

// The name's visible colors (for contrast math): effect colors if the inner layer is effect-tinted, otherwise the fill.
function visibleNameColors(style: NameTextStyleSelection) {
  const primary = resolveNameTextColorHex(style.colorId)
  const fill = style.fillId === 'gradient' ? [primary, resolveNameTextColorHex(style.secondaryColorId)] : [primary]
  if (style.fxTint === 'custom' && isNameAssetEffectId(style.effectId) && style.fxColors) return [...fill, ...style.fxColors]
  return fill
}

/**
 * Contrast shield: if name colors are too close to the background (e.g. a profile theme), the name gets a
 * thin outline in a contrasting tone. Colors do not change; the name stays readable on any background. Null if not needed.
 */
export function resolveNameContrastGuard(style: NameTextStyleSelection, surfaces: string[]) {
  const colors = visibleNameColors(style)
  const validSurfaces = surfaces.filter(isNameTextCustomColor)
  if (!validSurfaces.length) return null
  let worst = Number.POSITIVE_INFINITY
  for (const color of colors) for (const surface of validSurfaces) worst = Math.min(worst, nameColorContrast(color, surface))
  if (worst >= 2.2) return null
  const average = colors.reduce((sum, color) => sum + nameColorLuminance(color), 0) / colors.length
  return average > 0.35
    ? { '--name-guard': 'rgba(6, 8, 14, 0.9)' }
    : { '--name-guard': 'rgba(255, 255, 255, 0.92)' }
}

/** User name style class + variables (including effect color and the optional contrast shield). */
export function buildUserNameStyleProps(style: NameTextStyleSelection | null, options: { guardSurfaces?: string[] } = {}) {
  if (!style) return { className: getStandardNameTextClassName(), style: buildStandardNameTextStyleVars() as CSSProperties }
  const vars: CSSProperties & Record<string, string | number | undefined> = { ...buildNameTextStyleVars(style.colorId, style.secondaryColorId) }
  if (isNameAssetEffectId(style.effectId) && style.fxTint && style.fxTint !== 'original') {
    const primary = resolveNameTextColorHex(style.colorId)
    const [a, b] = style.fxTint === 'custom' && style.fxColors
      ? style.fxColors
      : [primary, style.fillId === 'gradient' ? resolveNameTextColorHex(style.secondaryColorId) : primary]
    vars['--name-fx-tint'] = `linear-gradient(100deg, ${a}, ${b})`
    vars['--name-fx-glow'] = a
  }
  const guard = options.guardSurfaces ? resolveNameContrastGuard(style, options.guardSurfaces) : null
  return {
    className: [getNameTextStyleClassName(style), guard ? 'name-guard' : ''].filter(Boolean).join(' '),
    style: { ...vars, ...guard } as CSSProperties,
  }
}

export function resolveNameTextStyleFromOwnedItems(ownedItems: unknown, premiumExpiresAt?: string | null) {
  const payload = toRecord(ownedItems)
  const hasPremiumAccess = hasNameTextPremiumAccess(payload, premiumExpiresAt)
  if (!hasPremiumAccess) {
    return {
      hasPremiumAccess: false,
      style: null as NameTextStyleSelection | null,
    }
  }

  return {
    hasPremiumAccess: true,
    style: normalizeUserNameTextStyle(
      payload.active_name_style,
      typeof payload.active_name_effect === 'string' ? payload.active_name_effect : null,
    ),
  }
}
