/**
 * Auto reading speed: in the bottom bar, next to the play button.
 *
 * Speed used to be only in the settings panel: saying "slow down a bit" while reading
 * meant opening the panel. At user request the control moved
 * right next to play.
 *
 * Meaning changes by axis (continuing the single container principle):
 * - strip -> px/second
 * - page  -> seconds per page
 */

import { Minus, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  READER_V2_AUTO_ADVANCE_MAX_SECONDS,
  READER_V2_AUTO_ADVANCE_MIN_SECONDS,
  READER_V2_AUTO_SCROLL_SPEED_MAX,
  READER_V2_AUTO_SCROLL_SPEED_MIN,
  type ReaderV2Preferences,
} from '@/pages/reader/readerV2Preferences'
import { txa } from '@/i18n/activeLocale'

/** The step on the bottom bar; larger than the panel slider so a single click is felt. */
const SPEED_STEP_PX = 15
const ADVANCE_STEP_SECONDS = 1

interface ReaderV2SpeedStepperProps {
  axis: 'x' | 'y'
  speed: number
  advanceSeconds: number
  onChange: (patch: Partial<ReaderV2Preferences>) => void
}

export function ReaderV2SpeedStepper({
  axis,
  speed,
  advanceSeconds,
  onChange,
}: ReaderV2SpeedStepperProps) {
  const isPageMode = axis === 'x'
  const value = isPageMode ? advanceSeconds : speed
  const min = isPageMode ? READER_V2_AUTO_ADVANCE_MIN_SECONDS : READER_V2_AUTO_SCROLL_SPEED_MIN
  const max = isPageMode ? READER_V2_AUTO_ADVANCE_MAX_SECONDS : READER_V2_AUTO_SCROLL_SPEED_MAX
  const step = isPageMode ? ADVANCE_STEP_SECONDS : SPEED_STEP_PX
  const suffix = isPageMode ? 'sn' : 'px/sn'

  const apply = (direction: 1 | -1) => {
    const next = Math.min(Math.max(value + direction * step, min), max)
    onChange(isPageMode ? { autoAdvanceSeconds: next } : { autoScrollSpeed: next })
  }

  const buttonClass = 'flex size-6 items-center justify-center rounded-md text-white/60 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-30'

  return (
    <div
      data-testid="reader-v2-speed-stepper"
      className="flex items-center gap-0.5 rounded-full border border-white/10 bg-white/[0.04] px-1 py-0.5"
    >
      <button
        type="button"
        aria-label={isPageMode ? txa('Sayfa suresini kisalt') : txa('Kaydirma hizini azalt')}
        disabled={value <= min}
        onClick={() => apply(-1)}
        className={buttonClass}
      >
        <Minus className="size-3.5" />
      </button>
      <span className={cn('min-w-[62px] text-center text-[11px] tabular-nums text-white/70')}>
        {value} {suffix}
      </span>
      <button
        type="button"
        aria-label={isPageMode ? txa('Sayfa suresini uzat') : txa('Kaydirma hizini artir')}
        disabled={value >= max}
        onClick={() => apply(1)}
        className={buttonClass}
      >
        <Plus className="size-3.5" />
      </button>
    </div>
  )
}

export default ReaderV2SpeedStepper
