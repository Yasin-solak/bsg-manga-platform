import { useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, CheckCircle, MagnifyingGlass, Plus, SpinnerGap, UploadSimple, Warning, X } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { resolveStoreAssetUrl } from '@/services/assetUrlService'
import { shopAdmin, type ShopAdminCampaign, type ShopAdminMerch, type ShopAdminProduct, type ShopAdminSeason } from '@/services/shopAdminService'
import { uploadStorefrontVisual } from '@/services/storageService'
import { toast } from '@/services/toastService'
import { TYPE_LABEL } from '@/pages/shop/shopFormat'
import { useShopQuery } from '@/pages/shop/useShopQuery'
import { EmptyNote, Field, Segments, StateChip } from './ShopAdminKit'
import { BTN_DANGER, BTN_GHOST, BTN_PRIMARY, CAMPAIGN_KINDS, formatNumber, formatShortDate, fromLocalInput, INPUT, PLACEMENTS, slugify, TEXTAREA, toLocalInput } from './shopAdminFormat'
import { txa, intlLocale } from '@/i18n/activeLocale'

/* Seasons and campaigns: a list by status on the left, editor in the middle, preview + checks on the right. */

type Selection = { kind: 'campaign', item: ShopAdminCampaign | null } | { kind: 'season', item: ShopAdminSeason | null } | null

function BannerUpload({ label, value, onChange, target }: { label: string, value: string, onChange: (value: string) => void, target: string }) {
  const [busy, setBusy] = useState(false)
  return (
    <Field label={label}>
      <label className={cn('flex h-10 cursor-pointer items-center gap-2 truncate rounded-xl border border-dashed px-3 text-[12.5px]', value ? 'border-primary/50' : 'border-border text-muted-foreground')}>
        {busy ? <SpinnerGap size={14} className='animate-spin' /> : <UploadSimple size={14} />}
        <span className='truncate'>{value ? txa('Yüklendi · değiştir') : txa('Görsel seç')}</span>
        <input type='file' accept='image/*,video/webm' className='sr-only' onChange={async (event) => {
          const file = event.target.files?.[0]
          if (!file) return
          setBusy(true)
          try { onChange(await uploadStorefrontVisual(file, target)) } catch (reason) { toast.error(reason instanceof Error ? txa(reason.message) : txa('Yüklenemedi.')) } finally { setBusy(false) }
        }} />
      </label>
    </Field>
  )
}

