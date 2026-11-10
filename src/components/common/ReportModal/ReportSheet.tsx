import { Check, Loader2 } from 'lucide-react'
import BottomSheet from '@/components/common/BottomSheet'
import { cn } from '@/lib/utils'
import { FREE_TEXT_REASON, REPORT_REASON_OPTIONS } from './reportReasons'
import { txa } from '@/i18n/activeLocale'

/**
 * The MOBILE surface of the report flow: the prototype's report bottom sheet.
 *
 * Reasons are CARDS: title + explanation line, the selected one has a red frame and
 * a tick on the right. There used to be a native HTML select, which opened the
 * OS's own selection surface on phones; it then became plain rows
 * but what the reasons mean still was not explained in words.
 *
 * FREE TEXT opens only when 'Other' is selected. The prototype has none,
 * but 'Other' alone tells moderation nothing; keeping it open on every reason
 * needlessly lengthened the sheet.
 *
 * NO TIME PROMISE. The prototype has a sentence promising a specific review time;
 * we have no such commitment and do not make a promise we cannot keep.
 *
 * This component is not used on wide screens; the ReportModal dialog stays.
 */

interface ReportSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  reason: string
  onReasonChange: (reason: string) => void
  description: string
  onDescriptionChange: (description: string) => void
  loading: boolean
  onSubmit: () => void
}

export default function ReportSheet({
  open,
  onOpenChange,
  title,
  reason,
  onReasonChange,
  description,
  onDescriptionChange,
  loading,
  onSubmit,
}: ReportSheetProps) {
  const needsFreeText = reason === FREE_TEXT_REASON

  return (
    <BottomSheet
      open={open}
      onOpenChange={(next) => {
        // Do not close during submission: if the surface vanishes mid-request,
        // the user cannot know whether the report went through.
        if (loading && !next) return
        onOpenChange(next)
      }}
      title={title}
      titleTone="heading"
      subtitle={txa('Bir sebep seç. Moderasyon ekibi raporu inceleyecek.')}
      description={txa('Rapor sebebini seç ve gerekirse açıklama ekle')}
      cancelLabel={txa('Vazgeç')}
      cancelDisabled={loading}
      testId="report-sheet"
    >
      <div className="max-h-[46dvh] overflow-y-auto px-4 pt-3">
        <div className="flex flex-col gap-2">
          {REPORT_REASON_OPTIONS.map((option) => {
            const selected = option.value === reason
            return (
              <button
                key={txa(option.value)}
                type="button"
                data-testid={`report-sheet-reason-${option.value}`}
                aria-pressed={selected}
                disabled={loading}
                onClick={() => onReasonChange(option.value)}
                className={cn(
                  'flex items-center gap-3 rounded-[14px] border px-3.5 py-2.5 text-left transition-colors disabled:opacity-60',
                  selected
                    ? 'border-destructive bg-destructive/10'
                    : 'border-transparent bg-muted/60 hover:bg-muted',
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-foreground">
                    {txa(option.value)}
                  </span>
                  <span className="mt-0.5 block truncate text-[12px] font-medium text-muted-foreground">
                    {option.description}
                  </span>
                </span>
                {selected ? (
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-destructive text-white">
                    <Check className="size-3" />
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>

        {needsFreeText ? (
          <textarea
            value={description}
            onChange={(event) => onDescriptionChange(event.target.value)}
            disabled={loading}
            rows={3}
            placeholder={txa('Sorunu kisaca anlat')}
            aria-label={txa('Sorun açıklaması')}
            data-testid="report-sheet-description"
            className="mt-2 min-h-[84px] w-full resize-none rounded-[14px] border border-border bg-background px-3.5 py-3 text-sm outline-none transition-colors focus:border-primary disabled:opacity-60"
          />
        ) : null}
      </div>

      <button
        type="button"
        data-testid="report-sheet-submit"
        disabled={loading}
        onClick={onSubmit}
        className="mx-4 mt-3 flex h-[52px] items-center justify-center gap-2 rounded-[14px] bg-destructive text-[15px] font-bold text-white transition-[filter] hover:brightness-110 disabled:opacity-60"
      >
        {loading ? <Loader2 className="size-4 animate-spin" /> : null}
        {loading ? txa('Gönderiliyor...') : txa('Raporu gönder')}
      </button>
    </BottomSheet>
  )
}
