import { type ChangeEvent, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ImagePlus } from 'lucide-react'
import { txa } from '@/i18n/activeLocale'

export function PreviewUploadPanel({
  accent,
  accept,
  ctaLabel,
  description,
  disabled,
  hasPendingSelection,
  maxSizeLabel,
  onFileChange,
  onReset,
  resetLabel,
  selectionLabel,
  title,
}: {
  accent: boolean
  accept: string
  ctaLabel: string
  description: string
  disabled: boolean
  hasPendingSelection: boolean
  maxSizeLabel: string
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void
  onReset: () => void
  resetLabel: string
  selectionLabel: string
  title: string
}) {
  return (
    <div
      className={cn(
        'rounded-[24px] border bg-background/80 p-4 shadow-none transition-colors',
        accent ? 'border-primary/40 bg-primary/5' : 'border-border/70',
      )}
    >
      <div className="space-y-1">
        <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">{txa('On izleme araci')}</p>
        <h4 className="text-sm font-semibold text-foreground">{title}</h4>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary/35 hover:text-primary">
          <input
            type="file"
            accept={accept}
            onChange={onFileChange}
            className="pointer-events-none absolute h-0 w-0 opacity-0"
            disabled={disabled}
          />
          <ImagePlus className="size-4" />
          {ctaLabel}
        </label>
        <Button type="button" variant="outline" onClick={onReset} disabled={disabled}>
          {resetLabel}
        </Button>
      </div>

      <div className="mt-3 space-y-1 text-xs text-muted-foreground">
        <p className="m-0">{selectionLabel}</p>
        <p className="m-0">{maxSizeLabel}</p>
        <p className="m-0">{description}</p>
        {hasPendingSelection ? (
          <p className="m-0 text-primary">{txa('Secilen dosya henuz kaydedilmedi.')}</p>
        ) : null}
      </div>
    </div>
  )
}

export type PreviewTool = 'avatar' | 'background'

export function PreviewActionButton({
  className,
  icon,
  label,
  onClick,
  tone = 'default',
}: {
  className?: string
  icon: ReactNode
  label: string
  onClick: () => void
  tone?: 'default' | 'boost'
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        'pointer-events-auto absolute z-20 inline-flex size-10 items-center justify-center rounded-full border shadow-lg backdrop-blur-md transition-colors',
        tone === 'boost'
          ? 'border-primary/40 bg-primary text-primary-foreground hover:bg-primary/90'
          : 'border-white/20 bg-black/45 text-white hover:bg-black/60',
        className,
      )}
    >
      {icon}
    </button>
  )
}
