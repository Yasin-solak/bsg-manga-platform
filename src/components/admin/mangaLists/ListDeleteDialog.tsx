import { AlertTriangle, Loader2, Lock, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { AdminMangaListSummary } from '@/services/adminMangaListService'
import { intlLocale, txa } from '@/i18n/activeLocale'

/**
 * List delete confirm (single or bulk). Deletion removes the list, its items, comments
 * and ratings; it cannot be undone. Making it private is usually enough,
 * so the dialog also offers "make private instead".
 */
export function ListDeleteDialog({
  lists,
  busy,
  onCancel,
  onMakePrivateInstead,
  onConfirm,
}: {
  /** null: dialog closed. */
  lists: AdminMangaListSummary[] | null
  busy: boolean
  onCancel: () => void
  onMakePrivateInstead: () => void
  onConfirm: () => void
}) {
  if (!lists || lists.length === 0) return null
  const single = lists.length === 1 ? lists[0] : null
  const items = lists.reduce((sum, list) => sum + list.itemsCount, 0)
  const comments = lists.reduce((sum, list) => sum + list.commentsCount, 0)
  const publicCount = lists.filter((list) => list.isPublic).length

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !busy) onCancel() }}>
      <DialogContent className="max-w-[calc(100vw-2rem)] grid-cols-[minmax(0,1fr)] gap-0 p-0 sm:max-w-[480px]" data-testid="admin-lists-delete-dialog">
        <DialogHeader className="px-6 pb-3 pt-5 text-left">
          <DialogTitle>{single ? txa('Listeyi kalıcı olarak sil') : txa('{v1} listeyi kalıcı olarak sil', { v1: lists.length })}</DialogTitle>
          <DialogDescription className="line-clamp-2 [overflow-wrap:anywhere]">
            {single ? `${single.title} · @${single.ownerUsername}` : lists.map((list) => list.title).join(', ')}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 px-6 pb-5 text-[12.5px]">
          <p className="flex items-start gap-2 rounded-xl bg-rose-500/10 px-3.5 py-2.5 text-rose-700 dark:text-rose-300">
            <AlertTriangle className="mt-px size-4 shrink-0" />
            {txa('{v1}; {v2} manga kaydı, {v3} yorum ve puanlarıyla birlikte silinir. Sahibine bildirim gitmez. Bu işlem geri alınamaz.', { v1: single ? txa('Liste') : txa('Listeler'), v2: items.toLocaleString(intlLocale()), v3: comments.toLocaleString(intlLocale()) })}
          </p>
          {publicCount > 0 ? (
            <p className="text-muted-foreground">
              {txa('Yalnızca katalogda görünmesin istiyorsan özele almak yeterli; sahibi listesini korur.')}
            </p>
          ) : null}
        </div>
        <DialogFooter className="gap-2 border-t border-border/60 px-6 py-3 sm:justify-between">
          {publicCount > 0 ? (
            <Button variant="outline" disabled={busy} onClick={onMakePrivateInstead} className="gap-1.5">
              <Lock className="size-4" />{txa('Bunun yerine özele al')}
            </Button>
          ) : <span />}
          <span className="flex gap-2">
            <Button variant="ghost" disabled={busy} onClick={onCancel}>{txa('Vazgeç')}</Button>
            <Button variant="destructive" disabled={busy} onClick={onConfirm} data-testid="admin-lists-delete-confirm">
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              {txa('Kalıcı olarak sil')}
            </Button>
          </span>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
