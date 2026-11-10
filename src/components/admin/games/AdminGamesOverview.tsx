import { AlertTriangle, Coins, Gamepad2, Trophy, Users } from 'lucide-react'
import { AdminSurface } from '@/components/admin/shared/AdminSurface'
import type { DailyGamesOverview } from '@/services/adminDailyGamesService'
import { intlLocale, txa } from '@/i18n/activeLocale'

/* Genel bakis: bugunun ozeti, gunluk tablo, en cok kazananlar, supheli kosular. */

const formatDay = (value: string) => {
  const [, month, day] = value.split('-')
  return `${day}.${month}`
}

export function AdminGamesOverview({ overview }: { overview: DailyGamesOverview }) {
  const today = overview.daily.find((row) => row.date === overview.today) ?? overview.daily[0]
  const solveRate = today && today.coverPlayers > 0 ? Math.round((today.coverSolved / today.coverPlayers) * 100) : 0

  return (
    <div className='space-y-4' data-testid='admin-games-overview'>
      <section className='overflow-hidden rounded-[20px] border border-border/70 bg-card/60' aria-label={txa('Bugünün özeti')} data-testid='admin-games-strip'>
        <div className='-mb-px -mr-px grid grid-cols-2 lg:grid-cols-4 [&>*]:border-b [&>*]:border-r [&>*]:border-border/60'>
          {([
            [Users, 'bg-primary/10 text-primary', txa('Bugün oynayan'), (today?.players ?? 0).toLocaleString(intlLocale())],
            [Coins, 'bg-amber-500/10 text-amber-500', txa('Bugün dağıtılan coin'), (today?.coins ?? 0).toLocaleString(intlLocale())],
            [Trophy, 'bg-emerald-500/10 text-emerald-500', txa('Günün Kapağı bilme oranı'), txa('%{v1}', { v1: solveRate })],
            [Gamepad2, 'bg-sky-500/10 text-sky-500', txa('Bugünkü atari denemesi'), ((today?.runnerRuns ?? 0) + (today?.matchRuns ?? 0)).toLocaleString(intlLocale())],
          ] as const).map(([Icon, tone, label, value]) => (
            <div key={label} className='flex items-center gap-3 px-4 py-3'>
              <span className={`flex size-9 shrink-0 items-center justify-center rounded-xl max-sm:hidden ${tone}`}><Icon className='size-[18px]' /></span>
              <span className='min-w-0'>
                <span className='block truncate text-[11.5px] font-semibold text-muted-foreground'>{label}</span>
                <span className='block text-[20px] font-black leading-tight tabular-nums'>{value}</span>
              </span>
            </div>
          ))}
        </div>
      </section>

      <AdminSurface className='overflow-hidden'>
        <div className='border-b border-border px-4 py-3'>
          <h3 className='text-sm font-semibold'>{txa('Günlük döküm')}</h3>
          <p className='text-xs text-muted-foreground'>{txa('Son {v1} gün · İstanbul günü', { v1: overview.daily.length })}</p>
        </div>
        <div className='overflow-x-auto'>
          <table className='w-full min-w-[640px] text-sm'>
            <thead className='bg-muted/40 text-left text-xs text-muted-foreground'>
              <tr>
                <th className='px-4 py-2 font-medium'>{txa('Gün')}</th>
                <th className='px-4 py-2 text-right font-medium'>{txa('Oyuncu')}</th>
                <th className='px-4 py-2 text-right font-medium'>{txa('Kapak (bilen/oynayan)')}</th>
                <th className='px-4 py-2 text-right font-medium'>{txa('Panel')}</th>
                <th className='px-4 py-2 text-right font-medium'>{txa('Koşu')}</th>
                <th className='px-4 py-2 text-right font-medium'>{txa('Eşleme')}</th>
                <th className='px-4 py-2 text-right font-medium'>{txa('Coin')}</th>
              </tr>
            </thead>
            <tbody className='tabular-nums'>
              {overview.daily.map((row) => (
                <tr key={row.date} className='border-t border-border/60'>
                  <td className='px-4 py-2 font-medium'>{formatDay(row.date)}{row.date === overview.today && <span className='ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary'>{txa('bugün')}</span>}</td>
                  <td className='px-4 py-2 text-right'>{row.players}</td>
                  <td className='px-4 py-2 text-right'>{row.coverSolved}/{row.coverPlayers}</td>
                  <td className='px-4 py-2 text-right'>{row.panelPlayers}</td>
                  <td className='px-4 py-2 text-right'>{row.runnerRuns}</td>
                  <td className='px-4 py-2 text-right'>{row.matchRuns}</td>
                  <td className='px-4 py-2 text-right font-semibold'>{row.coins}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AdminSurface>

      <div className='grid gap-4 lg:grid-cols-2'>
        <AdminSurface className='p-4'>
          <h3 className='text-sm font-semibold'>{txa('En çok kazananlar')}</h3>
          <p className='mb-3 text-xs text-muted-foreground'>{txa('Son 7 gün, oyunlardan gelen coin')}</p>
          {overview.topEarners.length === 0 ? (
            <p className='text-sm text-muted-foreground'>{txa('Henüz kimse coin kazanmadı.')}</p>
          ) : (
            <ol className='space-y-1.5'>
              {overview.topEarners.map((row, index) => (
                <li key={row.userId} className='flex items-center justify-between text-sm'>
                  <span className='truncate'><span className='mr-2 text-xs text-muted-foreground tabular-nums'>{index + 1}.</span>{row.username ?? row.userId.slice(0, 8)}</span>
                  <span className='font-semibold tabular-nums'>{row.coins}</span>
                </li>
              ))}
            </ol>
          )}
        </AdminSurface>

        <AdminSurface className='p-4' tone={overview.suspiciousRuns.length > 0 ? 'accent' : 'default'}>
          <h3 className='flex items-center gap-1.5 text-sm font-semibold'>
            {overview.suspiciousRuns.length > 0 && <AlertTriangle className='size-4 text-amber-500' />}{txa('Şüpheli koşular')}
          </h3>
          <p className='mb-3 text-xs text-muted-foreground'>{txa('Skoru sunucu sınırına (saniyede 12 puan) çok yakın Mürek Koşusu denemeleri. Sunucu fazlasını zaten keser; bu liste takip içindir.')}</p>
          {overview.suspiciousRuns.length === 0 ? (
            <p className='text-sm text-muted-foreground'>{txa('Şüpheli deneme yok.')}</p>
          ) : (
            <ul className='space-y-1.5 text-sm'>
              {overview.suspiciousRuns.map((run) => (
                <li key={run.runId} className='flex items-center justify-between gap-2'>
                  <span className='truncate'>{run.username ?? run.userId.slice(0, 8)} <span className='text-xs text-muted-foreground'>· {formatDay(run.date)}</span></span>
                  <span className='shrink-0 font-mono text-xs tabular-nums'>{txa('{v1} puan / {v2} sn · +{v3}', { v1: run.score, v2: run.seconds, v3: run.coin })}</span>
                </li>
              ))}
            </ul>
          )}
        </AdminSurface>
      </div>
    </div>
  )
}
