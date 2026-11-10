import { Clock, Gift } from '@phosphor-icons/react'
import type { ActiveEvent } from '@/services/rewardService/activeEvents'
import { formatEventCountdown } from '@/components/common/EventQuestsPanel'
import { txa } from '@/i18n/activeLocale'
export function DesktopEventCard({ event, onOpen }: { event: ActiveEvent; onOpen: () => void }) {
  return <button className="dh-event" onClick={onOpen}><span><strong>{event.title}</strong><small><Clock size={11} />{event.endsAt ? formatEventCountdown(new Date(event.endsAt).getTime() - Date.now()) : txa('Aktif')} · {event.claimedCount}/{event.quests.length}</small></span>{event.claimableCount > 0 && <b><Gift size={11} />{txa('{v1} ödül', { v1: event.claimableCount })}</b>}</button>
}
