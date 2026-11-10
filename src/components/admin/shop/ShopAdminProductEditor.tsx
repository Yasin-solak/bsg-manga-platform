import { useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, MagnifyingGlass, Plus, SpinnerGap, UploadSimple, X } from '@phosphor-icons/react'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { resolveAssetMediaType, resolveStoreAssetUrl } from '@/services/assetUrlService'
import { shopAdmin, type ShopAdminCosmetic, type ShopAdminProduct, type ShopAdminSeason, type ShopAdminSettings } from '@/services/shopAdminService'
import { SHOP_RARITIES, type ShopGrant, type ShopProductType, type ShopRarity } from '@/services/shopService'
import { uploadStorefrontVisual } from '@/services/storageService'
import { ShopPreview } from '@/pages/shop/ShopPreview'
import { RARITY_META, TYPE_LABEL } from '@/pages/shop/shopFormat'
import { ShopAdminCosmeticCreator } from './ShopAdminCosmeticCreator'
import { Field, Segments, StateChip } from './ShopAdminKit'
import { BTN_DANGER, BTN_GHOST, BTN_PRIMARY, formatNumber, fromLocalInput, INPUT, ISSUE_LABEL, slugify, TEXTAREA, toLocalInput, toPreviewCard } from './shopAdminFormat'
import { txa, intlLocale } from '@/i18n/activeLocale'

/*
 * Product editor: type (single / bundle / premium), content selection (cosmetic records or a new
 * upload), info, price (rarity band hint, bundle savings), sales window, audience, stock,
 * season, images and live preview.
 */

type Kind = ShopAdminProduct['kind']

interface Form {
  id: string | null
  kind: Kind
  slug: string
  title: string
  subtitle: string
  description: string
  rarity: ShopRarity
  basePrice: string
  status: ShopAdminProduct['status']
  availableFrom: string
  availableUntil: string
  audience: ShopAdminProduct['audience']
  stockLimit: string
  seasonId: string
  cover: string
  hero: string
  premiumDays: string
  bundleMode: ShopAdminProduct['bundleMode']
  giftable: boolean
  hideUntilLaunch: boolean
  tags: string
  sortWeight: string
  grants: ShopGrant[]
}

function toForm(product: ShopAdminProduct | null, kind: Kind): Form {
  return {
    id: product?.id ?? null,
    kind: product?.kind ?? kind,
    slug: product?.slug ?? '',
    title: product?.title ?? '',
    subtitle: product?.subtitle ?? '',
    description: product?.description ?? '',
    rarity: product?.rarity ?? (kind === 'bundle' ? 'epic' : 'rare'),
    basePrice: product ? String(product.basePrice) : '',
    status: product?.status ?? 'draft',
    availableFrom: toLocalInput(product?.availableFrom),
    availableUntil: toLocalInput(product?.availableUntil),
    audience: product?.audience ?? 'everyone',
    stockLimit: product?.stockLimit ? String(product.stockLimit) : '',
    seasonId: product?.seasonId ?? '',
    cover: product?.cover ?? '',
    hero: product?.hero ?? '',
    premiumDays: product?.premiumDays ? String(product.premiumDays) : '30',
    bundleMode: product?.bundleMode ?? 'proportional',
    giftable: product?.giftable ?? true,
    hideUntilLaunch: product?.hideUntilLaunch ?? true,
    tags: product?.tags.join(', ') ?? '',
    sortWeight: String(product?.sortWeight ?? 0),
    grants: product?.grants ?? [],
  }
}

function cosmeticToGrant(cosmetic: ShopAdminCosmetic): ShopGrant {
  return { id: cosmetic.id, type: cosmetic.type, identifier: cosmetic.identifier, name: cosmetic.name, imageKey: cosmetic.imageKey, assetUrl: cosmetic.assetUrl, posterUrl: cosmetic.posterUrl }
}

function GrantThumb({ grant }: { grant: ShopGrant }) {
  const src = resolveStoreAssetUrl(grant.posterUrl ?? grant.assetUrl)
  if (!src) return <span className='size-9 flex-none rounded-lg bg-muted' />
  return resolveAssetMediaType(src) === 'video'
    ? <video src={src} muted playsInline preload='metadata' className='size-9 flex-none rounded-lg bg-muted object-cover' />
    : <img src={src} alt='' className='size-9 flex-none rounded-lg bg-muted object-contain' />
}

