import { useEffect, useMemo, useState } from 'react'
import { SpinnerGap } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { PREMIUM_PERK_GROUPS, PREMIUM_PERKS, type PremiumPerkGroup, type PremiumPerkMeta } from '@/data/premiumPerks'
import { setPremiumPerks } from '@/lib/premiumPerks'
import { shopAdmin, type ShopAdminPremiumPerk } from '@/services/shopAdminService'
import { toast } from '@/services/toastService'
import { PREMIUM_PERK_ICONS } from '@/pages/shop/premiumPerkIcons'
import { useShopQuery } from '@/pages/shop/useShopQuery'
import { AdminPanel, Segments } from './ShopAdminKit'
import { BTN_PRIMARY, formatDateTime, INPUT } from './shopAdminFormat'
import { txa } from '@/i18n/activeLocale'

/*
 * Shop Control > Premium: each Premium perk turns on / off, its numeric setting (percent, hours)
 * is given here. A disabled perk is not applied on the server and not described on the Premium page.
 * Price and duration are on the Premium product in the Products tab (30-day plan only).
 */

const NEW_PERKS = new Set(['member_pricing', 'coin_bonus', 'shop_early_access'])

function configValue(meta: PremiumPerkMeta, row: ShopAdminPremiumPerk | undefined) {
  if (!meta.config) return null
  const raw = Number(row?.config?.[meta.config.field])
  return Number.isFinite(raw) ? raw : meta.config.fallback
}

