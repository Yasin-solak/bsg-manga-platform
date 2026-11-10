import { BookOpen, LayoutList, PanelsTopLeft } from 'lucide-react'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { FANSUB_NOTICE_ACTION_TARGET_OPTIONS, type FansubNoticeActionTarget } from '@/lib/fansubNotices'
import type { FansubNoticeTargetOptionItem, FansubNoticeTargetOptionMap } from './fansubNoticeTargetOptions'
import { withFallbackNoticeTargetOption } from './fansubNoticeTargetOptions'
import { txa } from '@/i18n/activeLocale'

/*
 * Simple target picker: type (series / chapter / post / list) as a one-line segment,
 * the record picked from a dropdown. The selected route is a one-line hint below.
 */
const TARGET_META = {
  mangalar: { icon: BookOpen, get label() { return txa('Seri') }, get placeholder() { return txa('Bir seri seç') } },
  bolumler: { icon: PanelsTopLeft, get label() { return txa('Bölüm') }, get placeholder() { return txa('Bir bölüm seç') } },
  listeler: { icon: LayoutList, get label() { return txa('Liste') }, get placeholder() { return txa('Bir liste seç') } },
} satisfies Record<FansubNoticeActionTarget, { icon: typeof BookOpen, label: string, placeholder: string }>

type FansubNoticeTargetSelectorProps = {
  idPrefix: string
  target: FansubNoticeActionTarget
  targetEntityId: string
  targetOptions: FansubNoticeTargetOptionMap
  fallbackOption?: FansubNoticeTargetOptionItem | null
  loading?: boolean
  disabled?: boolean
  onTargetChange: (target: FansubNoticeActionTarget) => void
  onTargetEntityIdChange: (targetEntityId: string) => void
}

export default function FansubNoticeTargetSelector({
  idPrefix,
  target,
  targetEntityId,
  targetOptions,
  fallbackOption = null,
  loading = false,
  disabled = false,
  onTargetChange,
  onTargetEntityIdChange,
}: FansubNoticeTargetSelectorProps) {
  const scopedTargetOptions = withFallbackNoticeTargetOption(targetOptions, target, fallbackOption)
  const selectedItem = scopedTargetOptions.find((item) => item.id === targetEntityId) || null
  const targetItemDisabled = disabled || loading || scopedTargetOptions.length === 0

  return (
    <div className="space-y-2">
      <Label htmlFor={`${idPrefix}-target-item`}>{txa('Tıklayınca nereye gitsin?')}</Label>
      <div className="grid grid-cols-4 gap-1 rounded-xl border border-border/70 bg-muted/30 p-1" role="radiogroup" aria-label={txa('Hedef türü')}>
        {FANSUB_NOTICE_ACTION_TARGET_OPTIONS.map((option) => {
          const meta = TARGET_META[option.value]
          const Icon = meta.icon
          const isActive = option.value === target
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={isActive}
              disabled={disabled}
              onClick={() => onTargetChange(option.value)}
              className={cn(
                'flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[12.5px] font-semibold transition-colors disabled:opacity-60',
                isActive ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="size-3.5" />
              {meta.label}
            </button>
          )
        })}
      </div>
      <Select value={selectedItem?.id} onValueChange={onTargetEntityIdChange} disabled={targetItemDisabled}>
        <SelectTrigger id={`${idPrefix}-target-item`} className="h-10 w-full rounded-xl">
          <SelectValue
            placeholder={
              loading
                ? txa('Hedefler yükleniyor…')
                : scopedTargetOptions.length === 0
                  ? txa('Bu türde uygun kayıt yok')
                  : TARGET_META[target].placeholder
            }
          />
        </SelectTrigger>
        <SelectContent>
          {scopedTargetOptions.map((item) => (
            <SelectItem key={item.id} value={item.id}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {selectedItem?.routeHint && (
        <p className="truncate font-mono text-[11px] text-muted-foreground" title={selectedItem.routeHint}>{selectedItem.routeHint}</p>
      )}
    </div>
  )
}