function ImageField({ label, value, onChange, target }: { label: string, value: string, onChange: (value: string) => void, target: string }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const src = resolveStoreAssetUrl(value)
  return (
    <Field label={label} hint={error ?? undefined}>
      <div className='flex items-center gap-3'>
        {src ? <img src={src} alt='' className='h-14 w-20 flex-none rounded-lg object-cover' /> : <span className='h-14 w-20 flex-none rounded-lg bg-muted' />}
        <label className={cn(BTN_GHOST, 'cursor-pointer')}>
          {busy ? <SpinnerGap size={14} className='animate-spin' /> : <UploadSimple size={14} />}{txa('Yükle')}
          <input type='file' accept='image/*,video/webm' className='sr-only' onChange={async (event) => {
            const file = event.target.files?.[0]
            if (!file) return
            setBusy(true)
            setError(null)
            try { onChange(await uploadStorefrontVisual(file, target)) } catch (reason) { setError(reason instanceof Error ? txa(reason.message) : txa('Yüklenemedi.')) } finally { setBusy(false) }
          }} />
        </label>
        {value && <button type='button' onClick={() => onChange('')} className='text-[12px] font-bold text-muted-foreground hover:text-foreground'>{txa('Kaldır')}</button>}
      </div>
    </Field>
  )
}

