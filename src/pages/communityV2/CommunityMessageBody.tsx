import type { CommunityMessage } from '@/services/communityV2Service'
import { splitCommunityMentions } from '@/lib/communityMentions'
import { UserHoverCard } from '@/components/common/UserHoverCard'
import { txa } from '@/i18n/activeLocale'

export function CommunityMessageBody({ message }: { message: CommunityMessage }) {
  if (message.deleted_at) return <p className="cv2-deleted">{txa('Bu mesaj silindi.')}</p>
  return <div className="cv2-message-body">{splitCommunityMentions(message.body, message.mentions).map((part, index) => {
    if (!part.mention) return part.text
    const m = part.mention
    const label = <span tabIndex={0} className="cv2-mention" style={{ color: m.kind === 'role' ? m.color || undefined : undefined }}>{part.text}</span>
    return m.kind === 'user' && m.username ? <UserHoverCard key={index} id={m.id} username={m.username} displayName={m.label} avatar="" className="cv2-mention-trigger" portalClassName="z-[11020] pointer-events-auto">{label}</UserHoverCard> : <span key={index} title={txa('Sunucu rolü')}>{label}</span>
  })}</div>
}
