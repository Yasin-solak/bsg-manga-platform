import { Link } from '@/i18n/router'
import { FansubHoverCard, UserHoverCard } from '@/components/common/UserHoverCard'
import type { AnnouncementReference } from '@/services/announcementV2'

export function AnnouncementMention({ reference: r }: { reference: AnnouncementReference }) {
  const link = <Link to={r.href} className="relative z-10 pointer-events-auto font-semibold text-primary underline decoration-primary/25 underline-offset-2">{r.title}</Link>
  // The card moves to body; it must stay above the announcement dialog's overlay and pointer lock.
  const portalClassName = 'z-[11020] pointer-events-auto'
  const fansubSlug = r.href.match(/^\/fansub\/([^/?#]+)(?:[?#]|$)/)?.[1]
  return r.kind === 'user'
    ? <UserHoverCard id={r.id} username={r.title.replace(/^@/, '')} avatar={r.image || ''} className="!inline-flex align-baseline pointer-events-auto" portalClassName={portalClassName}>{link}</UserHoverCard>
    : <FansubHoverCard id={r.id} slug={fansubSlug} name={r.title} avatar={r.image || ''} className="!inline-flex align-baseline pointer-events-auto" portalClassName={portalClassName}>{link}</FansubHoverCard>
}
