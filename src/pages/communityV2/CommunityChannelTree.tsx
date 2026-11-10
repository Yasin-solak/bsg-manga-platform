import { Archive, Hash, LockKeyhole } from 'lucide-react'
import type { CommunityChannel } from '@/services/communityV2Service'
import { channelGroups } from '@/lib/communityManagementPolicy'
import { txa } from '@/i18n/activeLocale'

export function CommunityChannelTree({ channels, selectedId, select }: { channels: CommunityChannel[]; selectedId?: string; select: (id: string) => void }) {
  const archived = channels.filter(ch => ch.archived_at)
  const item = (ch: CommunityChannel) => <button className="cv2-channel" aria-current={selectedId === ch.id ? 'page' : undefined} key={ch.id} onClick={() => select(ch.id)}>
    {ch.archived_at ? <Archive size={14} /> : ch.is_private ? <LockKeyhole size={14} /> : <Hash size={16} />}
    <span>{ch.name}</span>{ch.mention_count > 0 && <b className="cv2-mention-badge" aria-label={txa('Okunmamış etiketin var')}>@</b>}{ch.unread > 0 && <b>{ch.unread >= 999 ? '999+' : ch.unread}</b>}
  </button>
  return <>
    {channelGroups(channels).map(([name, rows]) => <section className="cv2-channel-category" key={name}><h3>{name}</h3>{rows.map(item)}</section>)}
    {!!archived.length && <details className="cv2-channel-archive" key={archived.some(c => c.id === selectedId) ? 'selected' : 'closed'} open={archived.some(c => c.id === selectedId) || undefined}><summary>{txa('Arşiv')} <span>{archived.length}</span></summary>{archived.map(item)}</details>}
  </>
}
