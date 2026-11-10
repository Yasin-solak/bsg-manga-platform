import { useEffect, useState, type ReactNode } from 'react'
import { Copy, Power, PowerOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { listAdminCoinActivationsPage, type AdminRedeemCodeItem, type AdminRedeemUsageEvent } from '@/services/redeemCodeService'
import { formatCodeTarget, formatDateTime, resolveCodeStatus, resolveUsageTarget, STATUS_TONE, toErrorMessage } from './coinCodeManagementUtils'
import { intlLocale, txa } from '@/i18n/activeLocale'

function Stat({ label, value, tone }: { label: string, value: ReactNode, tone?: 'amber' }) {
  return (
    <div className="min-w-0 px-3 py-2.5">
      <dt className="text-[11px] font-semibold text-muted-foreground">{label}</dt>
      <dd className={cn('mt-0.5 truncate text-[14px] font-bold tabular-nums', tone === 'amber' && 'text-amber-600 dark:text-amber-300')}>{value}</dd>
    </div>
  )
}

/**
 * Selected code (the desk's right panel / drawer on narrow screens): status, value,
 * usage, expiry, batch info and this code's redemptions. Deactivating
 * / activating goes through a dialog asking for a reason (audit record).
 */
export function CoinCodeDetailPane({ code, layout, onCopy, onSetActive }: {
  code: AdminRedeemCodeItem
  layout: 'desk' | 'sheet'
  onCopy: () => void
  onSetActive: (active: boolean) => void
}) {
  const status = resolveCodeStatus(code)
  const [usage, setUsage] = useState<{ codeId: string, items: AdminRedeemUsageEvent[], total: number, error: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    if (code.usedCount === 0) {
      setUsage({ codeId: code.id, items: [], total: 0, error: '' })
      return undefined
    }
    listAdminCoinActivationsPage({ search: code.code, limit: 20 })
      .then((page) => {
        if (cancelled) return
        const items = page.items.filter((item) => item.codeId === code.id)
        setUsage({ codeId: code.id, items, total: Math.max(items.length, code.usedCount), error: '' })
      })
      .catch((error: unknown) => { if (!cancelled) setUsage({ codeId: code.id, items: [], total: 0, error: toErrorMessage(error, txa('Kullanımlar yüklenemedi.')) }) })
    return () => { cancelled = true }
  }, [code.code, code.id, code.usedCount])

  const current = usage?.codeId === code.id ? usage : null
  const size = layout === 'desk' ? 'sm' : 'default'
  const actions = (
    <span className="flex shrink-0 flex-wrap items-center gap-1.5">
      <Button size={size} variant="outline" className="gap-1.5" onClick={onCopy} data-testid="coin-code-copy"><Copy className="size-4" />{txa('Kopyala')}</Button>
      {code.isActive
        ? <Button size={size} variant="ghost" className="gap-1.5 text-rose-600 dark:text-rose-300" onClick={() => onSetActive(false)} data-testid="coin-code-deactivate"><PowerOff className="size-4" />{txa('Pasife al')}</Button>
        : <Button size={size} variant="ghost" className="gap-1.5" onClick={() => onSetActive(true)} data-testid="coin-code-activate"><Power className="size-4" />{txa('Etkinleştir')}</Button>}
    </span>
  )
  const usedPct = code.maxUses > 0 ? Math.min(100, Math.round((code.usedCount / code.maxUses) * 100)) : 0

  return (
    <section
      className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[20px] border border-border/70 bg-card/60 max-xl:h-full max-xl:rounded-none max-xl:border-0 xl:max-h-full"
      aria-label={txa('Kod ayrıntısı')}
      data-testid="coin-code-detail"
    >
      <header className={cn('flex items-start gap-3 border-b border-border/60 px-5 py-3.5', layout === 'sheet' && 'pr-12')}>
        <span className="min-w-0 flex-1">
          <span className={cn('rounded-md px-1.5 py-px text-[10.5px] font-bold', STATUS_TONE[status.id])}>{status.label}</span>
          <h2 className="mt-1 break-all font-mono text-[17px] font-bold tracking-tight">{code.code}</h2>
          <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">{txa('{v1} · {v2} üretildi', { v1: formatCodeTarget(code.targetType), v2: formatDateTime(code.createdAt) })}</span>
        </span>
        {layout === 'desk' ? actions : null}
      </header>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
        {layout === 'sheet' ? actions : null}
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border/60 bg-border/50 sm:grid-cols-3 [&>*]:bg-card">
          <Stat label={txa('Değer')} value={`${code.value.toLocaleString(intlLocale())} coin`} tone="amber" />
          <Stat label={txa('Kullanım')} value={`${code.usedCount.toLocaleString(intlLocale())} / ${code.maxUses.toLocaleString(intlLocale())}`} />
          <Stat label={txa('Dağıtılan')} value={`${(code.value * code.usedCount).toLocaleString(intlLocale())} coin`} />
          <Stat label={txa('Kalan hak')} value={code.remainingUses.toLocaleString(intlLocale())} />
          <Stat label={txa('Açık risk')} value={`${(code.isActive && !code.isExpired ? code.value * code.remainingUses : 0).toLocaleString(intlLocale())} coin`} />
          <Stat label={txa('Son kullanma')} value={formatDateTime(code.expiresAt)} />
        </dl>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-label={txa('Kullanım %{v1}', { v1: usedPct })}>
          <div className="h-full rounded-full bg-primary" style={{ width: `${usedPct}%` }} />
        </div>

        {code.seriesLabel || code.distributionChannel || code.notes ? (
          <section className="space-y-1 text-[13px]">
            <h3 className="mb-1.5 text-[11.5px] font-bold uppercase tracking-wider text-muted-foreground">{txa('Dağıtım')}</h3>
            {code.seriesLabel ? <p><span className="text-muted-foreground">{txa('Seri:')}</span> {code.seriesLabel}</p> : null}
            {code.distributionChannel ? <p><span className="text-muted-foreground">{txa('Kanal:')}</span> {code.distributionChannel}</p> : null}
            {code.notes ? <p className="whitespace-pre-wrap break-words text-muted-foreground [overflow-wrap:anywhere]">{code.notes}</p> : null}
          </section>
        ) : null}

        <section data-testid="coin-code-usages">
          <h3 className="mb-1.5 text-[11.5px] font-bold uppercase tracking-wider text-muted-foreground">{txa('Kullananlar')}</h3>
          {!current ? (
            <div className="h-14 animate-pulse rounded-xl bg-muted/40" />
          ) : current.error ? (
            <p className="rounded-xl bg-muted/50 px-3.5 py-2.5 text-[12.5px] text-muted-foreground">{current.error}</p>
          ) : current.items.length === 0 ? (
            <p className="rounded-xl bg-muted/50 px-3.5 py-2.5 text-[12.5px] text-muted-foreground">{txa('Henüz kimse kullanmadı.')}</p>
          ) : (
            <ul className="divide-y divide-border/50 rounded-xl border border-border/60 text-[12.5px]">
              {current.items.map((item) => (
                <li key={item.id} className="flex items-center gap-2 px-3 py-2">
                  {item.userAvatarUrl ? <img src={item.userAvatarUrl} alt="" loading="lazy" className="size-6 shrink-0 rounded-full border border-border bg-muted object-cover" /> : <span className="size-6 shrink-0 rounded-full bg-muted" />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">@{item.username}</span>
                    <span className="block truncate text-[11.5px] text-muted-foreground">{resolveUsageTarget(item)}</span>
                  </span>
                  <span className="shrink-0 text-[11.5px] tabular-nums text-muted-foreground">{formatDateTime(item.redeemedAt)}</span>
                </li>
              ))}
            </ul>
          )}
          {current && current.total > current.items.length ? <p className="mt-1.5 text-[11.5px] text-muted-foreground">{txa('Son {v1} kullanım gösteriliyor; tümü Kullanımlar sekmesinde.', { v1: current.items.length })}</p> : null}
        </section>
      </div>
    </section>
  )
}
