import { useEffect, useState } from 'react'
import { MagnifyingGlass, SpinnerGap } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { shopAdmin, type ShopAdminMerch, type ShopAdminSettings, type ShopAdminWallet } from '@/services/shopAdminService'
import { SHOP_RARITIES, type ShopRarity } from '@/services/shopService'
import { toast } from '@/services/toastService'
import { RARITY_META } from '@/pages/shop/shopFormat'
import { useShopQuery } from '@/pages/shop/useShopQuery'
import { AdminPanel, EmptyNote, Field, Segments } from './ShopAdminKit'
import { BTN_PRIMARY, economyLabel, formatDateTime, formatNumber, INPUT } from './shopAdminFormat'
import { txa } from '@/i18n/activeLocale'

/* Coin ekonomisi: giren / cikan coin, dolasim, fiyat bantlari, magaza ayarlari, cuzdan. */

function Flow({ title, rows, total, tone }: { title: string, rows: Array<{ key: string, amount: number }>, total: number, tone: string }) {
  const max = Math.max(1, ...rows.map((row) => row.amount))
  return (
    <AdminPanel title={title} meta={txa('Toplam {v1} Coin', { v1: formatNumber(total) })}>
      {rows.length === 0 ? <EmptyNote>{txa('Bu dönemde hareket yok.')}</EmptyNote> : (
        <ul className='flex flex-col gap-3'>
          {rows.map((row) => (
            <li key={row.key} className='flex flex-col gap-1.5'>
              <span className='flex justify-between text-[13px]'><span>{economyLabel(row.key)}</span><b className='tabular-nums'>{formatNumber(row.amount)}</b></span>
              <span className='h-2 overflow-hidden rounded-full bg-foreground/[0.06]'><span className={cn('block h-full rounded-full', tone)} style={{ width: `${(row.amount / max) * 100}%` }} /></span>
            </li>
          ))}
        </ul>
      )}
    </AdminPanel>
  )
}

function SettingsPanel({ settings, onSaved }: { settings: ShopAdminSettings, onSaved: () => void }) {
  const [form, setForm] = useState(settings)
  const [saving, setSaving] = useState(false)
  useEffect(() => setForm(settings), [settings])
  const setBand = (rarity: ShopRarity, index: 0 | 1, value: number) => setForm((current) => {
    const bands = { ...current.rarity_bands }
    const band: [number, number] = [...bands[rarity]] as [number, number]
    band[index] = value
    bands[rarity] = band
    return { ...current, rarity_bands: bands }
  })
  const save = async () => {
    setSaving(true)
    try { await shopAdmin.saveSettings(form); toast.success(txa('Mağaza ayarları kaydedildi.')); onSaved() } catch (reason) { toast.error(reason instanceof Error ? txa(reason.message) : txa('Kaydedilemedi.')) } finally { setSaving(false) }
  }
  return (
    <AdminPanel title={txa('Fiyat bantları ve mağaza ayarları')} action={<button type='button' disabled={saving} onClick={() => { void save() }} className={BTN_PRIMARY}>{saving && <SpinnerGap size={14} className='animate-spin' />}{txa('Kaydet')}</button>}>
      <div className='flex flex-col gap-4'>
        <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-4'>
          {[...SHOP_RARITIES].reverse().map((rarity) => (
            <div key={rarity} className={cn('flex flex-col gap-2 rounded-2xl border bg-muted/20 p-3', RARITY_META[rarity].ring)}>
              <span className={cn('text-[11px] font-extrabold uppercase tracking-[0.08em]', RARITY_META[rarity].ink)}>{RARITY_META[rarity].label}</span>
              <span className='flex items-center gap-2'>
                <input type='number' min={0} value={form.rarity_bands[rarity][0]} onChange={(event) => setBand(rarity, 0, Number(event.target.value))} className={cn(INPUT, 'h-9')} aria-label={txa('{v1} alt sınır', { v1: RARITY_META[rarity].label })} />
                <span className='text-muted-foreground'>–</span>
                <input type='number' min={0} value={form.rarity_bands[rarity][1]} onChange={(event) => setBand(rarity, 1, Number(event.target.value))} className={cn(INPUT, 'h-9')} aria-label={txa('{v1} üst sınır', { v1: RARITY_META[rarity].label })} />
              </span>
            </div>
          ))}
        </div>
        <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-4'>
          <Field label={txa('Satın alma')}>
            <Segments value={form.purchases_enabled ? 'on' : 'off'} onChange={(value) => setForm((current) => ({ ...current, purchases_enabled: value === 'on' }))} options={[{ value: 'on', label: txa('Açık') }, { value: 'off', label: txa('Kapalı'), tone: 'text-rose-600 dark:text-rose-300' }]} />
          </Field>
          <Field label={txa('Günün fırsatı')}>
            <Segments value={form.daily_deal_enabled ? 'on' : 'off'} onChange={(value) => setForm((current) => ({ ...current, daily_deal_enabled: value === 'on' }))} options={[{ value: 'on', label: txa('Açık') }, { value: 'off', label: txa('Kapalı') }]} />
          </Field>
          <Field label={txa('Fırsat indirimi (%)')}><input type='number' min={5} max={80} value={form.daily_deal_percent} onChange={(event) => setForm((current) => ({ ...current, daily_deal_percent: Number(event.target.value) }))} className={INPUT} /></Field>
          <Field label={txa('Fırsat için en az nadirlik')}>
            <select value={form.daily_deal_min_rarity} onChange={(event) => setForm((current) => ({ ...current, daily_deal_min_rarity: event.target.value as ShopRarity }))} className={INPUT}>
              {SHOP_RARITIES.map((rarity) => <option key={rarity} value={rarity}>{RARITY_META[rarity].label}</option>)}
            </select>
          </Field>
        </div>
      </div>
    </AdminPanel>
  )
}

