/**
 * Visibility rule for the top/bottom bars (pure function).
 *
 * In the previous design hiding depended on a separate "quiet reading" preference:
 * the user would enable it in settings, then tap the screen. User feedback:
 * no special mode is needed, bars should hide with PAGE MOTION.
 * The preference was removed; the rule is now the motion's direction:
 *
 * - reading forward (down/right) -> bars retract, the reading area grows
 * - going back (up/left)         -> bars return (the user is looking for something)
 * - small wobbles                -> nothing changes (no jitter)
 *
 * `forceVisible` overrides everything: while the settings panel, chapter picker or chapter end
 * is visible the user should see what they are doing.
 */

/** Bu esigin altindaki hareket "kaydirma" sayilmaz (dokunmatik titremesi). */
export const READER_V2_CHROME_MOVE_THRESHOLD_PX = 24

export interface ReaderV2ChromeInput {
  /** Eksendeki anlik konum (dikeyde scrollTop, yatayda scrollLeft). */
  position: number
  /** Onceki karsilastirma konumu. */
  lastPosition: number
  barsHidden: boolean
  /** Bars are forced visible while the panel/picker/chapter end is open. */
  forceVisible: boolean
}

export interface ReaderV2ChromeResult {
  barsHidden: boolean
  /** Position carried over for the next comparison. */
  lastPosition: number
}

/**
 * Minimum edge space needed for the side rail to fit (px).
 * Rail ~50px + margin; below that it overlaps content.
 */
export const READER_V2_SIDE_RAIL_MIN_GUTTER_PX = 72

export interface ReaderV2SideRailInput {
  viewportWidth: number
  /** Real width of content being read (strip: column, page: image). */
  contentWidth: number
  barsVisible: boolean
}

/**
 * The side rail depends on REAL FREE SPACE, not the MODE.
 *
 * The first version drew it only in page mode, yet in strip mode wide screens also have
 * empty edges over 400px (a user's screenshot was exactly this:
 * 405/415px gaps at 1920px, no rail).
 * Tying it to measurement also handles zoom correctly: at 200% zoom when the
 * column fills the screen, the rail retracts by itself.
 */
export function shouldShowReaderV2SideRail(input: ReaderV2SideRailInput): boolean {
  const { viewportWidth, contentWidth, barsVisible } = input
  if (!barsVisible) return false
  if (!Number.isFinite(contentWidth) || contentWidth <= 0) return false
  const gutter = (viewportWidth - contentWidth) / 2
  return gutter >= READER_V2_SIDE_RAIL_MIN_GUTTER_PX
}

export function resolveReaderV2Chrome(input: ReaderV2ChromeInput): ReaderV2ChromeResult {
  const { position, lastPosition, barsHidden, forceVisible } = input

  if (forceVisible) {
    // The position still updates: closing the panel should not produce a fake
    // "large motion" from the old position.
    return { barsHidden: false, lastPosition: position }
  }

  const delta = position - lastPosition
  if (Math.abs(delta) < READER_V2_CHROME_MOVE_THRESHOLD_PX) {
    return { barsHidden, lastPosition }
  }

  return { barsHidden: delta > 0, lastPosition: position }
}
