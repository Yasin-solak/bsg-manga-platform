import { useEffect, useMemo, useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type { AdminCommentModerationItem } from '@/services/adminCommentModerationService'
import { commentSignals } from './adminCommentModerationUtils'
import { txa } from '@/i18n/activeLocale'

export const REMOVE_REASON_PRESETS = [
  { value: 'spam', get label() { return txa('Spam veya flood') } },
  { value: 'hakaret', get label() { return txa('Hakaret veya saldırı') } },
  { value: 'spoiler', get label() { return txa('İşaretsiz spoiler') } },
  { value: 'riskli_link', get label() { return txa('Riskli bağlantı') } },
  { value: 'diger', get label() { return txa('Diğer kural ihlali') } },
] as const

/**
 * Removal dialog: the reason (preset + note) goes to the author as a notification.
 * Replies are hidden in a chain; reply authors are not notified.
 */
export function CommentRemoveDialog({
  comment,
  busy,
  onCancel,
  onConfirm,
}: {
  comment: AdminCommentModerationItem | null
  busy: boolean
  onCancel: () => void
  onConfirm: (reason: string) => void
}) {
  const [preset, setPreset] = useState<(typeof REMOVE_REASON_PRESETS)[number]['value'] | null>(null)
  const [note, setNote] = useState('')

  useEffect(() => {
    setPreset(null)
    setNote('')
  }, [comment?.id])

  const suggested = useMemo(() => {
    const signals = comment ? commentSignals(comment) : []
    if (signals.includes('abuse')) return 'hakaret'
    if (signals.includes('spam')) return 'spam'
    if (signals.includes('links')) return 'riskli_link'
    if (signals.includes('spoiler')) return 'spoiler'
    return null
  }, [comment])

  if (!comment) return null
  const chosen = preset ?? suggested
  const reason = [REMOVE_REASON_PRESETS.find((item) => item.value === chosen)?.label, note.trim()].filter(Boolean).join(' - ')
  const replies = comment.replyCount ?? 0

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !busy) onCancel() }}>
      <DialogContent className="max-w-[calc(100vw-2rem)] grid-cols-[minmax(0,1fr)] gap-0 p-0 sm:max-w-[520px]" data-testid="admin-comments-remove-dialog">
        <DialogHeader className="px-6 pb-3 pt-5 text-left">
          <DialogTitle>{txa('Yorumu kaldır')}</DialogTitle>
          <DialogDescription className="line-clamp-2 [overflow-wrap:anywhere]">
            @{comment.authorUsername}: {comment.body.trim() || txa('Metin yok')}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 px-6 pb-5">
          <p className="rounded-xl bg-muted/60 px-3.5 py-2.5 text-[12.5px] text-muted-foreground">
            {txa('Yorum sitede görünmez olur; gerekçe yazara bildirim olarak iletilir.')}
            {replies > 0 ? txa(' Bu yorumun {v1} yanıtı da gizlenir; yanıt yazanlara bildirim gitmez.', { v1: replies }) : ''}
          </p>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={txa('Gerekçe')}>
            {REMOVE_REASON_PRESETS.map((item) => (
              <button
                key={item.value}
                type="button"
                aria-pressed={chosen === item.value}
                onClick={() => setPreset(item.value)}
                className={cn('rounded-full border px-2.5 py-1 text-[12px] font-semibold transition-colors', chosen === item.value ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:text-foreground')}
              >
                {item.label}
              </button>
            ))}
          </div>
          <label className="block">
            <span className="mb-1.5 block text-[11.5px] font-bold uppercase tracking-wider text-muted-foreground">{txa('Ek not (isteğe bağlı)')}</span>
            <Textarea value={note} onChange={(event) => setNote(event.target.value.slice(0, 300))} rows={2} placeholder={txa('Yazara iletilecek kısa açıklama')} className="resize-none text-[13px]" />
          </label>
        </div>
        <DialogFooter className="border-t border-border/60 px-6 py-3">
          <Button variant="ghost" disabled={busy} onClick={onCancel}>{txa('Vazgeç')}</Button>
          <Button variant="destructive" disabled={busy || !chosen} onClick={() => onConfirm(reason)} data-testid="admin-comments-remove-confirm">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <X className="size-4" />}{txa('Kaldır ve bildir')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