function WalletPanel() {
  const [query, setQuery] = useState('')
  const [wallet, setWallet] = useState<ShopAdminWallet | null>(null)
  const [loading, setLoading] = useState(false)
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')

  const lookup = async (value: string) => {
    if (!value.trim()) return
    setLoading(true)
    try { setWallet(await shopAdmin.wallet(value.trim())) } catch (error) { toast.error(error instanceof Error ? txa(error.message) : txa('Aranamadı.')) } finally { setLoading(false) }
  }
  const adjust = async () => {
    if (!wallet?.user) return
    const value = Number(amount)
    if (!value || !reason.trim()) { toast.error(txa('Tutar ve neden gerekli.')); return }
    try {
      const balance = await shopAdmin.adjustBalance(wallet.user.id, value, reason.trim())
      toast.success(txa('Yeni bakiye {v1} Coin.', { v1: formatNumber(balance) }))
      setAmount('')
      setReason('')
      await lookup(wallet.user.username)
    } catch (error) { toast.error(error instanceof Error ? txa(error.message) : txa('Düzeltilemedi.')) }
  }

  return (
    <AdminPanel title={txa('Cüzdan')} meta={txa('Kullanıcının coin geçmişi, bakiye düzeltme')}>
      <form onSubmit={(event) => { event.preventDefault(); void lookup(query) }} className='flex gap-2'>
        <label className='relative flex flex-1 items-center'>
          <MagnifyingGlass size={14} className='pointer-events-none absolute left-3 text-muted-foreground' />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={txa('Kullanıcı adı')} className={cn(INPUT, 'pl-8')} />
        </label>
        <button type='submit' className={BTN_PRIMARY}>{loading && <SpinnerGap size={14} className='animate-spin' />}{txa('Ara')}</button>
      </form>
      {wallet && !wallet.user && wallet.matches.length > 0 && (
        <div className='mt-3 flex flex-wrap gap-2'>
          {wallet.matches.map((match) => (
            <button key={match.id} type='button' onClick={() => { setQuery(match.username); void lookup(match.username) }} className='flex items-center gap-2 rounded-full bg-muted px-3 py-1.5 text-[12.5px] font-bold'>
              {match.avatar && <img src={match.avatar} alt='' className='size-5 rounded-full object-cover' />}@{match.username}
            </button>
          ))}
        </div>
      )}
      {wallet?.user && (
        <div className='mt-4 flex flex-col gap-4'>
          <div className='flex flex-wrap items-center gap-3 rounded-2xl bg-muted/30 p-3'>
            {wallet.user.avatar && <img src={wallet.user.avatar} alt='' className='size-10 rounded-full object-cover' />}
            <span className='min-w-0 flex-1'>
              <span className='block font-extrabold'>@{wallet.user.username}</span>
              <span className='block text-[12px] text-muted-foreground'>{txa('{v1} sipariş · {v2} iade', { v1: wallet.user.orders, v2: wallet.user.refunds })}{wallet.user.premiumExpiresAt ? txa(' · Premium {v1}\'e kadar', { v1: formatDateTime(wallet.user.premiumExpiresAt) }) : ''}</span>
            </span>
            <span className='text-xl font-black tabular-nums text-amber-600 dark:text-amber-300'>{formatNumber(wallet.user.balance)}</span>
          </div>
          <div className='grid gap-2 sm:grid-cols-[120px_minmax(0,1fr)_auto]'>
            <input type='number' value={amount} onChange={(event) => setAmount(event.target.value)} placeholder='+500 / -200' className={INPUT} aria-label={txa('Tutar')} />
            <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder={txa('Neden (kayda geçer)')} className={INPUT} aria-label={txa('Neden')} />
            <button type='button' onClick={() => { void adjust() }} className={BTN_PRIMARY}>{txa('Bakiye düzelt')}</button>
          </div>
          <table className='w-full text-[12.5px]'>
            <tbody>
              {wallet.user.history.map((entry, index) => (
                <tr key={`${entry.at}-${index}`} className='border-t border-border/60'>
                  <td className='py-2 text-muted-foreground'>{formatDateTime(entry.at)}</td>
                  <td className='py-2'>{economyLabel(entry.kind)}{entry.note ? <span className='text-muted-foreground'> · {entry.note}</span> : null}</td>
                  <td className={cn('py-2 text-right font-extrabold tabular-nums', entry.amount >= 0 ? 'text-primary' : 'text-rose-600 dark:text-rose-300')}>{entry.amount >= 0 ? '+' : ''}{formatNumber(entry.amount)}</td>
                  <td className='py-2 text-right tabular-nums text-muted-foreground'>{entry.balanceAfter !== null ? formatNumber(entry.balanceAfter) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminPanel>
  )
}

export function ShopAdminEconomy({ merch, onChanged }: { merch: ShopAdminMerch, onChanged: () => void }) {
  const [days, setDays] = useState<'7' | '30' | '90'>('30')
  const { data, loading } = useShopQuery(`shop-admin-economy-${days}`, () => shopAdmin.economy(Number(days)))

  return (
    <div className='flex flex-col gap-4' data-testid='shop-admin-economy'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <p className='text-[13px] text-muted-foreground'>{txa('Coin nereden giriyor, nereye çıkıyor; fiyatlar kazanç hızına göre dengede mi.')}</p>
        <Segments value={days} onChange={setDays} options={[{ value: '7', label: txa('7 gün') }, { value: '30', label: txa('30 gün') }, { value: '90', label: txa('90 gün') }]} />
      </div>
      {loading && !data ? <div className='h-64 animate-pulse rounded-[18px] bg-muted/40' /> : data && (
        <>
          <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-4'>
            {[
              { label: txa('Dolaşımdaki coin'), value: formatNumber(data.circulation), sub: txa('{v1} kullanıcıda', { v1: formatNumber(data.holders) }) },
              { label: txa('Ortanca cüzdan'), value: formatNumber(data.median), sub: txa('bakiyesi olanlar arasında') },
              { label: txa('Giren / çıkan ({v1} gün)', { v1: data.days }), value: `${formatNumber(data.totalIn)} / ${formatNumber(data.totalOut)}`, sub: data.totalIn > data.totalOut ? txa('Giren fazla: enflasyon riski') : txa('Çıkan fazla: bakiye eriyor') },
              { label: txa('Kazanç hızı'), value: txa('{v1}/gün', { v1: formatNumber(data.dailyEarnPerEarner) }), sub: txa('{v1} aktif kazanan', { v1: formatNumber(data.earners) }) },
            ].map((tile) => (
              <div key={tile.label} className='flex flex-col gap-1.5 rounded-[18px] border border-border/70 bg-card p-4'>
                <span className='text-[11.5px] font-extrabold uppercase tracking-[0.06em] text-muted-foreground'>{tile.label}</span>
                <span className='text-[24px] font-black leading-none tabular-nums'>{tile.value}</span>
                <span className='text-[12px] text-muted-foreground'>{tile.sub}</span>
              </div>
            ))}
          </div>
          <div className='grid gap-4 xl:grid-cols-2'>
            <Flow title={txa('Giren coin')} rows={data.sources.filter((row) => row.amount > 0)} total={data.totalIn} tone='bg-primary' />
            <Flow title={txa('Çıkan coin')} rows={data.sinks} total={data.totalOut} tone='bg-rose-400' />
          </div>
          {data.outOfBand.length > 0 && (
            <AdminPanel title={txa('Bant dışındaki ürünler')} meta={txa('Fiyat, nadirliğin bandında değil')}>
              <ul className='flex flex-wrap gap-2'>
                {data.outOfBand.map((product) => (
                  <li key={product.id} className='rounded-full bg-amber-400/10 px-3 py-1.5 text-[12.5px] text-amber-800 dark:text-amber-200'>{product.title} · {RARITY_META[product.rarity].label} · {formatNumber(product.price)}</li>
                ))}
              </ul>
            </AdminPanel>
          )}
        </>
      )}
      <SettingsPanel settings={merch.settings} onSaved={onChanged} />
      <WalletPanel />
    </div>
  )
}
