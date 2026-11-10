import type { CSSProperties } from 'react'

import { cn } from '@/lib/utils'
import type { ReaderImageFitMode, ReaderZoomLevel } from '@/services/readerPreferencesService'
import { txa } from '@/i18n/activeLocale'

export function readerImageFitModeLabel(mode: ReaderImageFitMode) {
  switch (mode) {
    case 'fit-width':
      return txa('Genişliğe sığdır')
    case 'fit-height':
      return txa('Yüksekliğe sığdır')
    case 'original':
      return txa('Orijinal')
    default:
      return txa('Genişliğe sığdır')
  }
}

export function buildReaderZoomStyle(zoomLevel: ReaderZoomLevel): CSSProperties {
  return {
    zoom: `${zoomLevel}%`,
    '--zoom-level': `${zoomLevel / 100}`,
  } as CSSProperties
}

export function isOriginalReaderImageFitMode(mode: ReaderImageFitMode) {
  return mode === 'original'
}

export function getVerticalReaderDeckClassName(mode: ReaderImageFitMode, seamlessStrip = false) {
  return cn(
    'flex w-full flex-col items-center',
    // Webtoon mode: manhwa strips draw continuously, a gap splits a panel.
    // When off, the gap marks the page boundary (manga).
    seamlessStrip ? 'gap-0' : 'gap-4',
    mode === 'original' ? 'max-w-none' : 'max-w-[1100px]',
  )
}

export function getVerticalReaderImageClassName(mode: ReaderImageFitMode) {
  switch (mode) {
    case 'fit-height':
      return 'block max-h-[85vh] w-auto max-w-full select-none bg-neutral-900 object-contain [-webkit-user-drag:none]'
    case 'original':
      return 'block h-auto w-auto max-w-none select-none bg-neutral-900 [-webkit-user-drag:none]'
    case 'fit-width':
    default:
      return 'block w-full select-none bg-neutral-900 [-webkit-user-drag:none]'
  }
}

// Note: min-h-[72vh] is NOT USED here. The stage (flex-1 min-h-0) is as tall as the space
// left on screen; a fixed 72vh floor overflowed when larger than the stage
// and overlapped the comment panel below (measured:
// a 518px viewport in a 196px stage -> 323px overflow) and swallowed clicks there
// (the emoji/sticker panel would not open, comments could not be typed).
export function getHorizontalReaderViewportClassName(mode: ReaderImageFitMode) {
  switch (mode) {
    case 'fit-width':
      return 'flex h-full items-start justify-center overflow-y-auto px-6 py-4 sm:px-10'
    case 'original':
      return 'flex h-full items-start justify-start overflow-auto px-4 py-4 sm:px-6'
    case 'fit-height':
    default:
      return 'flex h-full items-center justify-center overflow-hidden px-8 py-2 sm:px-14 sm:py-4'
  }
}

export function getHorizontalReaderZoomWrapperClassName(mode: ReaderImageFitMode) {
  switch (mode) {
    case 'fit-width':
      return 'w-full max-w-[1180px]'
    case 'original':
      return 'w-max max-w-none'
    case 'fit-height':
    default:
      return 'w-auto max-w-full'
  }
}

export function getHorizontalReaderImageClassName(mode: ReaderImageFitMode) {
  switch (mode) {
    case 'fit-width':
      return 'block h-auto w-full select-none bg-transparent object-contain [-webkit-user-drag:none]'
    case 'original':
      return 'block h-auto w-auto max-w-none select-none bg-transparent [-webkit-user-drag:none]'
    case 'fit-height':
    default:
      return 'block max-h-[82vh] w-auto max-w-full select-none bg-transparent object-contain [-webkit-user-drag:none]'
  }
}
