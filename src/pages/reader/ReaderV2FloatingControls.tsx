/**
 * Controls floating over the stage: the "continue where you left off" notice and the
 * "back to top" arrow.
 *
 * Why a separate file: both are conditional, temporary elements sitting OVER THE CONTENT,
 * not on shell bars, so they belong together. With them the page component
 * passed the 850-line threshold (repo-health warned); separating temporary overlays from
 * layout/data orchestration also keeps the file readable.
 */

import { ArrowUp, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { txa } from '@/i18n/activeLocale'

interface ReaderV2FloatingControlsProps {
  /** Page to show if restored (1-based); otherwise null. */
  resumedPage: number | null
  /** If the position came from another device, the text says so. */
  resumedFromOtherDevice?: boolean
  onRestartFromBeginning: () => void
  onDismissResumeNotice: () => void
  /** Basa don yalnizca ilerlenmisken anlamli. */
  showScrollTop: boolean
  onScrollTop: () => void
  /** Barlar gizliyken yuzen ogeler de cekilir. */
  barsVisible: boolean
}

export function ReaderV2FloatingControls({
  resumedPage,
  resumedFromOtherDevice = false,
  onRestartFromBeginning,
  onDismissResumeNotice,
  showScrollTop,
  onScrollTop,
  barsVisible,
}: ReaderV2FloatingControlsProps) {
  return (
    <>
      {/* Atlama SESSIZ olmamali: kullanici nereye geldigini gormeli ve tek
          tikla geri alabilmeli. */}
      {resumedPage !== null ? (
        <div
          data-testid="reader-v2-resume-notice"
          className="absolute inset-x-0 top-16 z-[9030] flex justify-center px-3"
        >
          <div className="flex max-w-full items-center gap-2 rounded-full border border-white/12 bg-black/85 py-1.5 pl-3.5 pr-1.5 text-[13px] text-white/80 shadow-lg backdrop-blur">
            <span className="truncate">
              {resumedFromOtherDevice
                ? txa('Diger cihazinda {v1}. sayfada kalmistin', { v1: resumedPage })
                : `${resumedPage}. sayfadan devam`}
            </span>
            <button
              type="button"
              data-testid="reader-v2-resume-restart"
              onClick={onRestartFromBeginning}
              className="shrink-0 rounded-full bg-white/10 px-2.5 py-1 text-[12px] font-semibold text-white transition-colors hover:bg-white/20"
            >
              {txa('Bastan basla')}
            </button>
            <button
              type="button"
              aria-label={txa('Bildirimi kapat')}
              onClick={onDismissResumeNotice}
              className="shrink-0 rounded-full p-1.5 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
            >
              <X className="size-3.5" />
            </button>
          </div>
        </div>
      ) : null}

      {showScrollTop ? (
        <button
          type="button"
          data-testid="reader-v2-scroll-top"
          aria-label={txa('Bolum basina don')}
          title={txa('Bolum basina don')}
          onClick={onScrollTop}
          className={cn(
            'absolute bottom-20 right-3 z-[9020] flex size-11 items-center justify-center rounded-full border border-white/12 bg-black/70 text-white/80 backdrop-blur transition-opacity hover:bg-black/85 hover:text-white',
            !barsVisible && 'pointer-events-none opacity-0',
          )}
        >
          <ArrowUp className="size-5" />
        </button>
      ) : null}
    </>
  )
}

export default ReaderV2FloatingControls