function ProductPicker({ products, selected, onChange }: { products: ShopAdminProduct[], selected: string[], onChange: (ids: string[]) => void }) {
  const [query, setQuery] = useState('')
  const byId = new Map(products.map((product) => [product.id, product]))
  const options = products
    .filter((product) => product.status !== 'archived' && !selected.includes(product.id))
    .filter((product) => !query.trim() || product.title.toLocaleLowerCase(intlLocale()).includes(query.trim().toLocaleLowerCase(intlLocale())))
    .slice(0, 8)
  const move = (index: number, delta: number) => {
    const next = [...selected]
    const target = index + delta
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next)
  }
  return (
    <div className='flex flex-col gap-2'>
      {selected.map((id, index) => {
        const product = byId.get(id)
        return (
          <div key={id} className='flex items-center gap-2 rounded-xl border border-border/70 bg-muted/30 px-3 py-1.5 text-[13px]'>
            <span className='w-5 text-center text-[12px] font-bold text-muted-foreground'>{index + 1}</span>
            <span className='min-w-0 flex-1 truncate font-bold'>{product?.title ?? txa('Silinmiş ürün')}</span>
            {product && <span className='text-[11.5px] text-muted-foreground'>{TYPE_LABEL[product.type]}</span>}
            {product && <StateChip state={product.state} />}
            <button type='button' aria-label={txa('Yukarı')} onClick={() => move(index, -1)} className='flex size-7 items-center justify-center rounded-md hover:bg-accent'><ArrowUp size={12} /></button>
            <button type='button' aria-label={txa('Aşağı')} onClick={() => move(index, 1)} className='flex size-7 items-center justify-center rounded-md hover:bg-accent'><ArrowDown size={12} /></button>
            <button type='button' aria-label={txa('Çıkar')} onClick={() => onChange(selected.filter((entry) => entry !== id))} className='flex size-7 items-center justify-center rounded-md hover:bg-accent'><X size={12} /></button>
          </div>
        )
      })}
      <label className='relative flex items-center'>
        <MagnifyingGlass size={14} className='pointer-events-none absolute left-3 text-muted-foreground' />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={txa('Ürün ekle: ara')} className={cn(INPUT, 'pl-8')} />
      </label>
      {query.trim() && (
        <div className='flex flex-col gap-1 rounded-xl border border-border/70 p-1'>
          {options.length === 0 && <span className='px-2 py-1.5 text-[12px] text-muted-foreground'>{txa('Sonuç yok')}</span>}
          {options.map((product) => (
            <button key={product.id} type='button' onClick={() => { onChange([...selected, product.id]); setQuery('') }} className='flex items-center gap-2 rounded-lg bg-transparent px-2 py-1.5 text-left text-[13px] hover:bg-accent'>
              <Plus size={12} /><span className='min-w-0 flex-1 truncate'>{product.title}</span><span className='text-[11.5px] text-muted-foreground'>{formatNumber(product.basePrice)}{' '}{txa('Coin')}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function CampaignEditor({ campaign, merch, products, onSaved }: { campaign: ShopAdminCampaign | null, merch: ShopAdminMerch, products: ShopAdminProduct[], onSaved: () => void }) {
  const initial = useMemo(() => ({
    id: campaign?.id ?? null,
    name: campaign?.name ?? '',
    slug: campaign?.slug ?? '',
    kind: campaign?.kind ?? 'launch',
    headline: campaign?.headline ?? '',
    body: campaign?.body ?? '',
    seasonId: campaign?.seasonId ?? '',
    startsAt: toLocalInput(campaign?.startsAt),
    endsAt: toLocalInput(campaign?.endsAt),
    placements: campaign?.placements ?? ['hero'],
    notifyOnStart: campaign?.notifyOnStart ?? false,
    banner: campaign?.banner ?? '',
    bannerMobile: campaign?.bannerMobile ?? '',
    focus: campaign?.focus ?? 'center',
    productIds: campaign?.products.map((product) => product.id) ?? [],
  }), [campaign])
  const [form, setForm] = useState(initial)
  const [saving, setSaving] = useState(false)
  useEffect(() => setForm(initial), [initial])
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((current) => ({ ...current, [key]: value }))

  const start = fromLocalInput(form.startsAt)
  const end = fromLocalInput(form.endsAt)
  const productMap = new Map(products.map((product) => [product.id, product]))
  const heroConflicts = form.placements.includes('hero') && start && end
    ? merch.campaigns.filter((other) => other.id !== form.id && other.status === 'published' && other.placements.includes('hero') && new Date(other.startsAt) < new Date(end) && new Date(start) < new Date(other.endsAt))
    : []
  const checks = [
    { ok: Boolean(start && end && new Date(start) < new Date(end)), text: 'Başlangıç ve bitiş tarihi geçerli' },
    { ok: heroConflicts.length === 0, text: heroConflicts.length ? txa('Ana vitrin çakışıyor: {v1}', { v1: heroConflicts.map((other) => other.name).join(', ') }) : txa('Ana vitrin bu tarihlerde boş') },
    { ok: form.productIds.length > 0, text: form.productIds.length ? txa('{v1} ürün bağlı', { v1: form.productIds.length }) : txa('Kampanyaya ürün eklenmedi') },
    { ok: form.productIds.every((id) => ['live', 'upcoming'].includes(productMap.get(id)?.state ?? '')), text: 'Tüm ürünler yayında ya da planlı' },
    { ok: Boolean(form.banner), text: form.banner ? txa('Masaüstü görseli yüklü') : txa('Masaüstü görseli yok') },
  ]

  const save = async (status: 'draft' | 'published' | 'archived') => {
    if (!form.name.trim() || !start || !end) { toast.error('Ad ve tarihler zorunlu.'); return }
    setSaving(true)
    try {
      await shopAdmin.saveCampaign({ ...form, slug: form.slug || slugify(form.name), startsAt: start, endsAt: end, status })
      toast.success(status === 'published' ? 'Kampanya yayına alındı.' : 'Kaydedildi.')
      onSaved()
    } catch (reason) { toast.error(reason instanceof Error ? txa(reason.message) : txa('Kaydedilemedi.')) } finally { setSaving(false) }
  }

  const banner = resolveStoreAssetUrl(form.banner)
  const bannerMobile = resolveStoreAssetUrl(form.bannerMobile) ?? banner
  const focusClass = form.focus === 'left' ? 'object-left' : form.focus === 'right' ? 'object-right' : 'object-center'

  return (
    <div className='grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]'>
      <div className='flex min-w-0 flex-col gap-4'>
        <div className='flex flex-wrap items-center justify-between gap-2'>
          <span className='text-lg font-extrabold'>{campaign ? campaign.name : txa('Yeni kampanya')}</span>
          {campaign && <StateChip state={campaign.state} />}
        </div>
        <Field label={txa('Kampanya türü')}>
          <Segments value={form.kind} onChange={(value) => set('kind', value)} options={CAMPAIGN_KINDS.map((kind) => ({ value: kind.value, label: kind.label }))} />
        </Field>
        <div className='grid gap-3 sm:grid-cols-2'>
          <Field label={txa('Ad (yönetim)')}><input value={form.name} onChange={(event) => set('name', event.target.value)} className={INPUT} /></Field>
          <Field label={txa('Sezon')}>
            <select value={form.seasonId} onChange={(event) => set('seasonId', event.target.value)} className={INPUT}>
              <option value=''>{txa('Sezonsuz')}</option>
              {merch.seasons.map((season) => <option key={season.id} value={season.id}>{season.name}</option>)}
            </select>
          </Field>
          <Field label={txa('Başlar')}><input type='datetime-local' value={form.startsAt} onChange={(event) => set('startsAt', event.target.value)} className={INPUT} /></Field>
          <Field label={txa('Biter')}><input type='datetime-local' value={form.endsAt} onChange={(event) => set('endsAt', event.target.value)} className={INPUT} /></Field>
        </div>
        <Field label={txa('Vitrin başlığı')}><input value={form.headline} onChange={(event) => set('headline', event.target.value)} className={INPUT} maxLength={120} placeholder={txa('Örn. Ejder Salonu Koleksiyonu')} /></Field>
        <Field label={txa('Kısa metin')}><textarea value={form.body} onChange={(event) => set('body', event.target.value.slice(0, 600))} rows={2} className={TEXTAREA} /></Field>
        <Field label={txa('Ürünler (vitrinde bu sırayla)')}>
          <ProductPicker products={products} selected={form.productIds} onChange={(ids) => set('productIds', ids)} />
        </Field>
        <div className='grid gap-4 sm:grid-cols-2'>
          <div className='flex flex-col gap-2'>
            <span className='text-[12px] font-extrabold text-muted-foreground'>{txa('Vitrinde nerede')}</span>
            {PLACEMENTS.map((placement) => (
              <label key={placement.value} className='flex items-center gap-2 text-[13px]'>
                <input type='checkbox' checked={form.placements.includes(placement.value)} onChange={(event) => set('placements', event.target.checked ? [...form.placements, placement.value] : form.placements.filter((entry) => entry !== placement.value))} className='size-4 accent-[hsl(var(--primary))]' />
                {placement.label}
              </label>
            ))}
          </div>
          <div className='flex flex-col gap-2'>
            <span className='text-[12px] font-extrabold text-muted-foreground'>{txa('Duyuru')}</span>
            <p className='text-[12.5px] leading-relaxed text-muted-foreground'>{txa('Kampanya başlayınca vitrinde "Hatırlat" diyen okurlara otomatik bildirim gider (5 dakika içinde). "Yakında" rafı başlangıçtan 14 gün önce görünür.')}</p>
          </div>
        </div>
        <div className='grid gap-3 sm:grid-cols-3'>
          <BannerUpload label={txa('Masaüstü görseli (1600×640)')} value={form.banner} onChange={(value) => set('banner', value)} target={`shop/campaigns/${form.slug || 'yeni'}`} />
          <BannerUpload label={txa('Mobil görsel (isteğe bağlı)')} value={form.bannerMobile} onChange={(value) => set('bannerMobile', value)} target={`shop/campaigns/${form.slug || 'yeni'}`} />
          <Field label={txa('Mobil odak')}>
            <Segments value={form.focus} onChange={(value) => set('focus', value)} options={[{ value: 'left', label: txa('Sol') }, { value: 'center', label: txa('Orta') }, { value: 'right', label: txa('Sağ') }]} />
          </Field>
        </div>
        <div className='flex flex-wrap gap-2 border-t border-border/60 pt-4'>
          {campaign?.status === 'draft' && <button type='button' disabled={saving} onClick={async () => { try { await shopAdmin.remove('campaign', campaign.id); onSaved() } catch (reason) { toast.error(reason instanceof Error ? txa(reason.message) : txa('Silinemedi.')) } }} className={cn(BTN_DANGER, 'mr-auto')}>{txa('Taslağı sil')}</button>}
          {campaign && campaign.status !== 'archived' && <button type='button' disabled={saving} onClick={() => { void save('archived') }} className={BTN_GHOST}>{txa('Arşivle')}</button>}
          <button type='button' disabled={saving} onClick={() => { void save('draft') }} className={BTN_GHOST}>{txa('Taslak kaydet')}</button>
          <button type='button' disabled={saving} onClick={() => { void save('published') }} className={BTN_PRIMARY}>{saving && <SpinnerGap size={14} className='animate-spin' />}{txa('Yayınla')}</button>
        </div>
      </div>

      <aside className='flex flex-col gap-3'>
        <span className='text-[12px] font-extrabold text-muted-foreground'>{txa('Masaüstü vitrin')}</span>
        <div className='relative h-36 overflow-hidden rounded-xl border border-border/70 bg-muted'>
          {banner && <img src={banner} alt='' className='absolute inset-0 size-full object-cover' />}
          <span aria-hidden className='absolute inset-0 bg-gradient-to-r from-background via-background/70 to-transparent' />
          <div className='relative flex h-full max-w-[65%] flex-col justify-center gap-1 p-3'>
            <span className='w-fit rounded-full bg-primary px-2 py-0.5 text-[9px] font-extrabold text-primary-foreground'>{CAMPAIGN_KINDS.find((kind) => kind.value === form.kind)?.label}</span>
            <span className='line-clamp-2 text-[15px] font-black leading-tight'>{form.headline || form.name || txa('Başlık')}</span>
          </div>
        </div>
        <span className='text-[12px] font-extrabold text-muted-foreground'>{txa('Mobil kırpım')}</span>
        <div className='relative h-52 w-32 overflow-hidden rounded-xl border border-border/70 bg-muted'>
          {bannerMobile && <img src={bannerMobile} alt='' className={cn('absolute inset-0 size-full object-cover', focusClass)} />}
          <span aria-hidden className='absolute inset-0 bg-gradient-to-t from-background to-transparent' />
          <span className='absolute bottom-2 left-2 right-2 line-clamp-2 text-[12px] font-black leading-tight'>{form.headline || form.name}</span>
        </div>
        <div className='flex flex-col gap-1.5 rounded-2xl bg-muted/30 p-3'>
          <span className='text-[12.5px] font-extrabold'>{txa('Yayın kontrolü')}</span>
          {checks.map((check) => (
            <span key={check.text} className='flex items-start gap-2 text-[12px]'>
              {check.ok ? <CheckCircle weight='fill' size={14} className='mt-0.5 flex-none text-primary' /> : <Warning weight='fill' size={14} className='mt-0.5 flex-none text-amber-600 dark:text-amber-300' />}
              <span className={check.ok ? 'text-foreground/80' : 'text-amber-800 dark:text-amber-200'}>{check.text}</span>
            </span>
          ))}
        </div>
      </aside>
    </div>
  )
}

function SeasonEditor({ season, products, onSaved }: { season: ShopAdminSeason | null, products: ShopAdminProduct[], onSaved: () => void }) {
  const initial = useMemo(() => ({
    id: season?.id ?? null,
    name: season?.name ?? '',
    slug: season?.slug ?? '',
    tagline: season?.tagline ?? '',
    description: season?.description ?? '',
    accent: season?.accent ?? '#f5b942',
    banner: season?.banner ?? '',
    bannerMobile: season?.bannerMobile ?? '',
    startsAt: toLocalInput(season?.startsAt),
    endsAt: toLocalInput(season?.endsAt),
  }), [season])
  const [form, setForm] = useState(initial)
  const [saving, setSaving] = useState(false)
  useEffect(() => setForm(initial), [initial])
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((current) => ({ ...current, [key]: value }))
  const inSeason = season ? products.filter((product) => product.seasonId === season.id) : []

  const save = async (status: 'draft' | 'published' | 'archived') => {
    const start = fromLocalInput(form.startsAt)
    const end = fromLocalInput(form.endsAt)
    if (!form.name.trim() || !start || !end) { toast.error('Ad ve tarihler zorunlu.'); return }
    setSaving(true)
    try {
      await shopAdmin.saveSeason({ ...form, slug: form.slug || slugify(form.name, false), startsAt: start, endsAt: end, status })
      toast.success(status === 'published' ? 'Sezon yayında.' : 'Kaydedildi.')
      onSaved()
    } catch (reason) { toast.error(reason instanceof Error ? txa(reason.message) : txa('Kaydedilemedi.')) } finally { setSaving(false) }
  }

  return (
    <div className='flex max-w-[860px] flex-col gap-4'>
      <div className='flex items-center justify-between gap-2'>
        <span className='text-lg font-extrabold'>{season ? season.name : txa('Yeni sezon')}</span>
        {season && <StateChip state={season.state} />}
      </div>
      <div className='grid gap-3 sm:grid-cols-2'>
        <Field label={txa('Sezon adı')}><input value={form.name} onChange={(event) => set('name', event.target.value)} className={INPUT} maxLength={80} /></Field>
        <Field label={txa('Adres')} hint={`/magaza/sezon/${form.slug || slugify(form.name || 'sezon', false)}`}><input value={form.slug} onChange={(event) => set('slug', event.target.value)} className={INPUT} placeholder={txa('otomatik')} /></Field>
        <Field label={txa('Başlar')}><input type='datetime-local' value={form.startsAt} onChange={(event) => set('startsAt', event.target.value)} className={INPUT} /></Field>
        <Field label={txa('Biter')}><input type='datetime-local' value={form.endsAt} onChange={(event) => set('endsAt', event.target.value)} className={INPUT} /></Field>
      </div>
      <Field label={txa('Kısa slogan')}><input value={form.tagline} onChange={(event) => set('tagline', event.target.value)} className={INPUT} maxLength={160} /></Field>
      <Field label={txa('Sezon sayfası metni')}><textarea value={form.description} onChange={(event) => set('description', event.target.value.slice(0, 1200))} rows={3} className={TEXTAREA} /></Field>
      <div className='grid gap-3 sm:grid-cols-3'>
        <Field label={txa('Vurgu rengi')}>
          <span className='flex items-center gap-2'>
            <input type='color' value={form.accent} onChange={(event) => set('accent', event.target.value)} className='h-10 w-14 cursor-pointer rounded-lg border border-border bg-transparent' />
            <input value={form.accent} onChange={(event) => set('accent', event.target.value)} className={INPUT} />
          </span>
        </Field>
        <BannerUpload label={txa('Kapak (masaüstü)')} value={form.banner} onChange={(value) => set('banner', value)} target={`shop/seasons/${form.slug || 'yeni'}`} />
        <BannerUpload label={txa('Kapak (mobil)')} value={form.bannerMobile} onChange={(value) => set('bannerMobile', value)} target={`shop/seasons/${form.slug || 'yeni'}`} />
      </div>
      {season && (
        <div className='rounded-2xl bg-muted/30 p-3.5 text-[13px]'>
          <span className='font-extrabold'>{txa('Sezon ürünleri (')}{inSeason.length})</span>
          <p className='mt-1 text-[12px] text-muted-foreground'>{txa('Ürünü sezona ürün düzenleyiciden ya da Ürünler listesinde toplu "Sezona ata" ile bağla. Satış penceresi boş olan ürünler sezonla açılır ve kapanır; farklı tarihli ürünler sezon sayfasında ayrı parti olarak görünür.')}</p>
          {inSeason.length > 0 && <p className='mt-2 text-[12.5px]'>{inSeason.map((product) => product.title).join(' · ')}</p>}
        </div>
      )}
      <div className='flex flex-wrap gap-2 border-t border-border/60 pt-4'>
        {season?.status === 'draft' && <button type='button' disabled={saving} onClick={async () => { try { await shopAdmin.remove('season', season.id); onSaved() } catch (reason) { toast.error(reason instanceof Error ? txa(reason.message) : txa('Silinemedi.')) } }} className={cn(BTN_DANGER, 'mr-auto')}>{txa('Taslağı sil')}</button>}
        {season && season.status !== 'archived' && <button type='button' disabled={saving} onClick={() => { void save('archived') }} className={BTN_GHOST}>{txa('Arşivle')}</button>}
        <button type='button' disabled={saving} onClick={() => { void save('draft') }} className={BTN_GHOST}>{txa('Taslak kaydet')}</button>
        <button type='button' disabled={saving} onClick={() => { void save('published') }} className={BTN_PRIMARY}>{saving && <SpinnerGap size={14} className='animate-spin' />}{txa('Yayınla')}</button>
      </div>
    </div>
  )
}

export function ShopAdminMerch({ merch, onChanged }: { merch: ShopAdminMerch, onChanged: () => void }) {
  const { data: products } = useShopQuery('shop-admin-products-picker', () => shopAdmin.products('all'))
  const [list, setList] = useState<'campaign' | 'season'>('campaign')
  const [selection, setSelection] = useState<Selection>(null)

  const campaignGroups = [
    { label: txa('Yayında'), items: merch.campaigns.filter((campaign) => campaign.state === 'live') },
    { label: txa('Planlandı'), items: merch.campaigns.filter((campaign) => campaign.state === 'scheduled') },
    { label: txa('Taslak'), items: merch.campaigns.filter((campaign) => campaign.state === 'draft') },
    { label: txa('Bitti'), items: merch.campaigns.filter((campaign) => campaign.state === 'ended') },
  ]
  const afterSave = () => { onChanged(); setSelection(null) }

  return (
    <div className='grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]' data-testid='shop-admin-merch'>
      <aside className='flex flex-col gap-2 rounded-[18px] border border-border/70 bg-card p-3 lg:self-start'>
        <div className='flex items-center gap-2'>
          <Segments value={list} onChange={(value) => { setList(value); setSelection(null) }} options={[{ value: 'campaign', label: txa('Kampanya {v1}', { v1: merch.campaigns.length }) }, { value: 'season', label: `Sezon ${merch.seasons.length}` }]} />
          <button type='button' aria-label={txa('Yeni')} onClick={() => setSelection(list === 'campaign' ? { kind: 'campaign', item: null } : { kind: 'season', item: null })} className='ml-auto flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground'><Plus weight='bold' size={15} /></button>
        </div>
        {list === 'campaign' ? (
          merch.campaigns.length === 0 ? <EmptyNote>{txa('Henüz kampanya yok.')}</EmptyNote> : campaignGroups.filter((group) => group.items.length).map((group) => (
            <div key={group.label} className='flex flex-col gap-1'>
              <span className='px-1 pt-2 text-[10.5px] font-extrabold uppercase tracking-[0.1em] text-muted-foreground/70'>{group.label}</span>
              {group.items.map((campaign) => (
                <button key={campaign.id} type='button' onClick={() => setSelection({ kind: 'campaign', item: campaign })} className={cn('flex flex-col items-start rounded-xl border px-3 py-2 text-left', selection?.kind === 'campaign' && selection.item?.id === campaign.id ? 'border-primary/40 bg-primary/[0.06]' : 'border-transparent hover:bg-muted/40')}>
                  <span className='w-full truncate text-[13px] font-bold'>{campaign.name}</span>
                  <span className='text-[11.5px] text-muted-foreground'>{formatShortDate(campaign.startsAt)} – {formatShortDate(campaign.endsAt)} · {CAMPAIGN_KINDS.find((kind) => kind.value === campaign.kind)?.label}</span>
                </button>
              ))}
            </div>
          ))
        ) : (
          merch.seasons.length === 0 ? <EmptyNote>{txa('Henüz sezon yok.')}</EmptyNote> : merch.seasons.map((season) => (
            <button key={season.id} type='button' onClick={() => setSelection({ kind: 'season', item: season })} className={cn('flex items-center gap-2 rounded-xl border px-3 py-2 text-left', selection?.kind === 'season' && selection.item?.id === season.id ? 'border-primary/40 bg-primary/[0.06]' : 'border-transparent hover:bg-muted/40')}>
              <span className='size-2.5 flex-none rounded-full' style={{ background: season.accent ?? 'hsl(var(--primary))' }} />
              <span className='min-w-0 flex-1'>
                <span className='block truncate text-[13px] font-bold'>{season.name}</span>
                <span className='block text-[11.5px] text-muted-foreground'>{formatShortDate(season.startsAt)} – {formatShortDate(season.endsAt)} · {season.productCount}{' '}{txa('ürün')}</span>
              </span>
              <StateChip state={season.state} />
            </button>
          ))
        )}
      </aside>
      <div className='min-w-0 rounded-[18px] border border-border/70 bg-card p-5'>
        {!selection ? (
          <EmptyNote>{txa('Soldan bir')}{' '}{list === 'campaign' ? txa('kampanya') : txa('sezon')}{' '}{txa('seç ya da + ile yenisini oluştur.')}</EmptyNote>
        ) : selection.kind === 'campaign' ? (
          <CampaignEditor key={selection.item?.id ?? 'new'} campaign={selection.item} merch={merch} products={products ?? []} onSaved={afterSave} />
        ) : (
          <SeasonEditor key={selection.item?.id ?? 'new'} season={selection.item} products={products ?? []} onSaved={afterSave} />
        )}
      </div>
    </div>
  )
}
