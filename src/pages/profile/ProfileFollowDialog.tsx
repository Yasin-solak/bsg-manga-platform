import { ProfileHoverLink } from '@components/common/ProfileHoverLink'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { FollowUser } from './types'
import { txa } from '@/i18n/activeLocale'

type ProfileFollowDialogProps = {
  emptyText: string
  loading?: boolean
  onOpenChange: (open: boolean) => void
  open: boolean
  title: string
  users: FollowUser[]
}

export default function ProfileFollowDialog({
  emptyText,
  loading = false,
  onOpenChange,
  open,
  title,
  users,
}: ProfileFollowDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="border-b border-border bg-card/95 px-6 py-4">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[80vh]">
          <div className="space-y-3 bg-background px-6 py-5">
            {loading ? (
              <p className="m-0 rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
                {txa('Liste yükleniyor...')}
              </p>
            ) : users.length > 0 ? (
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {users.map((followUser, index) => (
                  <li key={`${followUser.id}-${index}`}>
                    <ProfileHoverLink
                      userId={followUser.id}
                      username={followUser.username}
                      avatar={followUser.avatar}
                      className="flex items-center gap-3 rounded-2xl border border-border/70 bg-card/70 px-3 py-2.5 text-foreground no-underline transition-colors hover:border-primary/30 hover:bg-muted/70"
                      onClick={() => onOpenChange(false)}
                    >
                      <>
                        <img loading="lazy" decoding="async"
                          src={followUser.avatar}
                          alt=""
                          className="h-10 w-10 rounded-full border border-border object-cover"
                        />
                        <span className="text-base font-medium">{followUser.username}</span>
                      </>
                    </ProfileHoverLink>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="m-0 rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
                {emptyText}
              </p>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
