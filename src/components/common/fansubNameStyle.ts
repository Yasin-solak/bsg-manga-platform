import type { CSSProperties } from 'react'
import { buildUserNameStyleProps, normalizeUserNameTextStyle } from '@/data/userNameStyle'

/*
 * Shared site rendering of the fansub name (catalog, hover card, reader closing strip, community
 * posts). Name style v2: same schema and rendering as the user name style (font, colors,
 * fill, effect, effect color, motion). Old v1 records convert through normalizeUserNameTextStyle
 * (e.g. "prism" -> gradient fill). The boost gate is on the caller's side (resolveVisibleFansubNameStyle /
 * visible_name_style on the server): any style arriving here is shown.
 */

type FansubNameStyleSelection = Record<string, unknown>

type FansubNameStylePresentation = {
  className: string
  inlineStyle: CSSProperties
  hasActiveStyle: boolean
}

const FANSUB_NAME_FONT_SIZE_PX = 15
const FANSUB_NAME_LINE_HEIGHT = 0.98
const FANSUB_NAME_LETTER_SPACING = '-0.03em'

function buildFansubNameDisplayStyle(style?: CSSProperties): CSSProperties {
  return {
    ...style,
    fontSize: `${FANSUB_NAME_FONT_SIZE_PX}px`,
    lineHeight: FANSUB_NAME_LINE_HEIGHT,
    letterSpacing: FANSUB_NAME_LETTER_SPACING,
  }
}

export function resolveFansubNameStylePresentation(
  activeNameStyle?: FansubNameStyleSelection | null,
  options: { displaySize?: boolean } = {},
): FansubNameStylePresentation {
  const hasActiveStyle = Boolean(activeNameStyle && typeof activeNameStyle === 'object' && Object.keys(activeNameStyle).length)
  const props = buildUserNameStyleProps(hasActiveStyle ? normalizeUserNameTextStyle(activeNameStyle) : null)
  const style = props.style as CSSProperties
  return {
    className: props.className,
    // On the catalog / hover card the name has a fixed size; in flow (post title) it takes the surrounding text size.
    inlineStyle: options.displaySize === false ? style : buildFansubNameDisplayStyle(style),
    hasActiveStyle,
  }
}