export function ShopAdminProductEditor({ product, initialKind = 'cosmetic', open, onClose, onSaved, allProducts, seasons, settings }: {
  product: ShopAdminProduct | null
  initialKind?: Kind
  open: boolean
  onClose: () => void
  onSaved: () => void
  allProducts: ShopAdminProduct[]
  seasons: ShopAdminSeason[]
  settings: ShopAdminSettings | null
}) {
  const [form, setForm] = useState<Form>(() => toForm(product, initialKind))
  const [cosmetics, setCosmetics] = useState<ShopAdminCosmetic[]>([])
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { setForm(toForm(product, initialKind)); setError(null); setCreating(false) }, [initialKind, product, open])

  const pickerType = form.kind === 'premium' ? 'premium' : null
  useEffect(() => {
    let cancelled = false
    shopAdmin.cosmetics(null, pickerType)
      .then((list) => { if (!cancelled) setCosmetics(list) })
      .catch(() => { if (!cancelled) setCosmetics([]) })
    return () => { cancelled = true }
  }, [pickerType])

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((current) => ({ ...current, [key]: value }))
  const band = settings?.rarity_bands?.[form.rarity]
  const price = Number(form.basePrice || 0)
  const outOfBand = form.kind === 'cosmetic' && band && price > 0 && (price < band[0] || price > band[1])

  // Bundle: sum of single sale prices of pieces and the savings.
  const partsTotal = useMemo(() => form.grants.reduce((sum, grant) => {
    const single = allProducts.find((entry) => entry.kind === 'cosmetic' && entry.grants[0]?.id === grant.id)
    return sum + (single?.basePrice ?? 0)
  }, 0), [allProducts, form.grants])
  const savings = form.kind === 'bundle' && partsTotal > 0 && price > 0 ? Math.round((1 - price / partsTotal) * 100) : null

  const filtered = cosmetics.filter((cosmetic) => {
    if (form.kind !== 'premium' && cosmetic.type === 'premium') return false
    const query = search.trim().toLocaleLowerCase(intlLocale())
    return !query || cosmetic.name.toLocaleLowerCase(intlLocale()).includes(query) || cosmetic.identifier.includes(query)
  }).slice(0, 60)

  const toggleGrant = (cosmetic: ShopAdminCosmetic) => {
    const grant = cosmeticToGrant(cosmetic)
    setForm((current) => {
      const exists = current.grants.some((entry) => entry.id === grant.id)
      if (current.kind !== 'bundle') {
        return {
          ...current,
          grants: [grant],
          title: current.title || cosmetic.name,
          basePrice: current.basePrice || (cosmetic.legacyPrice > 0 ? String(cosmetic.legacyPrice) : ''),
        }
      }
      return { ...current, grants: exists ? current.grants.filter((entry) => entry.id !== grant.id) : [...current.grants, grant] }
    })
  }
  const moveGrant = (index: number, delta: number) => setForm((current) => {
    const grants = [...current.grants]
    const target = index + delta
    if (target < 0 || target >= grants.length) return current
    ;[grants[index], grants[target]] = [grants[target], grants[index]]
    return { ...current, grants }
  })

  const previewType: ShopProductType = form.kind === 'bundle' ? 'bundle' : form.kind === 'premium' ? 'premium' : ((form.grants[0]?.type as ShopProductType | undefined) ?? 'frame')
  const preview = toPreviewCard({
    id: form.id ?? 'yeni', slug: form.slug || 'yeni', kind: form.kind, type: previewType, title: form.title || 'Başlıksız',
    subtitle: form.subtitle || null, rarity: form.rarity, cover: form.cover || null, basePrice: price, grants: form.grants,
    premiumDays: form.kind === 'premium' ? Number(form.premiumDays || 30) : null,
  })

  const save = async (status: Form['status']) => {
    setSaving(true)
    setError(null)
    try {
      const slug = form.slug || slugify(form.title || form.grants[0]?.name || 'urun')
      await shopAdmin.saveProduct({
        id: form.id,
        slug,
        kind: form.kind,
        title: form.title.trim(),
        subtitle: form.subtitle,
        description: form.description,
        rarity: form.rarity,
        basePrice: price,
        status,
        availableFrom: fromLocalInput(form.availableFrom),
        availableUntil: fromLocalInput(form.availableUntil),
        audience: form.audience,
        stockLimit: form.stockLimit ? Number(form.stockLimit) : null,
        seasonId: form.seasonId || null,
        cover: form.cover || null,
        hero: form.hero || null,
        premiumDays: form.kind === 'premium' ? Number(form.premiumDays || 30) : null,
        bundleMode: form.bundleMode,
        giftable: form.giftable,
        hideUntilLaunch: form.hideUntilLaunch,
        tags: form.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
        sortWeight: Number(form.sortWeight || 0),
        grants: form.grants.map((grant) => grant.id),
      })
      onSaved()
      onClose()
    } catch (reason) {
      setError(reason instanceof Error ? txa(reason.message) : txa('Kaydedilemedi.'))
    } finally {
      setSaving(false)
    }
  }

  const removeDraft = async () => {
    if (!form.id) return
    setSaving(true)
    try { await shopAdmin.remove('product', form.id); onSaved(); onClose() } catch (reason) { setError(reason instanceof Error ? txa(reason.message) : txa('Silinemedi.')) } finally { setSaving(false) }
  }

  const canSave = form.title.trim().length > 0 && form.grants.length > 0 && (form.kind !== 'bundle' || form.grants.length >= 2)

  return (
    <Sheet open={open} onOpenChange={(next) => { if (!next && !saving) onClose() }}>
      <SheetContent side='right' className='flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-[760px]'>
        <div className='flex items-center justify-between gap-3 border-b border-border/70 px-6 py-4'>
          <div className='min-w-0'>
            <SheetTitle className='truncate text-lg font-extrabold'>{form.id ? form.title || txa('Ürün') : form.kind === 'bundle' ? txa('Yeni paket') : txa('Yeni ürün')}</SheetTitle>
            <SheetDescription className='text-[12.5px] text-muted-foreground'>{product ? txa('{v1} satış · {v2} Coin', { v1: product.orders, v2: formatNumber(product.revenue) }) : txa('Satışa açmadan önce önizlemeyi kontrol et.')}</SheetDescription>
          </div>
          {product && <StateChip state={product.state} />}
        </div>

        <div className='grid min-h-0 flex-1 gap-6 overflow-y-auto px-6 py-5 md:grid-cols-[minmax(0,1fr)_230px]'>
          <div className='flex min-w-0 flex-col gap-5'>
            <Segments value={form.kind} onChange={(value) => setForm((current) => ({ ...current, kind: value, grants: value === current.kind ? current.grants : [] }))} options={[
              { value: 'cosmetic', label: txa('Tek ürün') },
              { value: 'bundle', label: txa('Paket') },
              { value: 'premium', label: txa('Premium') },
            ]} />

            <section className='flex flex-col gap-2'>
              <div className='flex items-center justify-between'>
                <span className='text-[12px] font-extrabold text-muted-foreground'>
                  {form.kind === 'bundle' ? txa('İçindekiler ({v1})', { v1: form.grants.length }) : form.kind === 'premium' ? 'Premium kaydı' : 'Kozmetik'}
                </span>
                {form.kind !== 'premium' && !creating && (
                  <button type='button' onClick={() => setCreating(true)} className='flex items-center gap-1 text-[12px] font-bold text-primary'><Plus size={12} />{txa('Yeni kozmetik yükle')}</button>
                )}
              </div>
              {form.grants.length > 0 && (
                <ul className='flex flex-col gap-1.5'>
                  {form.grants.map((grant, index) => (
                    <li key={grant.id} className='flex items-center gap-3 rounded-xl border border-border/70 bg-muted/30 px-2.5 py-1.5'>
                      <GrantThumb grant={grant} />
                      <span className='min-w-0 flex-1'>
                        <span className='block truncate text-[13px] font-bold'>{grant.name}</span>
                        <span className='block text-[11.5px] text-muted-foreground'>{TYPE_LABEL[grant.type as ShopProductType] ?? grant.type}</span>
                      </span>
                      {form.kind === 'bundle' && (
                        <>
                          <button type='button' aria-label={txa('Yukarı')} onClick={() => moveGrant(index, -1)} className='flex size-7 items-center justify-center rounded-md hover:bg-accent'><ArrowUp size={12} /></button>
                          <button type='button' aria-label={txa('Aşağı')} onClick={() => moveGrant(index, 1)} className='flex size-7 items-center justify-center rounded-md hover:bg-accent'><ArrowDown size={12} /></button>
                        </>
                      )}
                      <button type='button' aria-label={txa('Çıkar')} onClick={() => set('grants', form.grants.filter((entry) => entry.id !== grant.id))} className='flex size-7 items-center justify-center rounded-md hover:bg-accent'><X size={12} /></button>
                    </li>
                  ))}
                </ul>
              )}
              {creating ? (
                <ShopAdminCosmeticCreator
                  onCancel={() => setCreating(false)}
                  onCreated={(id) => {
                    setCreating(false)
                    void shopAdmin.cosmetics(null, null).then((list) => {
                      setCosmetics(list)
                      const created = list.find((entry) => entry.id === id)
                      if (created) toggleGrant(created)
                    })
                  }}
                />
              ) : (
                <div className='flex flex-col gap-2 rounded-2xl border border-border/70 p-2.5'>
                  <label className='relative flex items-center'>
                    <MagnifyingGlass size={14} className='pointer-events-none absolute left-3 text-muted-foreground' />
                    <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={txa('Kozmetik ara')} className={cn(INPUT, 'pl-8')} />
                  </label>
                  <div className='grid max-h-56 grid-cols-2 gap-1.5 overflow-y-auto sm:grid-cols-3'>
                    {filtered.map((cosmetic) => {
                      const selected = form.grants.some((grant) => grant.id === cosmetic.id)
                      return (
                        <button key={cosmetic.id} type='button' onClick={() => toggleGrant(cosmetic)} className={cn('flex items-center gap-2 rounded-xl border px-2 py-1.5 text-left', selected ? 'border-primary/60 bg-primary/10' : 'border-transparent bg-muted/30 hover:bg-muted/60')}>
                          <GrantThumb grant={cosmeticToGrant(cosmetic)} />
                          <span className='min-w-0'>
                            <span className='block truncate text-[12px] font-bold'>{cosmetic.name}</span>
                            <span className='block truncate text-[10.5px] text-muted-foreground'>{TYPE_LABEL[cosmetic.type as ShopProductType] ?? cosmetic.type} · {cosmetic.owners}{' '}{txa('sahip')}</span>
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </section>

            <div className='grid gap-3 sm:grid-cols-2'>
              <Field label={txa('Başlık')}><input value={form.title} onChange={(event) => set('title', event.target.value)} className={INPUT} maxLength={80} /></Field>
              <Field label={txa('Alt başlık')}><input value={form.subtitle} onChange={(event) => set('subtitle', event.target.value)} className={INPUT} maxLength={120} placeholder={txa('Örn. Ejder Salonu koleksiyonu')} /></Field>
            </div>
            <Field label={txa('Açıklama')} hint={`${form.description.length}/1200 · ${txa('okur detay sayfasında görür')}`}>
              <textarea value={form.description} onChange={(event) => set('description', event.target.value.slice(0, 1200))} rows={3} className={TEXTAREA} />
            </Field>

            <div className='grid gap-3 sm:grid-cols-3'>
              <Field label={txa('Nadirlik')}>
                <select value={form.rarity} onChange={(event) => set('rarity', event.target.value as ShopRarity)} className={INPUT}>
                  {[...SHOP_RARITIES].reverse().map((value) => <option key={value} value={value}>{RARITY_META[value].label}</option>)}
                </select>
              </Field>
              <Field label={txa('Fiyat (Coin)')} hint={band ? txa('{v1} bandı {v2} – {v3}', { v1: RARITY_META[form.rarity].label, v2: formatNumber(band[0]), v3: formatNumber(band[1]) }) : undefined}>
                <input type='number' min={0} value={form.basePrice} onChange={(event) => set('basePrice', event.target.value)} className={cn(INPUT, outOfBand && 'border-amber-400/70')} />
              </Field>
              {form.kind === 'premium' ? (
                <Field label={txa('Süre (gün)')}><input type='number' min={1} max={365} value={form.premiumDays} onChange={(event) => set('premiumDays', event.target.value)} className={INPUT} /></Field>
              ) : (
                <Field label={txa('Stok (isteğe bağlı)')}><input type='number' min={1} value={form.stockLimit} onChange={(event) => set('stockLimit', event.target.value)} className={INPUT} placeholder={txa('Sınırsız')} /></Field>
              )}
            </div>
            {outOfBand && <p className='-mt-2 text-[12px] text-amber-600 dark:text-amber-300'>{txa('Fiyat nadirlik bandının dışında; yine de kaydedebilirsin.')}</p>}
            {form.kind === 'bundle' && (
              <div className='flex flex-col gap-3 rounded-2xl bg-muted/30 p-3.5'>
                <div className='flex flex-wrap justify-between gap-2 text-[13px]'>
                  <span className='text-muted-foreground'>{txa('Parçalar tek tek:')}{' '}<b className='text-foreground'>{formatNumber(partsTotal)}</b>{' '}{txa('Coin')}</span>
                  {savings !== null && <span className={savings >= 15 && savings <= 30 ? 'text-primary' : 'text-amber-600 dark:text-amber-300'}>{txa('Okur tasarrufu %')}{savings}{' '}{txa('(önerilen %15–30)')}</span>}
                </div>
                <Field label={txa('Sahip olunan parçalar')}>
                  <select value={form.bundleMode} onChange={(event) => set('bundleMode', event.target.value as Form['bundleMode'])} className={INPUT}>
                    <option value='proportional'>{txa('Oranla düş (1/3\'ü varsa 1/3 indirim)')}</option>
                    <option value='fixed'>{txa('Sabit fiyat (sahip olduğu parçalar verilmez)')}</option>
                    <option value='exclusive'>{txa('Bir parçası olan alamaz')}</option>
                  </select>
                </Field>
              </div>
            )}

            <div className='grid gap-3 sm:grid-cols-2'>
              <Field label={txa('Satış başlar')} hint={txa('Boşsa hemen (sezon varsa sezonla)')}><input type='datetime-local' value={form.availableFrom} onChange={(event) => set('availableFrom', event.target.value)} className={INPUT} /></Field>
              <Field label={txa('Satış biter')} hint={txa('Boşsa süresiz (sezon varsa sezonla)')}><input type='datetime-local' value={form.availableUntil} onChange={(event) => set('availableUntil', event.target.value)} className={INPUT} /></Field>
              <Field label={txa('Kimler alabilir')}>
                <select value={form.audience} onChange={(event) => set('audience', event.target.value as Form['audience'])} className={INPUT}>
                  <option value='everyone'>{txa('Herkes')}</option>
                  <option value='premium'>{txa('Yalnız Premium')}</option>
                  <option value='reward_only'>{txa('Satılmaz, yalnız ödül')}</option>
                </select>
              </Field>
              <Field label={txa('Sezon')}>
                <select value={form.seasonId} onChange={(event) => set('seasonId', event.target.value)} className={INPUT}>
                  <option value=''>{txa('Sezonsuz')}</option>
                  {seasons.map((season) => <option key={season.id} value={season.id}>{season.name}</option>)}
                </select>
              </Field>
            </div>
            <div className='flex flex-wrap gap-x-6 gap-y-2 text-[13px]'>
              <label className='flex items-center gap-2'><input type='checkbox' checked={form.giftable} onChange={(event) => set('giftable', event.target.checked)} className='size-4 accent-[hsl(var(--primary))]' />{txa('Hediye edilebilir')}</label>
              <label className='flex items-center gap-2'><input type='checkbox' checked={form.hideUntilLaunch} onChange={(event) => set('hideUntilLaunch', event.target.checked)} className='size-4 accent-[hsl(var(--primary))]' />{txa('Satışa çıkana kadar gizli ("Gizli parça")')}</label>
            </div>
            <div className='grid gap-3 sm:grid-cols-2'>
              <ImageField label={txa('Kart kapağı (isteğe bağlı)')} value={form.cover} onChange={(value) => set('cover', value)} target={`shop/products/${form.slug || 'yeni'}`} />
              <ImageField label={txa('Detay sahnesi (isteğe bağlı)')} value={form.hero} onChange={(value) => set('hero', value)} target={`shop/products/${form.slug || 'yeni'}`} />
            </div>
            <div className='grid gap-3 sm:grid-cols-2'>
              <Field label={txa('Etiketler')} hint={txa('Virgülle ayır; aramada kullanılır')}><input value={form.tags} onChange={(event) => set('tags', event.target.value)} className={INPUT} /></Field>
              <Field label={txa('Öne çıkarma ağırlığı')} hint={txa('Büyük olan katalogda önce gelir')}><input type='number' value={form.sortWeight} onChange={(event) => set('sortWeight', event.target.value)} className={INPUT} /></Field>
            </div>
          </div>

          <aside className='flex flex-col gap-3 md:sticky md:top-0 md:self-start'>
            <span className='text-[12px] font-extrabold text-muted-foreground'>{txa('Önizleme')}</span>
            <div className='overflow-hidden rounded-[18px] border border-border/70 bg-card'>
              <ShopPreview card={preview} className='aspect-[5/4]' />
              <div className='flex flex-col gap-0.5 px-3.5 py-3'>
                <span className='truncate text-[14px] font-bold'>{preview.title}</span>
                <span className='text-[11.5px] text-muted-foreground'>{TYPE_LABEL[preview.type]}</span>
                <span className='mt-1 text-[14px] font-extrabold text-amber-600 dark:text-amber-300'>{formatNumber(price)}{' '}{txa('Coin')}</span>
              </div>
            </div>
            {product && product.issues.length > 0 && (
              <ul className='flex flex-col gap-1.5 rounded-2xl bg-muted/30 p-3 text-[12px]'>
                {product.issues.map((issue) => (
                  <li key={issue.code} className={issue.level === 'error' ? 'text-rose-600 dark:text-rose-300' : 'text-amber-600 dark:text-amber-300'}>• {ISSUE_LABEL[issue.code] ?? issue.code}</li>
                ))}
              </ul>
            )}
            {product && product.campaigns.length > 0 && (
              <div className='rounded-2xl bg-muted/30 p-3 text-[12px] text-muted-foreground'>{txa('Kampanyalarda:')}{' '}{product.campaigns.map((campaign) => campaign.name).join(', ')}</div>
            )}
          </aside>
        </div>

        <div className='flex flex-wrap items-center gap-2 border-t border-border/70 px-6 py-4'>
          {error && <span className='mr-auto text-[12.5px] text-rose-600 dark:text-rose-300' role='alert'>{error}</span>}
          {product?.status === 'draft' && product.orders === 0 && <button type='button' onClick={() => { void removeDraft() }} disabled={saving} className={cn(BTN_DANGER, !error && 'mr-auto')}>{txa('Taslağı sil')}</button>}
          {product && product.status !== 'archived' && <button type='button' onClick={() => { void save('archived') }} disabled={saving || !canSave} className={BTN_GHOST}>{txa('Arşivle')}</button>}
          <button type='button' onClick={() => { void save('draft') }} disabled={saving || !canSave} className={BTN_GHOST}>{txa('Taslak kaydet')}</button>
          <button type='button' onClick={() => { void save('published') }} disabled={saving || !canSave} className={BTN_PRIMARY}>
            {saving && <SpinnerGap size={14} className='animate-spin' />}{form.availableFrom && new Date(form.availableFrom).getTime() > Date.now() ? txa('Planla') : txa('Yayınla')}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
