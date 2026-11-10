import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { shopAdmin, type ShopAdminMerch } from '@/services/shopAdminService'
import { toast } from '@/services/toastService'
import { useShopQuery } from '@/pages/shop/useShopQuery'
import { AdminPanel } from './ShopAdminKit'
import { formatShortDate, INPUT } from './shopAdminFormat'
import { txa } from '@/i18n/activeLocale'

/*
 * Showcase calendar: an 8-week timeline (main showcase, collection shelf, coming soon, season,
 * discount) and the next 14 days' "Deal of the day" plan (automatic or manual).
 */

const DAY = 86_400_000
const SPAN_DAYS = 56
const TONES = {
  hero: 'bg-amber-400/20 border-amber-400/50 text-amber-100',
  row: 'bg-primary/15 border-primary/40 text-primary-foreground/90 dark:text-teal-100',
  soon: 'bg-rose-400/15 border-rose-400/40 text-rose-100',
  season: 'bg-violet-400/15 border-violet-400/40 text-violet-100',
  discount: 'bg-sky-400/15 border-sky-400/40 text-sky-100',
} as const

type Bar = { key: string, label: string, start: number, end: number, tone: keyof typeof TONES, draft: boolean }

// Ayni seritte cakisan cubuklar alt satirlara dizilir.
function packRows(bars: Bar[]) {
  const rows: number[] = []
  return [...bars].sort((a, b) => a.start - b.start).map((bar) => {
    let row = rows.findIndex((endAt) => endAt <= bar.start)
    if (row === -1) { row = rows.length; rows.push(bar.end) } else rows[row] = bar.end
    return { bar, row }
  })
}

