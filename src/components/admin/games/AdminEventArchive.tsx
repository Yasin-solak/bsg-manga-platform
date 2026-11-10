import { useCallback, useEffect, useState } from 'react'
import { CalendarClock, Gift, Loader2, Trophy } from 'lucide-react'
import { AdminSurface } from '@/components/admin/shared/AdminSurface'
import { getAdminSiteEvents, type SiteEvent, type SiteEventWinner } from '@/services/siteEventsService'
import { intlLocale, txa } from '@/i18n/activeLocale'

/*
 * Admin > Games > Events: permanent record of past and running events. When the end time comes
 * the server closes the event itself, pays rewards and writes the result here; no action in the panel.
 */

const STATUS: Record<SiteEvent['status'], { label: string, className: string }> = {
  scheduled: { get label() { return txa('Planlandı') }, className: 'bg-sky-500/10 text-sky-700 dark:text-sky-300' },
  active: { get label() { return txa('Sürüyor') }, className: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' },
  finalized: { get label() { return txa('Bitti') }, className: 'bg-muted text-muted-foreground' },
  cancelled: { get label() { return txa('İptal') }, className: 'bg-destructive/10 text-destructive' },
}

const KIND: Record<SiteEvent['kind'], string> = { get collect() { return txa('Toplama') }, get sale() { return txa('Kampanya') }, get contest() { return txa('Yarışma') }, get other() { return txa('Diğer') } }

const RULE_LABELS: Record<string, string> = {
  get rewardCoin() { return txa('Yakalama ödülü (Coin)') }, get rareKind() { return txa('Nadir kuzen') }, get rareRewardCoin() { return txa('Nadir ödülü (Coin)') }, get dailyLimit() { return txa('Günlük sınır') },
  get cooldownSeconds() { return txa('Bekleme (sn)') }, get spawnChance() { return txa('Çıkma olasılığı') }, get ttlSeconds() { return txa('Ekranda kalma (sn)') }, get badge() { return txa('Rozet') },
}

const formatDate = (iso: string | null) => (iso ? new Date(iso).toLocaleString(intlLocale(), { dateStyle: 'medium', timeStyle: 'short' }) : '-')

function formatRule(value: unknown): string {
  if (value && typeof value === 'object') return Object.entries(value as Record<string, unknown>).map(([k, v]) => `${k}: ${String(v)}`).join(', ')
  return String(value)
}

function grantText(winner: SiteEventWinner): string {
  const grant = winner.grant
  if (!grant) return '-'
  if (grant.fallbackCoin) return txa('Zaten sahipti, {v1} Coin verildi', { v1: grant.fallbackCoin })
  if (grant.status === 'granted') return txa('{v1} verildi ({v2} parça{v3})', { v1: winner.prize ?? txa('Ödül'), v2: grant.granted ?? 0, v3: grant.orderCode ? `, ${grant.orderCode}` : '' })
  if (grant.status === 'already_granted') return txa('Daha önce verilmiş')
  return grant.status
}

function Stat({ label, value }: { label: string, value: number | undefined }) {
  return (
    <div className='rounded-lg border border-border/60 px-3 py-2'>
      <p className='text-xs text-muted-foreground'>{label}</p>
      <p className='text-lg font-semibold tabular-nums'>{value ?? 0}</p>
    </div>
  )
}

function EventCard({ event }: { event: SiteEvent }) {
  const status = STATUS[event.status]
  const results = event.results
  const prizes = event.prizes.map((prize) => {
    const rank = Array.isArray(prize.rank) ? txa('{v1}-{v2}. sıra', { v1: prize.rank[0], v2: prize.rank[1] }) : txa('Ödül')
    const fallback = typeof prize.fallbackCoin === 'number' ? txa(' (zaten sahipse {v1} Coin)', { v1: prize.fallbackCoin }) : ''
    return `${rank}: ${String(prize.label ?? prize.productSlug ?? '')}${fallback}`
  })

  return (
    <AdminSurface className='space-y-4 p-4' data-testid='admin-site-event'>
      <div className='flex flex-wrap items-start justify-between gap-2'>
        <div>
          <h3 className='text-base font-semibold'>{event.name}</h3>
          <p className='flex items-center gap-1.5 text-xs text-muted-foreground'>
            <CalendarClock className='size-3.5' />{formatDate(event.startsAt)} → {formatDate(event.endsAt)} · {KIND[event.kind]}
          </p>
        </div>
        <span className={`rounded-md px-2 py-1 text-xs font-semibold ${status.className}`}>{status.label}</span>
      </div>
      {event.summary ? <p className='text-sm text-muted-foreground'>{event.summary}</p> : null}

      <div className='grid gap-4 md:grid-cols-2'>
        <div>
          <h4 className='mb-1 text-xs font-semibold uppercase text-muted-foreground'>{txa('Kurallar')}</h4>
          <ul className='space-y-0.5 text-sm'>
            {Object.entries(event.rules).map(([key, value]) => (
              <li key={key}><span className='text-muted-foreground'>{RULE_LABELS[key] ?? key}:</span> {formatRule(value)}</li>
            ))}
          </ul>
        </div>
        <div>
          <h4 className='mb-1 flex items-center gap-1 text-xs font-semibold uppercase text-muted-foreground'><Gift className='size-3.5' />{txa('Ödüller')}</h4>
          <ul className='space-y-0.5 text-sm'>{prizes.length ? prizes.map((line) => <li key={line}>{line}</li>) : <li className='text-muted-foreground'>{txa('Yok')}</li>}</ul>
          {event.status !== 'finalized' ? (
            <p className='mt-2 text-xs text-muted-foreground'>{txa('Bitişten sonraki 10 dakika içinde otomatik kapanır, ödüller dağıtılır ve sonuç buraya yazılır.')}</p>
          ) : null}
        </div>
      </div>

      {results ? (
        <div className='space-y-3 border-t border-border/60 pt-3'>
          <p className='text-xs text-muted-foreground'>{txa('Kapanış: {v1}', { v1: formatDate(event.finalizedAt) })}</p>
          {results.note ? <p className='text-sm'>{results.note}</p> : (
            <div className='grid grid-cols-2 gap-2 sm:grid-cols-5'>
              <Stat label={txa('Katılımcı')} value={results.participants} />
              <Stat label={txa('Çıkan kuzen')} value={results.spawns} />
              <Stat label={txa('Yakalanan')} value={results.catches} />
              <Stat label={txa('Dağıtılan Coin')} value={results.coinsAwarded} />
              <Stat label={txa('Rozet sahibi')} value={results.badgeHolders} />
            </div>
          )}
          {results.byKind && Object.keys(results.byKind).length ? (
            <p className='text-sm'><span className='text-muted-foreground'>{txa('Türlere göre:')}</span> {Object.entries(results.byKind).map(([kind, n]) => `${kind} ${n}`).join(' · ')}</p>
          ) : null}
          {results.winners?.length ? (
            <div>
              <h4 className='mb-1 flex items-center gap-1 text-xs font-semibold uppercase text-muted-foreground'><Trophy className='size-3.5' />{txa('Kazananlar')}</h4>
              <ol className='space-y-1 text-sm'>
                {results.winners.map((winner) => (
                  <li key={winner.rank} className='flex flex-wrap justify-between gap-2 rounded-md bg-muted/40 px-3 py-1.5'>
                    <span><b>{winner.rank}.</b> {winner.displayName ?? winner.username} <span className='text-muted-foreground'>{txa('@{v1} · {v2} yakalama', { v1: winner.username ?? '', v2: winner.total })}</span></span>
                    <span className='text-xs text-muted-foreground'>{grantText(winner)}</span>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
          {results.top10?.length ? (
            <p className='text-xs text-muted-foreground'>{txa('İlk 10:')} {results.top10.map((row) => `${row.rank}. ${row.username ?? row.displayName} (${row.total})`).join(', ')}</p>
          ) : null}
        </div>
      ) : null}
    </AdminSurface>
  )
}

export function AdminEventArchive() {
  const [events, setEvents] = useState<SiteEvent[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setEvents(await getAdminSiteEvents())
    } catch (loadError) {
      setError(loadError instanceof Error ? txa(loadError.message) : txa('Etkinlikler yüklenemedi.'))
    }
  }, [])

  useEffect(() => { void load() }, [load])

  if (error) return <p className='rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive'>{error}</p>
  if (!events) return <div className='flex justify-center py-10'><Loader2 className='size-5 animate-spin text-muted-foreground' /></div>

  return (
    <div className='space-y-3' data-testid='admin-event-archive'>
      {events.length ? events.map((event) => <EventCard key={event.slug} event={event} />) : (
        <p className='rounded-xl border border-border p-4 text-sm text-muted-foreground'>{txa('Henüz kayıtlı etkinlik yok.')}</p>
      )}
    </div>
  )
}
