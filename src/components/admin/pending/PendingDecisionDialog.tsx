import { useEffect, useState } from 'react'
import { AlertTriangle, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { pendingRejectConsequence, pendingRejectPresets, pendingRejectReasonMode } from './pendingRejectPresets'
import { itemTypeLabel, type PendingItem } from './pendingSectionUtils'
import { txa } from '@/i18n/activeLocale'

const REASON_MAX = 500

function dialogTitle(item: PendingItem) {
  if (item.revisionId) return txa('Revizyonu reddet')
  if (item.type === 'manga') return txa('Manga talebini reddet')
  if (item.type === 'chapter') return txa('Bölüm talebini reddet')
  return txa('Fansub başvurusunu reddet')
}

/**
 * Reject confirm: every rejection passes this dialog. It states the result (a new record is
 * deleted / the published version stays), the reason is required or optional; presets
 * fill the text, which stays editable.
 */
export function PendingDecisionDialog({
  item,
  busy,
  onCancel,
  onConfirm,
}: {
  item: PendingItem | null
  busy: boolean
  onCancel: () => void
  onConfirm: (reason: string) => void
}) {
  const [reason, setReason] = useState('')
  const [presetId, setPresetId] = useState<string | null>(null)

  useEffect(() => {
    setReason('')
    setPresetId(null)
  }, [item?.id])

  if (!item) return null
  const mode = pendingRejectReasonMode(item)
  const presets = pendingRejectPresets(item)
  const consequence = pendingRejectConsequence(item)
  const trimmed = reason.trim()
  const canConfirm = !busy && (mode !== 'required' || trimmed.length >= 3)

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !busy) onCancel() }}>
      <DialogContent className="max-w-[calc(100vw-2rem)] grid-cols-[minmax(0,1fr)] gap-0 p-0 sm:max-w-[520px]" data-testid="admin-pending-reject-dialog">
        <DialogHeader className="px-6 pb-3 pt-5 text-left">
          <DialogTitle>{dialogTitle(item)}</DialogTitle>
          <DialogDescription className="line-clamp-2 [overflow-wrap:anywhere]">
            {itemTypeLabel(item.type)} · {item.title}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 px-6 pb-5">
          <p
            className={cn(
              'flex items-start gap-2 rounded-xl px-3.5 py-2.5 text-[12.5px]',
              consequence.destructive ? 'bg-rose-500/10 text-rose-700 dark:text-rose-300' : 'bg-muted/60 text-muted-foreground',
            )}
            data-testid="admin-pending-reject-consequence"
          >
            {consequence.destructive ? <AlertTriangle className="mt-px size-4 shrink-0" /> : null}
            {consequence.text}
          </p>

          {mode !== 'none' ? (
            <div className="flex flex-col gap-2">
              {presets.length ? (
                <div className="flex flex-wrap gap-1.5" role="group" aria-label={txa('Hazır gerekçeler')}>
                  {presets.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      aria-pressed={presetId === preset.id}
                      onClick={() => { setPresetId(preset.id); setReason(preset.message) }}
                      className={cn(
                        'rounded-full border px-2.5 py-1 text-[12px] font-semibold transition-colors',
                        presetId === preset.id ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              ) : null}
              <label className="block">
                <span className="mb-1.5 flex items-center justify-between text-[11.5px] font-bold uppercase tracking-wider text-muted-foreground">
                  {txa('Gerekçe')} {mode === 'optional' ? txa('(isteğe bağlı)') : ''}
                  <span className="font-medium normal-case tracking-normal tabular-nums">{reason.length}/{REASON_MAX}</span>
                </span>
                <Textarea
                  value={reason}
                  onChange={(event) => { setReason(event.target.value.slice(0, REASON_MAX)); setPresetId(null) }}
                  rows={3}
                  autoFocus
                  placeholder={mode === 'required' ? txa('Neden reddedildiğini yaz; bu metin iletilir.') : txa('Ekibe iletilecek kısa bir not.')}
                  className="resize-none text-[13px]"
                  data-testid="admin-pending-reject-reason"
                />
              </label>
              {mode === 'required' && trimmed.length > 0 && trimmed.length < 3 ? (
                <span className="text-[11.5px] text-rose-500">{txa('Gerekçe en az 3 karakter olmalı.')}</span>
              ) : null}
            </div>
          ) : null}
        </div>

        <DialogFooter className="border-t border-border/60 px-6 py-3">
          <Button variant="ghost" disabled={busy} onClick={onCancel}>{txa('Vazgeç')}</Button>
          <Button
            variant="destructive"
            disabled={!canConfirm}
            onClick={() => onConfirm(trimmed)}
            data-testid="admin-pending-reject-confirm"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <X className="size-4" />}
            {consequence.destructive ? txa('Reddet ve sil') : txa('Reddet')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