export function ShopAdminSchedule({ merch, onChanged }: { merch: ShopAdminMerch, onChanged: () => void }) {
  const { data: products } = useShopQuery('shop-admin-products-picker', () => shopAdmin.products('all'))
  const [savingDay, setSavingDay] = useState<string | null>(null)
  const origin = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return today.getTime() - 7 * DAY
  }, [])
  const end = origin + SPAN_DAYS * DAY
  const pct = (time: number) => `${Math.min(100, Math.max(0, ((time - origin) / (end - origin)) * 100))}%`
  const width = (a: number, b: number) => `${Math.max(0.8, ((Math.min(b, end) - Math.max(a, origin)) / (end - origin)) * 100)}%`
  const visible = (bar: Bar) => bar.end > origin && bar.start < end

  const campaigns = merch.campaigns.filter((campaign) => campaign.status !== 'archived')
  const lanes: Array<{ name: string, hint: string, bars: Bar[] }> = [
    { name: txa('Ana vitrin'), hint: txa('tek yuva'), bars: campaigns.filter((c) => c.placements.includes('hero')).map((c) => ({ key: c.id, label: c.name, start: +new Date(c.startsAt), end: +new Date(c.endsAt), tone: 'hero', draft: c.status === 'draft' })) },
    { name: txa('Koleksiyon rafı'), hint: txa('çoklu'), bars: campaigns.filter((c) => c.placements.includes('collection_row')).map((c) => ({ key: c.id, label: c.name, start: +new Date(c.startsAt), end: +new Date(c.endsAt), tone: 'row', draft: c.status === 'draft' })) },
    { name: txa('Yakında'), hint: txa('14 gün önce'), bars: campaigns.filter((c) => c.placements.includes('coming_soon') || c.placements.includes('hero')).map((c) => ({ key: c.id, label: c.name, start: +new Date(c.startsAt) - 14 * DAY, end: +new Date(c.startsAt), tone: 'soon', draft: c.status === 'draft' })) },
    { name: txa('Sezonlar'), hint: txa('sezon penceresi'), bars: merch.seasons.map((s) => ({ key: s.id, label: s.name, start: +new Date(s.startsAt), end: +new Date(s.endsAt), tone: 'season', draft: s.status === 'draft' })) },
    { name: txa('İndirimler'), hint: txa('kural'), bars: merch.discounts.filter((d) => d.status !== 'archived').map((d) => ({ key: d.id, label: d.name, start: d.startsAt ? +new Date(d.startsAt) : origin, end: d.endsAt ? +new Date(d.endsAt) : end, tone: 'discount', draft: d.status === 'draft' })) },
  ]
  const weeks = Array.from({ length: SPAN_DAYS / 7 }, (_, index) => origin + index * 7 * DAY)
  const now = Date.now()

  const setDeal = async (day: string, productId: string | null, percent: number | null) => {
    setSavingDay(day)
    try {
      await shopAdmin.setDailyDeal(day, productId, percent)
      onChanged()
    } catch (reason) {
      toast.error(reason instanceof Error ? txa(reason.message) : txa('Kaydedilemedi.'))
    } finally {
      setSavingDay(null)
    }
  }

  const eligible = (products ?? []).filter((product) => product.kind === 'cosmetic' && product.status === 'published')

  return (
    <div className='flex flex-col gap-4' data-testid='shop-admin-schedule'>
      <AdminPanel title={txa('Vitrin takvimi')} meta={txa('Süresi dolan kampanyanın yerine sıradaki kendiliğinden geçer. Çizgili çubuklar taslak.')}>
        <div className='overflow-x-auto'>
          <div className='min-w-[860px]'>
            <div className='grid grid-cols-[150px_minmax(0,1fr)]'>
              <span />
              <div className='relative h-7'>
                {weeks.map((week) => (
                  <span key={week} className='absolute top-1 text-[11px] font-bold text-muted-foreground' style={{ left: pct(week) }}>{formatShortDate(new Date(week).toISOString())}</span>
                ))}
              </div>
            </div>
            {lanes.map((lane) => {
              const packed = packRows(lane.bars.filter(visible))
              const rowCount = Math.max(1, ...packed.map((entry) => entry.row + 1))
              return (
                <div key={lane.name} className='grid grid-cols-[150px_minmax(0,1fr)] items-center border-t border-border/60'>
                  <span className='py-3'>
                    <span className='block text-[13px] font-bold'>{lane.name}</span>
                    <span className='block text-[11px] text-muted-foreground'>{lane.hint}</span>
                  </span>
                  <div className='relative' style={{ height: 14 + rowCount * 42 }}>
                    <span aria-hidden className='absolute bottom-0 top-0 z-10 w-0.5 bg-rose-500' style={{ left: pct(now) }} />
                    {packed.map(({ bar, row }) => (
                      <span
                        key={`${lane.name}-${bar.key}`}
                        title={`${bar.label}: ${formatShortDate(new Date(bar.start).toISOString())} – ${formatShortDate(new Date(bar.end).toISOString())}`}
                        className={cn('absolute flex h-9 items-center overflow-hidden whitespace-nowrap rounded-lg border px-2.5 text-[12px] font-bold', TONES[bar.tone], bar.draft && 'bg-[repeating-linear-gradient(135deg,transparent_0_6px,hsl(var(--foreground)/0.08)_6px_12px)] opacity-70')}
                        style={{ left: pct(bar.start), width: width(bar.start, bar.end), top: 7 + row * 42 }}
                      >
                        {bar.label}
                      </span>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </AdminPanel>

      <AdminPanel title={txa('Günün fırsatı')} meta={merch.settings.daily_deal_enabled ? txa('Her gün 00:00\'da, varsayılan %{v1} indirim. Boş günler otomatik seçilir.', { v1: merch.settings.daily_deal_percent }) : txa('Günün fırsatı kapalı (Ekonomi > Ayarlar).')}>
        <div className='grid gap-2 md:grid-cols-2'>
          {merch.dailyDeals.map((deal) => (
            <div key={deal.day} className='flex flex-wrap items-center gap-2 rounded-xl bg-muted/30 px-3 py-2 text-[13px]'>
              <span className='w-20 flex-none font-bold'>{formatShortDate(deal.day)}</span>
              <select
                value={deal.override ? deal.productId ?? '' : ''}
                disabled={savingDay === deal.day}
                onChange={(event) => { void setDeal(deal.day, event.target.value || null, deal.override ? deal.percent : null) }}
                className={cn(INPUT, 'h-9 min-w-0 flex-1 text-[12.5px]')}
                aria-label={txa('{v1} günün fırsatı', { v1: formatShortDate(deal.day) })}
              >
                <option value=''>{deal.title ? `Otomatik: ${deal.title}` : txa('Otomatik')}</option>
                {eligible.map((product) => <option key={product.id} value={product.id}>{product.title}</option>)}
              </select>
              {deal.override && (
                <input
                  type='number'
                  min={5}
                  max={80}
                  defaultValue={deal.percent ?? merch.settings.daily_deal_percent}
                  onBlur={(event) => { void setDeal(deal.day, deal.productId, Number(event.target.value) || null) }}
                  className={cn(INPUT, 'h-9 w-20 text-[12.5px]')}
                  aria-label={txa('İndirim yüzdesi')}
                />
              )}
            </div>
          ))}
        </div>
      </AdminPanel>
    </div>
  )
}
