import { CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { STEP_LABELS, type FansubRequestStep } from './fansubRequestModal.shared'
import { txa } from '@/i18n/activeLocale'

interface FansubRequestStepNavProps {
  step: FansubRequestStep
  progress: number
  onStepClick: (step: FansubRequestStep) => void
}

export function FansubRequestStepNav({ step, progress, onStepClick }: FansubRequestStepNavProps) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4" role="tablist" aria-label={txa('Başvuru adımları')}>
        {STEP_LABELS.map((label, index) => {
          const current = (index + 1) as FansubRequestStep
          const isActive = step === current
          const isDone = step > current

          return (
            <button
              key={label}
              type="button"
              className={cn(
                'flex h-11 items-center gap-2 rounded-md border border-border/70 bg-background/80 px-3 text-left text-xs font-semibold text-muted-foreground transition-colors hover:border-primary/70 hover:text-foreground',
                isActive && 'border-primary bg-primary/10 text-primary',
                isDone && 'border-primary/50 text-foreground',
              )}
              aria-selected={isActive}
              onClick={() => onStepClick(current)}
            >
              <span
                className={cn(
                  'grid h-6 w-6 shrink-0 place-items-center rounded-full border border-border bg-card text-[11px]',
                  isActive && 'border-primary bg-primary text-primary-foreground',
                  isDone && 'border-primary bg-primary/15 text-primary',
                )}
              >
                {isDone ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> : index + 1}
              </span>
              <span className="truncate">{label}</span>
            </button>
          )
        })}
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <span
          className="block h-full rounded-full bg-primary transition-[width] duration-200 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  )
}
