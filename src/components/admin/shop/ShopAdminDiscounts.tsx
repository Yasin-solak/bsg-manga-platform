import { useEffect, useMemo, useState } from 'react'
import { Plus, SpinnerGap } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { shopAdmin, type ShopAdminDiscount, type ShopAdminMerch } from '@/services/shopAdminService'
import { SHOP_RARITIES, type ShopRarity } from '@/services/shopService'
import { toast } from '@/services/toastService'
import { RARITY_META } from '@/pages/shop/shopFormat'
import { useShopQuery } from '@/pages/shop/useShopQuery'
import { AdminPanel, EmptyNote, Field, StateChip } from './ShopAdminKit'
import { BTN_DANGER, BTN_GHOST, BTN_PRIMARY, formatNumber, formatShortDate, fromLocalInput, INPUT, toLocalInput } from './shopAdminFormat'
import { txa } from '@/i18n/activeLocale'

/* Discounts: rule list, editor and price simulator (chosen moment + reader type). */

const TYPE_OPTIONS = [
  { value: 'frame', get label() { return txa('Avatar çerçevesi') } },
  { value: 'profile_effect', get label() { return txa('Profil efekti') } },
  { value: 'premium', get label() { return txa('Premium') } },
]

function scopeLabel(discount: ShopAdminDiscount, merch: ShopAdminMerch, productTitles: Map<string, string>) {
  switch (discount.scope) {
    case 'product': return discount.productIds.map((id) => productTitles.get(id) ?? txa('ürün')).join(', ')
    case 'type': return txa('Tür: {v1}', { v1: TYPE_OPTIONS.find((option) => option.value === discount.targetType)?.label ?? discount.targetType ?? '' })
    case 'rarity': return `Nadirlik: ${discount.targetRarity ? RARITY_META[discount.targetRarity].label : ''}`
    case 'season': return txa('Sezon: {v1}', { v1: merch.seasons.find((season) => season.id === discount.seasonId)?.name ?? '' })
    default: return txa('Tüm kozmetikler')
  }
}

function emptyDiscount(): ShopAdminDiscount {
  return { id: '', name: '', scope: 'type', productIds: [], targetType: 'frame', targetRarity: null, seasonId: null, excludeSeasonal: false, discountType: 'percent', value: 20, audience: 'everyone', startsAt: null, endsAt: null, status: 'draft', state: 'draft' }
}

