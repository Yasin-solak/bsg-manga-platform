import { Warning, WarningCircle } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { shopAdmin } from '@/services/shopAdminService'
import { useShopQuery } from '@/pages/shop/useShopQuery'
import { AdminPanel, EmptyNote, StateChip } from './ShopAdminKit'
import { economyLabel, formatDateTime, formatNumber, formatShortDate, ISSUE_LABEL, type ShopAdminTab } from './shopAdminFormat'
import { txa } from '@/i18n/activeLocale'

/* Genel bakis: KPI, sorunlar (duzeltme kisayoluyla), yaklasan yayinlar, gunluk coin, son siparisler. */

const UPCOMING_KIND: Record<string, string> = { get campaign() { return txa('Kampanya') }, get season() { return txa('Sezon') }, get discount() { return txa('İndirim') }, get product() { return txa('Ürün') } }

export function ShopAdminOverview({ onNavigate, onOpenProduct }: { onNavigate: (tab: ShopAdminTab) => void, onOpenProduct: (id: string) => void }) {
  const { data, loading, error } = useShopQuery('shop-admin-overview', shopAdmin.overview)
  if (loading && !data) return <div className='h-96 animate-pulse rounded-[18px] bg-muted/40' />
  if (error || !data) return <p className='text-[13px] text-rose-600 dark:text-rose-300'>{error}</p>

  const { kpis } = data
  const maxCoins = Math.max(1, ...data.dailyCoins.map((day) => day.coins))
  const mixTotal = data.spendMix.reduce((sum, entry) => sum + entry.coins, 0)
  const tiles = [
    { label: txa('Satışta'), value: formatNumber(kpis.live), sub: txa('{v1} planlandı · {v2} taslak', { v1: formatNumber(kpis.upcoming), v2: formatNumber(kpis.drafts) }) },
    { label: txa('Son 7 gün sipariş'), value: formatNumber(kpis.orders7d), sub: txa('{v1} farklı alıcı', { v1: formatNumber(kpis.buyers7d) }) },
    { label: txa('Son 7 gün coin'), value: formatNumber(kpis.coins7d), sub: txa('tüm zamanlar {v1}', { v1: formatNumber(kpis.coinsAllTime) }) },
    { label: txa('Aktif Premium'), value: formatNumber(kpis.activePremium), sub: txa('{v1} ürün arşivde', { v1: formatNumber(kpis.archived) }) },
  ]
  const warnings = [
    ...(data.warnings.noHero ? [{ text: txa('Ana vitrinde yayında kampanya yok: vitrin günün fırsatını gösteriyor.'), action: txa('Kampanya ekle'), tab: 'merch' as const }] : []),
    ...data.warnings.heroConflicts.map((conflict) => ({ text: txa('Ana vitrin çakışması: "{v1}" ve "{v2}" aynı tarihlerde.', { v1: conflict.a, v2: conflict.b }), action: txa('Takvimi aç'), tab: 'schedule' as const })),
    ...(data.warnings.bandWarnings > 0 ? [{ text: txa('{v1} ürünün fiyatı nadirlik bandının dışında.', { v1: data.warnings.bandWarnings }), action: txa('Bantlara bak'), tab: 'economy' as const }] : []),
  ]

  return (
    <div className='flex flex-col gap-4' data-testid='shop-admin-overview'>
      <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-4'>
        {tiles.map((tile) => (
          <div key={tile.label} className='flex flex-col gap-1.5 rounded-[18px] border border-border/70 bg-card p-4'>
            <span className='text-[11.5px] font-extrabold uppercase tracking-[0.06em] text-muted-foreground'>{tile.label}</span>
            <span className='text-[28px] font-black leading-none tabular-nums'>{tile.value}</span>
            <span className='text-[12px] text-muted-foreground'>{tile.sub}</span>
          </div>
        ))}
      </div>

      <div className='grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]'>
        <AdminPanel title={txa('Dikkat gerekenler')} meta={`${data.productIssues.length + warnings.length} madde`}>
          {data.productIssues.length + warnings.length === 0 ? (
            <EmptyNote>{txa('Her şey yolunda: sorunlu ürün ya da çakışma yok.')}</EmptyNote>
          ) : (
            <ul className='flex flex-col gap-2'>
              {warnings.map((warning) => (
                <li key={warning.text} className='flex items-center gap-3 rounded-xl bg-muted/40 px-3.5 py-3'>
                  <Warning weight='fill' size={16} className='flex-none text-amber-600 dark:text-amber-300' />
                  <span className='min-w-0 flex-1 text-[13px]'>{warning.text}</span>
                  <button type='button' onClick={() => onNavigate(warning.tab)} className='h-8 flex-none rounded-lg bg-accent px-3 text-[12px] font-bold'>{warning.action}</button>
                </li>
              ))}
              {data.productIssues.map((item) => (
                <li key={item.id} className='flex items-center gap-3 rounded-xl bg-muted/40 px-3.5 py-3'>
                  <WarningCircle weight='fill' size={16} className='flex-none text-rose-400' />
                  <span className='min-w-0 flex-1'>
                    <span className='block truncate text-[13px] font-bold'>{item.title}</span>
                    <span className='block truncate text-[12px] text-muted-foreground'>{item.issues.map((issue) => ISSUE_LABEL[issue.code] ?? issue.code).join(' · ')}</span>
                  </span>
                  <StateChip state={item.state} />
                  <button type='button' onClick={() => onOpenProduct(item.id)} className='h-8 flex-none rounded-lg bg-accent px-3 text-[12px] font-bold'>{txa('Düzelt')}</button>
                </li>
              ))}
            </ul>
          )}
        </AdminPanel>

        <AdminPanel title={txa('Mağaza coin harcaması')} meta={txa('Son 14 gün, günlük')}>
          <div className='flex h-40 items-end gap-1.5'>
            {data.dailyCoins.map((day) => (
              <div key={day.day} className='flex h-full flex-1 flex-col items-center justify-end gap-1' title={txa('{v1}: {v2} Coin, {v3} sipariş', { v1: formatShortDate(day.day), v2: formatNumber(day.coins), v3: day.orders })}>
                <span className={cn('w-full rounded-t-md', day.coins > 0 ? 'bg-primary/70' : 'bg-foreground/10')} style={{ height: `${Math.max(3, (day.coins / maxCoins) * 100)}%` }} />
              </div>
            ))}
          </div>
          <div className='mt-1.5 flex justify-between text-[10.5px] text-muted-foreground'>
            <span>{formatShortDate(data.dailyCoins[0]?.day)}</span><span>{txa('bugün')}</span>
          </div>
          {data.spendMix.length > 0 && (
            <ul className='mt-4 flex flex-col gap-2 border-t border-border/60 pt-3'>
              {data.spendMix.map((entry) => (
                <li key={entry.source} className='flex items-center gap-3 text-[12.5px]'>
                  <span className='min-w-0 flex-1 truncate text-muted-foreground'>{economyLabel(entry.source)}</span>
                  <span className='w-24 flex-none'><span className='block h-1.5 rounded-full bg-primary/70' style={{ width: `${mixTotal ? (entry.coins / mixTotal) * 100 : 0}%` }} /></span>
                  <b className='w-16 text-right tabular-nums'>{formatNumber(entry.coins)}</b>
                </li>
              ))}
            </ul>
          )}
        </AdminPanel>
      </div>

      <div className='grid gap-4 xl:grid-cols-2'>
        <AdminPanel title={txa('Önümüzdeki 14 gün')} action={<button type='button' onClick={() => onNavigate('schedule')} className='text-[12px] font-bold text-primary'>{txa('Takvim')}</button>}>
          {data.upcoming.length ? (
            <ul className='flex flex-col divide-y divide-border/60'>
              {data.upcoming.map((item) => (
                <li key={`${item.kind}-${item.id}`} className='flex items-center gap-3 py-2.5 text-[13px]'>
                  <span className='w-24 flex-none text-[12px] font-bold text-muted-foreground'>{formatDateTime(item.at)}</span>
                  <span className='min-w-0 flex-1 truncate font-semibold'>{item.title}</span>
                  <span className='rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold text-muted-foreground'>{UPCOMING_KIND[item.kind]}</span>
                </li>
              ))}
            </ul>
          ) : <EmptyNote>{txa('Planlanmış kampanya, sezon ya da indirim yok.')}</EmptyNote>}
        </AdminPanel>
        <AdminPanel title={txa('Son siparişler')} action={<button type='button' onClick={() => onNavigate('orders')} className='text-[12px] font-bold text-primary'>{txa('Tümü')}</button>}>
          {data.recentOrders.length ? (
            <ul className='flex flex-col divide-y divide-border/60'>
              {data.recentOrders.map((order) => (
                <li key={order.id} className='flex items-center gap-3 py-2.5 text-[13px]'>
                  {order.buyerAvatar ? <img src={order.buyerAvatar} alt='' className='size-7 rounded-full object-cover' /> : <span className='size-7 rounded-full bg-muted' />}
                  <span className='min-w-0 flex-1 truncate'>
                    <b>{order.buyer}</b> <span className='text-muted-foreground'>{order.isGift ? `→ ${order.recipient} · ` : ''}{order.title}</span>
                  </span>
                  <b className='tabular-nums text-amber-600 dark:text-amber-300'>{formatNumber(order.paid)}</b>
                  <StateChip state={order.status} />
                </li>
              ))}
            </ul>
          ) : <EmptyNote>{txa('Yeni mağazada henüz sipariş yok.')}</EmptyNote>}
        </AdminPanel>
      </div>
    </div>
  )
}
