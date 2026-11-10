import type { PresencePeer } from './usePagePresence'
import { txa } from '@/i18n/activeLocale'

/** Editor top bar: others on this page (colored initial, name on hover). */
export function PresenceBar({ peers, itemLabel }: { peers: PresencePeer[], itemLabel: (itemId: string) => string | null }) {
  if (!peers.length) return null
  return (
    <div className='flex flex-none items-center gap-1.5' data-testid='tl-presence'>
      <span className='hidden text-[11.5px] font-semibold text-[var(--tl-mut)] 2xl:inline'>{txa('Bu sayfada:')}</span>
      <div className='flex -space-x-1.5'>
        {peers.slice(0, 5).map((peer) => {
          const editing = peer.selectedItemId ? itemLabel(peer.selectedItemId) : null
          return (
            <span
              key={peer.userId}
              className='flex h-7 w-7 items-center justify-center rounded-full border-2 border-[var(--tl-sb)] text-[11px] font-extrabold uppercase text-[#10131a]'
              style={{ background: peer.color }}
              title={editing ? txa('{v1} · {v2} düzenliyor', { v1: peer.username, v2: editing }) : txa('{v1} bu sayfada', { v1: peer.username })}
              data-testid='tl-presence-peer'
            >
              {peer.username.slice(0, 1)}
            </span>
          )
        })}
      </div>
      {peers.length > 5 && <span className='text-[11px] font-bold text-[var(--tl-mut)]'>+{peers.length - 5}</span>}
    </div>
  )
}
