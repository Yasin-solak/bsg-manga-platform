import { useEffect, useState } from 'react'
import { PartyPopper } from 'lucide-react'
import type { ActiveEvent } from '@/services/rewardService/activeEvents'
import { useTx } from '@/i18n/LocaleProvider'
import { txa } from '@/i18n/activeLocale'

/**
 * Active event card (design handoff pattern).
 *
 * Events already existed but were visible only from the Quests page; a user going in and out of
 * the home page could miss an expiring event without ever seeing it. The card shows
 * TIME LEFT and the user's own progress on the home page.
 *
 * **No data, no card.** A placeholder saying "coming soon" when there is no event
 * would show an empty promise on every open.
 *
 * Quests is not a ROUTE but a quick panel in the sidebar. Rather than linking to an invented
 * `/gorevler` address this uses the existing `mz:open-quests`
 * window event (defined in useAppSidebarData, whose comment
 * mentions the "home quest card").
 */

interface HomeEventCardProps {
  event: ActiveEvent
}

/** "2d 06:14": days if any, otherwise hours:minutes. Seconds are needless noise on a phone. */
function formatRemaining(endsAt: string, nowMs: number): string | null {
  const end = Date.parse(endsAt)
  if (Number.isNaN(end)) return null
  const diff = end - nowMs
  if (diff <= 0) return null

  const totalMinutes = Math.floor(diff / 60_000)
  const days = Math.floor(totalMinutes / (60 * 24))
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60)
  const minutes = totalMinutes % 60
  const hhmm = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
  return days > 0 ? txa('{days}g {time}', { days, time: hhmm }) : hhmm
}

export function HomeEventCard({ event }: HomeEventCardProps) {
  /*
   * Refreshes once a minute. Ticking every second costs both battery and
   * attention on a phone; the smallest unit shown is the minute anyway.
   */
  const [nowMs, setNowMs] = useState(() => Date.now())
  const tx = useTx()
  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  const total = event.quests.length
  const completed = event.quests.filter((quest) => quest.isCompleted).length
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0
  const remaining = event.endsAt ? formatRemaining(event.endsAt, nowMs) : null

  // Showing an expired event as "active" would be false information.
  if (event.endsAt && !remaining) return null

  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent('mz:open-quests'))}
      className="relative flex w-full items-center gap-3 overflow-hidden rounded-xl border border-border bg-card p-3 text-left"
      data-testid="home-event-card"
    >
      {event.banner ? (
        <>
          <img
            src={event.banner}
            alt=""
            className="absolute inset-0 size-full object-cover opacity-25"
            loading="lazy"
          />
          {/* Metin gorseline karsi okunur kalmali; sabit opaklik yeterli degil. */}
          <div className="absolute inset-0 bg-gradient-to-r from-card via-card/85 to-card/40" />
        </>
      ) : null}

      <div className="relative min-w-0 flex-1">
        <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
          <PartyPopper className="size-3" aria-hidden="true" />
          {tx('Etkinlik')}
        </span>
        <p className="m-0 mt-1.5 truncate text-sm font-black text-foreground">{event.title}</p>
        <p className="m-0 mt-0.5 text-[11px] text-muted-foreground">
          {remaining ? tx('{remaining} kaldı', { remaining }) : tx('Süresiz')}
          {total > 0 ? ` · ${tx('{done}/{total} görev tamamlandı', { done: completed, total })}` : ''}
        </p>
      </div>

      {total > 0 ? (
        <div
          className="relative grid size-10 shrink-0 place-items-center rounded-full"
          style={{
            background: `conic-gradient(hsl(var(--primary)) ${percent}%, hsl(var(--muted)) 0)`,
          }}
          role="img"
          aria-label={tx('Görev ilerlemesi yüzde {percent}', { percent })}
        >
          <span className="grid size-8 place-items-center rounded-full bg-card text-[10px] font-black tabular-nums text-foreground">
            %{percent}
          </span>
        </div>
      ) : null}
    </button>
  )
}