export function ShopAdminDiscounts({ merch, onChanged }: { merch: ShopAdminMerch, onChanged: () => void }) {
  const { data: products } = useShopQuery('shop-admin-products-picker', () => shopAdmin.products('all'))
  const [editing, setEditing] = useState<ShopAdminDiscount | null>(null)
  const [saving, setSaving] = useState(false)
  const [sim, setSim] = useState({ productId: '', at: toLocalInput(new Date().toISOString()), premium: false })
  const [simResult, setSimResult] = useState<Awaited<ReturnType<typeof shopAdmin.simulate>> | null>(null)
  const productTitles = useMemo(() => new Map((products ?? []).map((product) => [product.id, product.title])), [products])

  useEffect(() => {
    if (!sim.productId) { setSimResult(null); return undefined }
    let cancelled = false
    const at = fromLocalInput(sim.at) ?? new Date().toISOString()
    shopAdmin.simulate(sim.productId, at, sim.premium).then((result) => { if (!cancelled) setSimResult(result) }).catch(() => setSimResult(null))
    return () => { cancelled = true }
  }, [sim, merch])

  const set = <K extends keyof ShopAdminDiscount>(key: K, value: ShopAdminDiscount[K]) => setEditing((current) => current ? { ...current, [key]: value } : current)

  const save = async (status: 'draft' | 'published' | 'archived') => {
    if (!editing) return
    if (!editing.name.trim()) { toast.error(txa('Kurala bir ad ver.')); return }
    setSaving(true)
    try {
      await shopAdmin.saveDiscount({ ...editing, id: editing.id || null, status })
      toast.success(txa('İndirim kaydedildi.'))
      setEditing(null)
      onChanged()
    } catch (reason) { toast.error(reason instanceof Error ? txa(reason.message) : txa('Kaydedilemedi.')) } finally { setSaving(false) }
  }

  const matching = editing && products ? products.filter((product) => {
    if (product.status === 'archived') return false
    if (editing.excludeSeasonal && product.seasonId) return false
    switch (editing.scope) {
      case 'product': return editing.productIds.includes(product.id)
      case 'type': return product.type === editing.targetType && product.kind !== 'bundle'
      case 'rarity': return product.rarity === editing.targetRarity && product.kind === 'cosmetic'
      case 'season': return product.seasonId === editing.seasonId && product.kind === 'cosmetic'
      default: return product.kind === 'cosmetic'
    }
  }).length : 0

  return (
    <div className='flex flex-col gap-4' data-testid='shop-admin-discounts'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <p className='max-w-[640px] text-[13px] text-muted-foreground'>{txa('İndirimler üst üste binmez: bir ürüne birden fazla kural uyarsa okura en düşük fiyat uygulanır. Paketlere yalnızca doğrudan o paketi hedefleyen kural uygulanır.')}</p>
        <button type='button' onClick={() => setEditing(emptyDiscount())} className={BTN_PRIMARY}><Plus weight='bold' size={14} />{txa('Yeni kural')}</button>
      </div>

      {merch.discounts.length === 0 ? <EmptyNote>{txa('Henüz indirim kuralı yok.')}</EmptyNote> : (
        <div className='overflow-x-auto rounded-[18px] border border-border/70 bg-card'>
          <table className='w-full min-w-[760px] border-collapse text-[13px]'>
            <thead>
              <tr className='text-left text-[11px] font-extrabold uppercase tracking-[0.06em] text-muted-foreground'>
                <th className='px-4 py-3'>{txa('Kural')}</th><th className='px-3 py-3'>{txa('Kapsam')}</th><th className='px-3 py-3'>{txa('İndirim')}</th><th className='px-3 py-3'>{txa('Tarih')}</th><th className='px-3 py-3'>{txa('Kimler')}</th><th className='px-3 py-3'>{txa('Durum')}</th>
              </tr>
            </thead>
            <tbody>
              {merch.discounts.map((discount) => (
                <tr key={discount.id} onClick={() => setEditing(discount)} className={cn('cursor-pointer border-t border-border/60 hover:bg-muted/30', editing?.id === discount.id && 'bg-primary/[0.05]')}>
                  <td className='px-4 py-3 font-bold'>{discount.name}</td>
                  <td className='max-w-[260px] truncate px-3 py-3 text-muted-foreground'>{scopeLabel(discount, merch, productTitles)}{discount.excludeSeasonal ? txa(' · sezon hariç') : ''}</td>
                  <td className='px-3 py-3 font-extrabold text-rose-600 dark:text-rose-300'>{discount.discountType === 'percent' ? txa('%{v1}', { v1: discount.value }) : `${formatNumber(discount.value)} Coin`}</td>
                  <td className='px-3 py-3 text-muted-foreground'>{discount.startsAt || discount.endsAt ? `${formatShortDate(discount.startsAt)} – ${formatShortDate(discount.endsAt)}` : txa('Süresiz')}</td>
                  <td className='px-3 py-3'>{discount.audience === 'premium' ? txa('Premium') : txa('Herkes')}</td>
                  <td className='px-3 py-3'><StateChip state={discount.state} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className='grid gap-4 xl:grid-cols-2'>
        {editing ? (
          <AdminPanel title={editing.id ? txa('Kuralı düzenle · {v1}', { v1: editing.name }) : txa('Yeni indirim kuralı')} meta={txa('{v1} ürüne uyuyor', { v1: matching })}>
            <div className='flex flex-col gap-3'>
              <div className='grid gap-3 sm:grid-cols-2'>
                <Field label={txa('Ad')}><input value={editing.name} onChange={(event) => set('name', event.target.value)} className={INPUT} placeholder={txa('Örn. Çerçevelerde %30')} /></Field>
                <Field label={txa('Kapsam')}>
                  <select value={editing.scope} onChange={(event) => set('scope', event.target.value as ShopAdminDiscount['scope'])} className={INPUT}>
                    <option value='type'>{txa('Ürün türü')}</option>
                    <option value='product'>{txa('Belirli ürünler')}</option>
                    <option value='rarity'>{txa('Nadirlik')}</option>
                    <option value='season'>{txa('Sezon')}</option>
                    <option value='all'>{txa('Tüm kozmetikler')}</option>
                  </select>
                </Field>
                {editing.scope === 'type' && (
                  <Field label={txa('Tür')}>
                    <select value={editing.targetType ?? 'frame'} onChange={(event) => set('targetType', event.target.value)} className={INPUT}>
                      {TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </Field>
                )}
                {editing.scope === 'rarity' && (
                  <Field label={txa('Nadirlik')}>
                    <select value={editing.targetRarity ?? 'rare'} onChange={(event) => set('targetRarity', event.target.value as ShopRarity)} className={INPUT}>
                      {[...SHOP_RARITIES].reverse().map((value) => <option key={value} value={value}>{RARITY_META[value].label}</option>)}
                    </select>
                  </Field>
                )}
                {editing.scope === 'season' && (
                  <Field label={txa('Sezon')}>
                    <select value={editing.seasonId ?? ''} onChange={(event) => set('seasonId', event.target.value || null)} className={INPUT}>
                      <option value=''>{txa('Seç')}</option>
                      {merch.seasons.map((season) => <option key={season.id} value={season.id}>{season.name}</option>)}
                    </select>
                  </Field>
                )}
                <Field label={txa('İndirim')}>
                  <span className='flex gap-2'>
                    <select value={editing.discountType} onChange={(event) => set('discountType', event.target.value as ShopAdminDiscount['discountType'])} className={cn(INPUT, 'w-36')}>
                      <option value='percent'>{txa('Yüzde')}</option>
                      <option value='fixed_price'>{txa('Sabit fiyat')}</option>
                    </select>
                    <input type='number' min={editing.discountType === 'percent' ? 1 : 0} max={editing.discountType === 'percent' ? 90 : undefined} value={editing.value} onChange={(event) => set('value', Number(event.target.value))} className={INPUT} />
                  </span>
                </Field>
                <Field label={txa('Kimler')}>
                  <select value={editing.audience} onChange={(event) => set('audience', event.target.value as ShopAdminDiscount['audience'])} className={INPUT}>
                    <option value='everyone'>{txa('Herkes')}</option>
                    <option value='premium'>{txa('Yalnız Premium üyeler')}</option>
                  </select>
                </Field>
                <Field label={txa('Başlar')}><input type='datetime-local' value={toLocalInput(editing.startsAt)} onChange={(event) => set('startsAt', fromLocalInput(event.target.value))} className={INPUT} /></Field>
                <Field label={txa('Biter')}><input type='datetime-local' value={toLocalInput(editing.endsAt)} onChange={(event) => set('endsAt', fromLocalInput(event.target.value))} className={INPUT} /></Field>
              </div>
              {editing.scope === 'product' && (
                <Field label={txa('Ürünler')}>
                  <select multiple value={editing.productIds} onChange={(event) => set('productIds', Array.from(event.target.selectedOptions).map((option) => option.value))} className={cn(INPUT, 'h-32 py-1')}>
                    {(products ?? []).filter((product) => product.status !== 'archived').map((product) => <option key={product.id} value={product.id}>{product.title}</option>)}
                  </select>
                </Field>
              )}
              <label className='flex items-center gap-2 text-[13px]'>
                <input type='checkbox' checked={editing.excludeSeasonal} onChange={(event) => set('excludeSeasonal', event.target.checked)} className='size-4 accent-[hsl(var(--primary))]' />
                {txa('Sezon ürünlerini hariç tut')}
              </label>
              <div className='flex flex-wrap gap-2 border-t border-border/60 pt-3'>
                {editing.id && editing.status === 'draft' && <button type='button' disabled={saving} onClick={async () => { try { await shopAdmin.remove('discount', editing.id); setEditing(null); onChanged() } catch (reason) { toast.error(reason instanceof Error ? txa(reason.message) : txa('Silinemedi.')) } }} className={cn(BTN_DANGER, 'mr-auto')}>{txa('Taslağı sil')}</button>}
                <button type='button' onClick={() => setEditing(null)} className={BTN_GHOST}>{txa('Kapat')}</button>
                {editing.id && editing.status !== 'archived' && <button type='button' disabled={saving} onClick={() => { void save('archived') }} className={BTN_GHOST}>{txa('Arşivle')}</button>}
                <button type='button' disabled={saving} onClick={() => { void save('draft') }} className={BTN_GHOST}>{txa('Taslak')}</button>
                <button type='button' disabled={saving} onClick={() => { void save('published') }} className={BTN_PRIMARY}>{saving && <SpinnerGap size={14} className='animate-spin' />}{txa('Yayınla')}</button>
              </div>
            </div>
          </AdminPanel>
        ) : (
          <AdminPanel title={txa('Kural düzenle')}><EmptyNote>{txa('Listeden bir kural seç ya da yeni kural oluştur.')}</EmptyNote></AdminPanel>
        )}

        <AdminPanel title={txa('Fiyat simülatörü')} meta={txa('Seçilen anda bir okur ne öder?')}>
          <div className='flex flex-col gap-3'>
            <div className='grid gap-3 sm:grid-cols-3'>
              <Field label={txa('Ürün')}>
                <select value={sim.productId} onChange={(event) => setSim((current) => ({ ...current, productId: event.target.value }))} className={INPUT}>
                  <option value=''>{txa('Seç')}</option>
                  {(products ?? []).filter((product) => product.status !== 'archived').map((product) => <option key={product.id} value={product.id}>{product.title}</option>)}
                </select>
              </Field>
              <Field label={txa('An')}><input type='datetime-local' value={sim.at} onChange={(event) => setSim((current) => ({ ...current, at: event.target.value }))} className={INPUT} /></Field>
              <Field label={txa('Okur')}>
                <select value={sim.premium ? '1' : '0'} onChange={(event) => setSim((current) => ({ ...current, premium: event.target.value === '1' }))} className={INPUT}>
                  <option value='0'>{txa('Standart')}</option>
                  <option value='1'>{txa('Premium üye')}</option>
                </select>
              </Field>
            </div>
            {simResult ? (
              <div className='flex flex-col gap-2 rounded-2xl bg-muted/30 p-3.5 text-[13px]'>
                {simResult.candidates.map((candidate, index) => (
                  <div key={`${candidate.source}-${candidate.discountId ?? index}`} className='flex justify-between gap-3'>
                    <span className='text-muted-foreground'>{candidate.source === 'list' ? txa('Liste fiyatı') : candidate.source === 'daily_deal' ? txa('Günün fırsatı') : candidate.label}</span>
                    <span className={candidate.applied ? 'font-extrabold text-primary' : 'text-muted-foreground line-through'}>{formatNumber(candidate.price)}{candidate.applied && candidate.source !== 'list' ? txa(' · uygulandı') : ''}</span>
                  </div>
                ))}
                <div className='flex items-baseline justify-between border-t border-border/60 pt-2'>
                  <b>{txa('Okurun ödeyeceği')}</b><span className='text-xl font-black text-amber-600 dark:text-amber-300'>{txa('{v1} Coin', { v1: formatNumber(simResult.final) })}</span>
                </div>
              </div>
            ) : <EmptyNote>{txa('Bir ürün seç.')}</EmptyNote>}
          </div>
        </AdminPanel>
      </div>
    </div>
  )
}
