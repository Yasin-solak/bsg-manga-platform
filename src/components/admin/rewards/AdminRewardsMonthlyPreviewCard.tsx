import { useState } from 'react'
import { CheckCircle2, Coins, Loader2, RefreshCw, Send } from 'lucide-react'
import type { FansubMonthlyRewardPreviewRow, FansubMonthlyRewardRunRow } from '@/services/rewardService'
import { AdminConfirmDialog, type AdminConfirmRequest } from '@/components/admin/shared/AdminConfirmDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatDateTime, formatMonthLabel, formatNumber, lastClosedMonthInput } from './adminRewardsUtils'
import { txa } from '@/i18n/activeLocale'

interface AdminRewardsMonthlyPreviewCardProps {
  selectedMonth: string
  previewLoading: boolean
  previewError: string | null
  previewRows: FansubMonthlyRewardPreviewRow[]
  runs: FansubMonthlyRewardRunRow[]
  runLoading: boolean
  onSelectedMonthChange: (value: string) => void
  onReloadPreview: () => void
  onRunMonthlyRewards: () => Promise<void>
}

/**
 * Monthly preview and payout. Only a finished month can be selected (the server rejects
 * otherwise too); a paid month shows as locked; payout passes a confirm stating total coins, fansub
 * count and notification result.
 */
export function AdminRewardsMonthlyPreviewCard({
  selectedMonth,
  previewLoading,
  previewError,
  previewRows,
  runs,
  runLoading,
  onSelectedMonthChange,
  onReloadPreview,
  onRunMonthlyRewards,
}: AdminRewardsMonthlyPreviewCardProps) {
  const [confirm, setConfirm] = useState<AdminConfirmRequest | null>(null)
  const [confirmBusy, setConfirmBusy] = useState(false)
  const maxMonth = lastClosedMonthInput()
  const monthOpen = selectedMonth > maxMonth
  const run = runs.find((entry) => entry.monthStart.slice(0, 7) === selectedMonth) ?? null
  const completed = run?.status === 'completed'
  const totalCoin = previewRows.reduce((sum, row) => sum + row.totalCoinReward, 0)
  const paying = previewRows.filter((row) => row.totalCoinReward > 0)

  const askRun = () => {
    setConfirm({
      title: txa('{v1} ödülünü dağıt', { v1: formatMonthLabel(`${selectedMonth}-01`) }),
      subject: txa('{v1} fansub · toplam {v2} coin', { v1: paying.length, v2: formatNumber(totalCoin) }),
      consequence: txa('Coin fansub kasalarına hemen yüklenir ve her ekibin yönetici ile moderatörlerine bildirim gider. Bir ay yalnız bir kez dağıtılır; geri alınamaz.'),
      confirmLabel: txa('Dağıt'),
      destructive: true,
      run: onRunMonthlyRewards,
    })
  }

  const runConfirm = async () => {
    if (!confirm) return
    setConfirmBusy(true)
    try {
      await confirm.run()
      setConfirm(null)
    } finally {
      setConfirmBusy(false)
    }
  }

  return (
    <section className="overflow-hidden rounded-[20px] border border-border/70 bg-card/60" data-testid="rewards-monthly">
      <header className="flex flex-wrap items-center gap-2 border-b border-border/60 px-5 py-3.5">
        <span className="min-w-0 flex-1">
          <h2 className="text-[15px] font-bold">{txa('Aylık dağıtım')}</h2>
          <span className="block text-[12px] text-muted-foreground">{txa('Seçilen ayın okunmalarına göre sıralama ve görüntülenme ödülleri.')}</span>
        </span>
        <Input type="month" value={selectedMonth} max={maxMonth} onChange={(event) => onSelectedMonthChange(event.target.value)} aria-label={txa('Ay')} className="h-9 w-auto" data-testid="rewards-month" />
        <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={onReloadPreview}><RefreshCw className="size-3.5" />{txa('Yenile')}</Button>
        <Button
          size="sm"
          className="h-9 gap-1.5"
          disabled={runLoading || monthOpen || completed || previewLoading || paying.length === 0}
          onClick={askRun}
          data-testid="rewards-run"
        >
          {runLoading ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}{txa('Ayı dağıt')}
        </Button>
      </header>

      {monthOpen ? (
        <p className="border-b border-border/60 bg-amber-500/[0.07] px-5 py-2.5 text-[12.5px] text-amber-800 dark:text-amber-200" data-testid="rewards-month-open">
          {txa('Bu ay henüz bitmedi; ödül ay bittikten sonra dağıtılabilir. Aşağıdaki liste şu ana kadarki okunmalara göre bir ön izlemedir.')}
        </p>
      ) : completed && run ? (
        <p className="flex items-center gap-2 border-b border-border/60 bg-emerald-500/[0.07] px-5 py-2.5 text-[12.5px] text-emerald-800 dark:text-emerald-200" data-testid="rewards-month-done">
          <CheckCircle2 className="size-4 shrink-0" />
          {txa('{v1} tarihinde dağıtıldı: {v2} fansub, {v3} coin{v4}.', { v1: formatDateTime(run.completedAt), v2: formatNumber(run.totalFansubs), v3: formatNumber(run.totalCoin), v4: run.runByUsername ? ` (@${run.runByUsername})` : '' })}
        </p>
      ) : null}

      {previewLoading ? (
        <div className="flex flex-col gap-2 p-4">{[0, 1, 2].map((index) => <div key={index} className="h-11 animate-pulse rounded-xl bg-muted/40" />)}</div>
      ) : previewError ? (
        <p className="px-5 py-4 text-[13px] text-destructive">{previewError}</p>
      ) : previewRows.length === 0 ? (
        <p className="px-5 py-8 text-center text-[13px] text-muted-foreground">{txa('Bu ay için ödül alacak fansub yok.')}</p>
      ) : (
        <>
          <ul className="max-h-[420px] divide-y divide-border/50 overflow-y-auto" data-testid="rewards-preview-list">
            {previewRows.map((row) => (
              <li key={row.fansubId} className="flex items-center gap-3 px-5 py-2.5">
                <span className="w-8 shrink-0 text-[12px] font-bold tabular-nums text-muted-foreground">{row.rankPosition != null ? `#${row.rankPosition}` : '—'}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold">{row.fansubName}</span>
                  <span className="block truncate text-[11.5px] text-muted-foreground">
                    {txa('{v1} okunma · sıralama {v2} + görüntülenme {v3}', { v1: formatNumber(row.totalViews), v2: formatNumber(row.rankCoinReward), v3: formatNumber(row.tierCoinReward) })}
                    {row.tierLabels.length ? ` (${row.tierLabels.join(', ')})` : ''}
                  </span>
                </span>
                <span className="shrink-0 text-[13px] font-bold tabular-nums text-amber-600 dark:text-amber-300">{formatNumber(row.totalCoinReward)}</span>
              </li>
            ))}
          </ul>
          <footer className="flex items-center justify-between gap-2 border-t border-border/60 px-5 py-2.5 text-[12.5px]">
            <span className="text-muted-foreground">{txa('{v1} fansub ödül alıyor', { v1: paying.length })}</span>
            <span className="flex items-center gap-1.5 font-bold tabular-nums text-amber-600 dark:text-amber-300"><Coins className="size-4" />{formatNumber(totalCoin)} coin</span>
          </footer>
        </>
      )}

      <AdminConfirmDialog request={confirm} busy={confirmBusy} onCancel={() => setConfirm(null)} onConfirm={() => { void runConfirm() }} />
    </section>
  )
}
