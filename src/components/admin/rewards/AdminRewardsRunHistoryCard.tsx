import type { FansubMonthlyRewardRunRow } from '@/services/rewardService'
import { cn } from '@/lib/utils'
import { formatDateTime, formatMonthLabel, formatNumber } from './adminRewardsUtils'
import { txa } from '@/i18n/activeLocale'

const STATUS: Record<FansubMonthlyRewardRunRow['status'], { label: string, tone: string }> = {
  completed: { get label() { return txa('Dağıtıldı') }, tone: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300' },
  processing: { get label() { return txa('İşleniyor') }, tone: 'bg-sky-500/12 text-sky-700 dark:text-sky-300' },
  pending: { get label() { return txa('Bekliyor') }, tone: 'bg-muted text-muted-foreground' },
  failed: { get label() { return txa('Başarısız') }, tone: 'bg-rose-500/12 text-rose-700 dark:text-rose-300' },
}

interface AdminRewardsRunHistoryCardProps {
  configLoading: boolean
  runs: FansubMonthlyRewardRunRow[]
}

/** Payout history: old records run before the month ended are marked. */
export function AdminRewardsRunHistoryCard({ configLoading, runs }: AdminRewardsRunHistoryCardProps) {
  return (
    <section className="overflow-hidden rounded-[20px] border border-border/70 bg-card/60" data-testid="rewards-history">
      <header className="border-b border-border/60 px-5 py-3.5">
        <h2 className="text-[15px] font-bold">{txa('Dağıtım geçmişi')}</h2>
      </header>
      {configLoading ? (
        <div className="flex flex-col gap-2 p-4">{[0, 1].map((index) => <div key={index} className="h-10 animate-pulse rounded-xl bg-muted/40" />)}</div>
      ) : runs.length === 0 ? (
        <p className="px-5 py-6 text-center text-[13px] text-muted-foreground">{txa('Henüz dağıtım yapılmadı.')}</p>
      ) : (
        <ul className="max-h-[320px] divide-y divide-border/50 overflow-y-auto">
          {runs.map((run) => {
            const status = STATUS[run.status] ?? STATUS.pending
            const monthEnd = new Date(run.monthStart)
            monthEnd.setMonth(monthEnd.getMonth() + 1)
            const early = Boolean(run.startedAt) && new Date(run.startedAt as string).getTime() < monthEnd.getTime()
            return (
              <li key={run.id} className="flex items-center gap-3 px-5 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[13px] font-semibold">{formatMonthLabel(run.monthStart)}</span>
                    <span className={cn('rounded-md px-1.5 py-px text-[10.5px] font-bold', status.tone)}>{status.label}</span>
                    {early ? <span className="rounded-md bg-amber-500/12 px-1.5 py-px text-[10.5px] font-bold text-amber-700 dark:text-amber-300" title={txa('Bu ay bitmeden çalıştırılmış; ödül eksik okunma verisiyle hesaplandı.')}>{txa('Ay bitmeden')}</span> : null}
                  </span>
                  <span className="block truncate text-[11.5px] text-muted-foreground">
                    {formatDateTime(run.completedAt ?? run.startedAt)}{run.runByUsername ? ` · @${run.runByUsername}` : ''}
                  </span>
                </span>
                <span className="shrink-0 text-right text-[12px] tabular-nums">
                  <span className="block font-bold text-amber-600 dark:text-amber-300">{formatNumber(run.totalCoin)} coin</span>
                  <span className="block text-muted-foreground">{formatNumber(run.totalFansubs)} fansub</span>
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
