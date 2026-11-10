import { useCallback, useEffect, useState } from 'react'
import { Link } from '@/i18n/router'
import { SpinnerGap } from '@phosphor-icons/react'
import { AvatarFrame, type FrameType } from '@components/common/AvatarFrame'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { userService, type FollowRequestItem } from '@/services/userService'
import { toast } from '@/services/toastService'
import { getRelativeTime } from '@components/community/communityUiShared'
import { txa } from '@/i18n/activeLocale'

/*
 * Private account: incoming follow requests. The owner approves (becomes a follower, a notification goes) or deletes.
 * Opens by itself when arriving from a notification (/profil/<name>?takip-istekleri=1).
 */

export function ProfileFollowRequestsDialog({ open, onOpenChange, onChanged }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onChanged: () => void
}) {
  const [items, setItems] = useState<FollowRequestItem[] | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setItems(await userService.listMyFollowRequests())
    } catch {
      setItems([])
      toast.error(txa('Takip istekleri yüklenemedi.'))
    }
  }, [])

  useEffect(() => {
    if (open) void load()
  }, [open, load])

  const respond = async (item: FollowRequestItem, accept: boolean) => {
    setBusyId(item.requesterId)
    try {
      await userService.respondFollowRequest(item.requesterId, accept)
      setItems((current) => (current ?? []).filter((entry) => entry.requesterId !== item.requesterId))
      toast.success(accept ? txa('@{v1} artık seni takip ediyor.', { v1: item.username }) : txa('İstek silindi.'))
      onChanged()
    } catch {
      toast.error(txa('İstek yanıtlanamadı, tekrar dene.'))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-w-md' data-testid='profile-follow-requests'>
        <DialogHeader>
          <DialogTitle>{txa('Takip istekleri')}</DialogTitle>
          <DialogDescription>{txa('Onayladıkların profilini görebilir. Sildiğin kişiye bildirim gitmez.')}</DialogDescription>
        </DialogHeader>
        {items === null ? (
          <div className='flex h-32 items-center justify-center text-muted-foreground'><SpinnerGap size={20} className='animate-spin' /></div>
        ) : items.length === 0 ? (
          <p className='rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground'>{txa('Bekleyen takip isteğin yok.')}</p>
        ) : (
          <ul className='flex max-h-[60vh] flex-col gap-2 overflow-y-auto'>
            {items.map((item) => (
              <li key={item.requesterId} className='flex items-center gap-3 rounded-xl border border-border/70 p-2.5'>
                <Link to={`/profil/${encodeURIComponent(item.username)}`} onClick={() => onOpenChange(false)} className='shrink-0'>
                  <AvatarFrame
                    src={item.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(item.username)}`}
                    alt={item.displayName}
                    frameType={(item.frameType || 'default') as FrameType}
                    size={40}
                  />
                </Link>
                <div className='min-w-0 flex-1'>
                  <p className='truncate text-sm font-bold'>{item.displayName}</p>
                  <p className='truncate text-xs text-muted-foreground'>@{item.username} · {getRelativeTime(item.createdAt)}</p>
                </div>
                <div className='flex shrink-0 gap-1.5'>
                  <button
                    type='button'
                    disabled={busyId === item.requesterId}
                    onClick={() => { void respond(item, true) }}
                    className='h-8 rounded-lg bg-primary px-3 text-xs font-black text-primary-foreground disabled:opacity-60'
                  >
                    {txa('Onayla')}
                  </button>
                  <button
                    type='button'
                    disabled={busyId === item.requesterId}
                    onClick={() => { void respond(item, false) }}
                    className='h-8 rounded-lg border border-border px-3 text-xs font-bold text-muted-foreground hover:text-foreground disabled:opacity-60'
                  >
                    {txa('Sil')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}
