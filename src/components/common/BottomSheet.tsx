import type { ReactElement, ReactNode } from 'react'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { txa } from '@/i18n/activeLocale'

/**
 * Bottom sheet SHELL: handle, top title, 'Cancel' and opening motion.
 *
 * ActionSheet and the report sheet come from the same shell; writing them separately
 * would mean every tweak to one is forgotten on the other.
 *
 * OPENING SPEED. The shared `SheetContent` used 500ms for the panel and 150ms for the
 * BACKDROP: the backdrop landed and the panel crawled behind it for another 350ms.
 * This reads as "dropping frames", yet no frame drops; the
 * durations are mismatched. The panel moved to 240ms with a curve that starts fast and
 * settles softly; the backdrop is 180ms, both land together.
 * Closing is shorter (160ms): an exit is not something to wait for, stretching it
 * only delays.
 *
 * Measures are passed on this surface only, WITHOUT CHANGING the shared sheet:
 * tuning other sheets such as the mobile menu and shop filters was their own
 * decision, and we do not change them from here.
 */

const SHEET_MOTION = [
  'data-[state=open]:duration-[240ms] data-[state=closed]:duration-[160ms]',
  'data-[state=open]:ease-[cubic-bezier(0.32,0.72,0,1)] data-[state=closed]:ease-in',
].join(' ')

const OVERLAY_MOTION = 'data-[state=open]:duration-[180ms] data-[state=closed]:duration-[160ms]'

interface BottomSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Sayfanin ne hakkinda oldugunu soyleyen ust baslik. */
  title: string
  /**
   * `label` (default): a small, quiet top title, for an action list.
   * `heading`: a real title on sheets asking for a decision (like the prototype's
   * report sheet), with an optional explanatory line below.
   */
  titleTone?: 'label' | 'heading'
  /** Baslik altindaki aciklayici satir; yalnizca `heading` tonunda anlamli. */
  subtitle?: string
  /** For accessibility; not visible on screen. */
  description?: string
  children: ReactNode
  /** If given, the sheet manages its own trigger. */
  trigger?: ReactElement
  /** Full-width close button; not drawn if null. */
  cancelLabel?: string | null
  /** To prevent closing during submission. */
  cancelDisabled?: boolean
  contentClassName?: string
  testId?: string
}

export default function BottomSheet({
  open,
  onOpenChange,
  title,
  titleTone = 'label',
  subtitle,
  description,
  children,
  trigger,
  cancelLabel = txa('Vazgeç'),
  cancelDisabled = false,
  contentClassName,
  testId,
}: BottomSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {trigger ? <SheetTrigger asChild>{trigger}</SheetTrigger> : null}
      <SheetContent
        side="bottom"
        showCloseButton={false}
        data-testid={testId}
        overlayClassName={OVERLAY_MOTION}
        className={cn(
          'mx-auto max-w-[520px] gap-0 rounded-t-[24px] border-t px-0 pb-0',
          SHEET_MOTION,
          contentClassName,
        )}
      >
        <span
          aria-hidden="true"
          className="mx-auto mt-3 block h-1 w-9 shrink-0 rounded-full bg-muted-foreground/25"
        />

        <SheetTitle
          className={cn(
            'px-5',
            titleTone === 'heading'
              ? 'pt-4 text-[17px] font-black text-foreground'
              : 'pt-4 text-[12.5px] font-bold text-muted-foreground',
          )}
        >
          {title}
        </SheetTitle>
        {subtitle ? (
          <p className="m-0 px-5 pt-1 text-[13px] font-medium text-muted-foreground">{subtitle}</p>
        ) : null}
        <SheetDescription className="sr-only">
          {description || `${title} listesi`}
        </SheetDescription>

        {children}

        {cancelLabel ? (
          <button
            type="button"
            data-testid="bottom-sheet-cancel"
            disabled={cancelDisabled}
            onClick={() => onOpenChange(false)}
            className="mx-4 mb-[calc(1rem_+_env(safe-area-inset-bottom))] mt-3 h-[52px] rounded-[14px] border border-border text-[15px] font-bold text-foreground transition-colors hover:bg-accent disabled:opacity-50"
          >
            {cancelLabel}
          </button>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
