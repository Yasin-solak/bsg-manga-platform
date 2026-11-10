import type { CSSProperties } from 'react'
import {
  DEFAULT_NAME_TEXT_MOTION_ID,
  DEFAULT_NAME_TEXT_SECONDARY_COLOR_ID,
  type NameTextColorId,
  type NameTextEffectId,
  type NameTextFontId,
  type NameTextMotionId,
  type NameTextStyleSelection,
} from '@/data/nameTextEffects'
import {
  DEFAULT_NAME_TEXT_FX_SELECTION,
  buildUserNameStyleProps,
  normalizeUserNameTextStyle,
  type NameTextFxSelection,
} from '@/data/userNameStyle'

/*
 * Fansub name style v2: same schema as the user name style (font, effect, two colors + motion,
 * fill, effect color) and same rendering (buildUserNameStyleProps). Old v1 records
 * convert through normalizeUserNameTextStyle (e.g. "prism" -> gradient fill).
 */

/** Duzenleyicide font / renk disindaki parcalar: hareket + dolgu + efekt rengi. */
export type FansubNameFx = NameTextFxSelection & { motionId: NameTextMotionId }

export const DEFAULT_FANSUB_NAME_FX: FansubNameFx = { ...DEFAULT_NAME_TEXT_FX_SELECTION, motionId: DEFAULT_NAME_TEXT_MOTION_ID }

export type FansubNameIds = {
  fontId: NameTextFontId
  effectId: NameTextEffectId
  colorId: NameTextColorId
  secondaryColorId: NameTextColorId
}

/** Splits a saved name style (v1 or v2) into editor state. */
export function readFansubNameStyle(raw: unknown): FansubNameIds & { fx: FansubNameFx } {
  const style = normalizeUserNameTextStyle(raw)
  return {
    fontId: style.fontId,
    effectId: style.effectId,
    colorId: style.colorId,
    secondaryColorId: style.secondaryColorId ?? DEFAULT_NAME_TEXT_SECONDARY_COLOR_ID,
    fx: {
      motionId: style.motionId ?? DEFAULT_NAME_TEXT_MOTION_ID,
      fillId: style.fillId ?? DEFAULT_NAME_TEXT_FX_SELECTION.fillId,
      fxTint: style.fxTint ?? DEFAULT_NAME_TEXT_FX_SELECTION.fxTint,
      fxColors: style.fxColors ?? DEFAULT_NAME_TEXT_FX_SELECTION.fxColors,
    },
  }
}

export function toFansubNameSelection(ids: FansubNameIds, fx: FansubNameFx): NameTextStyleSelection {
  return { ...ids, ...fx }
}

/** The record going to the server (upsert_fansub_profile.p_active_name_style). */
export function buildFansubActiveNameStyle(ids: FansubNameIds, fx: FansubNameFx) {
  return { version: 2 as const, ...ids, ...fx }
}

/** Class + style of the fansub name; the standard name if no style (boost off). */
export function buildFansubNameProps(style: NameTextStyleSelection | null): { className: string, style: CSSProperties } {
  const props = buildUserNameStyleProps(style)
  return { className: props.className, style: props.style as CSSProperties }
}
