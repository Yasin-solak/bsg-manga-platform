import { useState, type ReactNode } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { UserHoverCard } from '@/components/common/UserHoverCard'
import { txa, intlLocale } from '@/i18n/activeLocale'

export function CommunityAvatar({ url, name }: { url?: string | null; name: string }) {
  const [failed, setFailed] = useState(false)
  return <span className="cv2-avatar">{url && !failed ? <img src={url} alt="" onError={() => setFailed(true)} /> : name.slice(0, 2).toLocaleUpperCase(intlLocale())}</span>
}
export function CommunityIdentity({ user, color }: { user: { user_id: string; username: string; display_name: string | null; avatar_url: string | null }; color?: string }) {
  return <UserHoverCard id={user.user_id} username={user.username} displayName={user.display_name || user.username} avatar={user.avatar_url || ''} className="cv2-identity-trigger" portalClassName="z-[11020] pointer-events-auto">
    <span className="cv2-identity" tabIndex={0}><CommunityAvatar url={user.avatar_url} name={user.username} /><span style={{ color }}>{user.display_name || user.username}<small>@{user.username}</small></span></span>
  </UserHoverCard>
}
export function CommunityModal({ title, description, onClose, children, wide = false }: { title: string; description: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return <Dialog open onOpenChange={open => { if (!open) onClose() }}><DialogContent className={`cv2-dialog ${wide ? 'cv2-dialog-wide' : ''}`}>
    <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>{children}
  </DialogContent></Dialog>
}

export function CommunityLoading() {
  return <div className="cv2-loading" role="status" aria-label={txa('Topluluk yükleniyor')}><span /><span /><span /><span /></div>
}
