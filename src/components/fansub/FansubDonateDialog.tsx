import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { intlLocale, txa } from '@/i18n/activeLocale'
import { donationConfirmationWord } from '@/pages/fansub/fansubDetailUtils'

type FansubDonateDialogProps = {
  open: boolean
  saving: boolean
  fansubName: string
  currentUserCoins: number
  amountInput: string
  note: string
  confirmationInput: string
  isConfirmationValid: boolean
  normalizedAmount: number
  onAmountInputChange: (value: string) => void
  onNoteChange: (value: string) => void
  onConfirmationInputChange: (value: string) => void
  onAmountPresetSelect: (value: number) => void
  onOpenChange: (open: boolean) => void
  onCancel: () => void
  onSubmit: () => void
}

export default function FansubDonateDialog({
  open,
  saving,
  fansubName,
  currentUserCoins,
  amountInput,
  note,
  confirmationInput,
  isConfirmationValid,
  normalizedAmount,
  onAmountInputChange,
  onNoteChange,
  onConfirmationInputChange,
  onAmountPresetSelect,
  onOpenChange,
  onCancel,
  onSubmit,
}: FansubDonateDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{txa('Fansub Bagisi')}</DialogTitle>
          <DialogDescription>
            {txa('{v1} icin coin destegi gonderebilirsin. Islem aninda fansub kasasina yansir.', { v1: fansubName })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
            <p>{txa('Kendi bakiyen:')} <span className="font-semibold text-foreground">{currentUserCoins.toLocaleString(intlLocale())} coin</span></p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="donation-amount">{txa('Bagis tutari')}</Label>
            <Input
              id="donation-amount"
              type="number"
              min={1}
              max={100000}
              step={1}
              value={amountInput}
              onChange={(event) => onAmountInputChange(event.target.value)}
              placeholder={txa('Ornek: 500')}
              disabled={saving}
            />
            <div className="flex flex-wrap gap-2">
              {[100, 500, 1000, 5000].map((preset) => (
                <Button
                  key={preset}
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={saving}
                  onClick={() => onAmountPresetSelect(preset)}
                >
                  {preset.toLocaleString(intlLocale())}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="donation-note">{txa('Not (opsiyonel)')}</Label>
            <Textarea
              id="donation-note"
              value={note}
              maxLength={140}
              onChange={(event) => onNoteChange(event.target.value)}
              placeholder={txa('Destek mesaji birakabilirsin.')}
              disabled={saving}
            />
            <p className="text-xs text-muted-foreground">{note.length}/140 karakter</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="donation-confirmation">{txa('Onay metni')}</Label>
            <Input
              id="donation-confirmation"
              type="text"
              value={confirmationInput}
              onChange={(event) => onConfirmationInputChange(event.target.value)}
              placeholder={donationConfirmationWord()}
              disabled={saving}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
            <p className="text-xs text-muted-foreground">
              {txa('Devam etmek icin sadece ONAYLIYORUM yazin.')}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={onCancel}
          >
            {txa('Vazgec')}
          </Button>
          <Button
            type="button"
            disabled={
              saving
              || normalizedAmount <= 0
              || normalizedAmount > 100000
              || currentUserCoins < normalizedAmount
              || !isConfirmationValid
            }
            onClick={onSubmit}
          >
            {saving
              ? txa('Bagis gonderiliyor...')
              : txa('{v1} coin bagisla', { v1: Math.max(0, normalizedAmount).toLocaleString(intlLocale()) })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