function PerkRow({ meta, row, onSaved }: { meta: PremiumPerkMeta, row: ShopAdminPremiumPerk | undefined, onSaved: () => void }) {
  const Icon = PREMIUM_PERK_ICONS[meta.key]
  const savedValue = configValue(meta, row)
  const enabled = row?.enabled ?? meta.defaultEnabled
  const [value, setValue] = useState(savedValue === null ? '' : String(savedValue))
  const [saving, setSaving] = useState(false)
  useEffect(() => { setValue(savedValue === null ? '' : String(savedValue)) }, [savedValue])

  const numeric = Number(value)
  const valid = !meta.config || (value.trim() !== '' && Number.isInteger(numeric) && numeric >= meta.config.min && numeric <= meta.config.max)
  const dirty = meta.config !== undefined && savedValue !== numeric

  const save = async (nextEnabled: boolean) => {
    if (!valid) { toast.error(txa('{v1}: {v2}-{v3} arası gir.', { v1: meta.config?.label ?? '', v2: meta.config?.min ?? 0, v3: meta.config?.max ?? 0 })); return }
    setSaving(true)
    try {
      await shopAdmin.savePremiumPerk(meta.key, nextEnabled, meta.config ? { [meta.config.field]: numeric } : {})
      toast.success(`${meta.label} ${nextEnabled ? txa('açık') : txa('kapalı')}.`)
      onSaved()
    } catch (reason) {
      toast.error(reason instanceof Error ? txa(reason.message) : txa('Kaydedilemedi.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <li className='flex flex-col gap-3 py-4 first:pt-0 last:pb-0 lg:flex-row lg:items-center lg:gap-5' data-premium-perk={meta.key}>
      <span className={cn('grid size-10 flex-none place-items-center rounded-xl', enabled ? 'bg-foreground/[0.08] text-foreground' : 'bg-foreground/[0.03] text-muted-foreground')}>
        <Icon size={20} weight={enabled ? 'fill' : 'regular'} />
      </span>
      <span className='flex min-w-0 flex-1 flex-col gap-1'>
        <span className='flex flex-wrap items-center gap-2'>
          <b className='text-[14px] font-extrabold'>{meta.label}</b>
          {NEW_PERKS.has(meta.key) && <span className='rounded-full bg-foreground/[0.08] px-2 py-0.5 text-[10.5px] font-extrabold uppercase tracking-[0.06em]'>{txa('Yeni')}</span>}
        </span>
        <span className='text-[12.5px] text-muted-foreground'>{meta.description}</span>
        <span className='text-[12px] text-muted-foreground/80'><b className='font-bold text-muted-foreground'>{txa('Kapalıyken:')}</b> {meta.whenOff}</span>
      </span>
      {meta.config && (
        <span className='flex flex-none items-center gap-2'>
          <label className='flex items-center gap-2'>
            <span className='sr-only'>{meta.config.label}</span>
            <input
              type='number'
              min={meta.config.min}
              max={meta.config.max}
              step={1}
              value={value}
              onChange={(event) => setValue(event.target.value)}
              className={cn(INPUT, 'h-9 w-24 tabular-nums', !valid && 'border-rose-400/60')}
              aria-label={meta.config.label}
            />
            <span className='w-9 text-[12.5px] font-bold text-muted-foreground'>{meta.config.suffix}</span>
          </label>
          {dirty && (
            <button type='button' disabled={saving || !valid} onClick={() => { void save(enabled) }} className={cn(BTN_PRIMARY, 'h-9 px-3')}>
              {saving && <SpinnerGap size={14} className='animate-spin' />}{txa('Kaydet')}
            </button>
          )}
        </span>
      )}
      <Segments
        className='flex-none'
        value={enabled ? 'on' : 'off'}
        onChange={(next) => { if ((next === 'on') !== enabled && !saving) void save(next === 'on') }}
        options={[{ value: 'on', label: txa('Açık') }, { value: 'off', label: txa('Kapalı'), tone: 'text-rose-600 dark:text-rose-300' }]}
      />
    </li>
  )
}

export function ShopAdminPremiumPerks() {
  const { data, loading, error, reload } = useShopQuery('shop-admin-premium-perks', shopAdmin.premiumPerks)
  const byKey = useMemo(() => new Map((data ?? []).map((row) => [row.key, row])), [data])
  const groups = useMemo(() => {
    const order: PremiumPerkGroup[] = ['reading', 'identity', 'community', 'shop']
    return order.map((group) => ({ group, perks: PREMIUM_PERKS.filter((perk) => perk.group === group) }))
  }, [])
  const activeCount = PREMIUM_PERKS.filter((perk) => byKey.get(perk.key)?.enabled ?? perk.defaultEnabled).length
  const lastUpdate = (data ?? []).map((row) => row.updatedAt).filter((value): value is string => Boolean(value)).sort().pop() ?? null

  useEffect(() => { if (data) setPremiumPerks(data) }, [data])

  return (
    <div className='flex flex-col gap-4' data-testid='shop-admin-premium-perks'>
      <AdminPanel
        title={txa('Premium ayrıcalıkları')}
        meta={lastUpdate ? txa('Son güncelleme {v1}', { v1: formatDateTime(lastUpdate) }) : txa('Fiyat ve süre, Ürünler sekmesindeki Premium üründe (30 gün)')}
      >
        <p className='text-[13px] text-muted-foreground'>
          <b className='text-foreground'>{activeCount} / {PREMIUM_PERKS.length}</b> {txa('ayrıcalık açık. Kapalı bir ayrıcalık sunucuda uygulanmaz, Premium sayfasında ve mağazada anlatılmaz. Açınca hemen geçerli olur; kullanıcıların kayıtlı seçimleri silinmez.')}
        </p>
        {error && <p className='mt-2 text-[13px] text-rose-600 dark:text-rose-300'>{error}</p>}
      </AdminPanel>
      {loading && !data ? <div className='h-96 animate-pulse rounded-[18px] bg-muted/40' /> : groups.map(({ group, perks }) => (
        <AdminPanel key={group} title={PREMIUM_PERK_GROUPS[group]}>
          <ul className='flex flex-col divide-y divide-border/60'>
            {perks.map((perk) => <PerkRow key={perk.key} meta={perk} row={byKey.get(perk.key)} onSaved={reload} />)}
          </ul>
        </AdminPanel>
      ))}
    </div>
  )
}
