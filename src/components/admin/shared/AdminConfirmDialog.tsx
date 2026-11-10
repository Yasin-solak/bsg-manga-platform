import type { ReactNode } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { txa } from '@/i18n/activeLocale'

export interface AdminConfirmRequest {
  title: string
  /** Which record(s) are affected: shortened to two lines. */
  subject: string
  /** Clear statement of the result. */
  consequence: ReactNode
  confirmLabel: string
  destructive?: boolean
  run: () => Promise<void>
}

/**
 * Confirm dialog for admin desks (single and bulk). The result is stated first;
 * used instead of the native confirm.
 */
export function AdminConfirmDialog({ request, busy, onCancel, onConfirm }: {
  request: AdminConfirmRequest | null
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <Dialog open={Boolean(request)} onOpenChange={(next) => { if (!next && !busy) onCancel() }}>
      <DialogContent className="max-w-[calc(100vw-2rem)] grid-cols-[minmax(0,1fr)] gap-0 p-0 sm:max-w-[460px]" data-testid="admin-confirm-dialog">
        {request ? (
          <>
            <DialogHeader className="px-6 pb-3 pt-5 text-left">
              <DialogTitle>{request.title}</DialogTitle>
              <DialogDescription className="line-clamp-2 [overflow-wrap:anywhere]">{request.subject}</DialogDescription>
            </DialogHeader>
            <div className="px-6 pb-5 text-[12.5px]">
              <p className={cn('flex items-start gap-2 rounded-xl px-3.5 py-2.5', request.destructive ? 'bg-rose-500/10 text-rose-700 dark:text-rose-300' : 'bg-muted/60 text-muted-foreground')}>
                {request.destructive ? <AlertTriangle className="mt-px size-4 shrink-0" /> : null}
                <span>{request.consequence}</span>
              </p>
            </div>
            <DialogFooter className="gap-2 border-t border-border/60 px-6 py-3">
              <Button variant="ghost" disabled={busy} onClick={onCancel}>{txa('Vazgeç')}</Button>
              <Button variant={request.destructive ? 'destructive' : 'default'} disabled={busy} onClick={onConfirm} data-testid="admin-confirm">
                {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                {request.confirmLabel}
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
