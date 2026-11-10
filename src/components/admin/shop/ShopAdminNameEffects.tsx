import { useEffect, useMemo, useState } from 'react'
import { Plus, SpinnerGap, UploadSimple } from '@phosphor-icons/react'
import { buildNameTextStyleVars, getNameTextStyleClassName, type NameTextColorId } from '@/data/nameTextEffects'
import { cn } from '@/lib/utils'
import { loadNameEffects, previewNameEffect, registerAdminNameEffects } from '@/lib/nameEffectRegistry'
import { resolveStoreAssetUrl } from '@/services/assetUrlService'
import { listAdminNameEffects, saveAdminNameEffect, type AdminNameEffect, type AdminNameEffectInput } from '@/services/nameEffectAdminService'
import { uploadStorefrontVisual } from '@/services/storageService'
import { toast } from '@/services/toastService'
import { useShopQuery } from '@/pages/shop/useShopQuery'
import { AdminPanel, EmptyNote, Field, Segments } from './ShopAdminKit'
import { BTN_GHOST, BTN_PRIMARY, INPUT, STATE_META } from './shopAdminFormat'
import { txa } from '@/i18n/activeLocale'

/*
 * Name effects: an animated image (WebP / APNG / GIF) placed behind / in front of the name or inside the letters.
 * Upload, adjust overflow margin and layer, watch the live preview, publish. Published effects
 * appear under "Animated effects" in the reader's name style picker (Premium).
 */

const PREVIEW_SLUG = 'onizleme-taslak'
const PREVIEW_COLORS: NameTextColorId[] = ['neutral', 'gold', 'cyan', 'pink']

const EMPTY: AdminNameEffectInput = {
  name: '', description: null, assetUrl: '', overflowX: 18, overflowY: 70, offsetY: 0,
  blend: 'normal', layer: 'back', textGlow: null, status: 'draft', sortWeight: 0,
}

function PreviewName({ slug, colorId, size, text }: { slug: string, colorId: NameTextColorId, size: number, text: string }) {
  return (
    <span
      className={getNameTextStyleClassName({ effectId: `fx-${slug}`, colorId, fontId: 'display' })}
      style={{ ...buildNameTextStyleVars(colorId, colorId), fontSize: size }}
    >
      {text}
    </span>
  )
}

function Slider({ label, value, min, max, onChange, suffix = '%' }: { label: string, value: number, min: number, max: number, onChange: (value: number) => void, suffix?: string }) {
  return (
    <Field label={`${label}: ${value}${suffix}`}>
      <input type='range' min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} className='w-full accent-[hsl(var(--foreground))]' />
    </Field>
  )
}

function Editor({ initial, onSaved, onCancel }: { initial: AdminNameEffect | null, onSaved: () => void, onCancel: () => void }) {
  const [form, setForm] = useState<AdminNameEffectInput>(initial ? { ...initial } : EMPTY)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [colorId, setColorId] = useState<NameTextColorId>('gold')
  const set = <K extends keyof AdminNameEffectInput>(key: K, value: AdminNameEffectInput[K]) => setForm((current) => ({ ...current, [key]: value }))
  const inside = form.layer === 'inside'

  // Live preview: unsaved settings apply through a temporary rule.
  useEffect(() => {
    if (!form.assetUrl) {
      previewNameEffect(null)
      return undefined
    }
    previewNameEffect({
      slug: PREVIEW_SLUG, name: form.name || txa('Önizleme'), description: null, assetUrl: form.assetUrl,
      overflowX: form.overflowX, overflowY: form.overflowY, offsetY: form.offsetY, blend: form.blend, layer: form.layer,
      textGlow: form.textGlow && /^#[0-9a-fA-F]{6}$/.test(form.textGlow) ? form.textGlow : null,
    })
    return () => previewNameEffect(null)
  }, [form])

  const upload = async (file: File | undefined) => {
    if (!file) return
    setUploading(true)
    try {
      set('assetUrl', await uploadStorefrontVisual(file, 'name-effects'))
      toast.success(txa('Efekt görseli yüklendi.'))
    } catch (error) {
      toast.error(error instanceof Error ? txa(error.message) : txa('Yüklenemedi.'))
    } finally {
      setUploading(false)
    }
  }

  const save = async () => {
    setSaving(true)
    try {
      await saveAdminNameEffect(form)
      toast.success(txa('İsim efekti kaydedildi.'))
      await loadNameEffects(true)
      onSaved()
    } catch (error) {
      toast.error(error instanceof Error ? txa(error.message) : txa('Kaydedilemedi.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <AdminPanel
      title={initial ? txa('Düzenle: {v1}', { v1: initial.name }) : txa('Yeni isim efekti')}
      meta={txa('Animasyonlu WebP, APNG ya da GIF. Saydam arka planlı, yatay bir şerit olmalı; isim ortadaki banda gelir.')}
      action={(
        <span className='flex gap-2'>
          <button type='button' onClick={onCancel} className={BTN_GHOST}>{txa('Vazgeç')}</button>
          <button type='button' disabled={saving || uploading || !form.name.trim() || !form.assetUrl} onClick={() => { void save() }} className={BTN_PRIMARY}>
            {saving && <SpinnerGap size={14} className='animate-spin' />}{txa('Kaydet')}
          </button>
        </span>
      )}
    >
      <div className='grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]'>
        <div className='flex flex-col gap-4'>
          <div className='grid gap-3 sm:grid-cols-2'>
            <Field label={txa('Efekt adı')}><input value={form.name} onChange={(event) => set('name', event.target.value)} className={INPUT} placeholder={txa('Örn. Alev')} maxLength={40} /></Field>
            <Field label={txa('Sıra (büyük önce)')}><input type='number' value={form.sortWeight} onChange={(event) => set('sortWeight', Number(event.target.value))} className={INPUT} /></Field>
          </div>
          <Field label={txa('Açıklama')}><input value={form.description ?? ''} onChange={(event) => set('description', event.target.value || null)} className={INPUT} maxLength={160} placeholder={txa('Okura görünen kısa açıklama')} /></Field>
          <label className={cn('flex cursor-pointer items-center gap-3 rounded-xl border border-dashed px-4 py-3', form.assetUrl ? 'border-foreground/40' : 'border-border')}>
            {uploading ? <SpinnerGap size={18} className='animate-spin' /> : <UploadSimple size={18} />}
            <span className='min-w-0 flex-1'>
              <span className='block text-[13px] font-bold'>{form.assetUrl ? txa('Görseli değiştir') : txa('Efekt görseli yükle')}</span>
              <span className='block truncate text-[11.5px] text-muted-foreground'>{form.assetUrl || 'webp / png (APNG) / gif'}</span>
            </span>
            {form.assetUrl && <img src={resolveStoreAssetUrl(form.assetUrl) ?? form.assetUrl} alt='' className='h-10 w-24 rounded-lg bg-black object-contain' />}
            <input type='file' accept='image/webp,image/png,image/gif' className='hidden' onChange={(event) => { void upload(event.target.files?.[0]) }} />
          </label>
          <div className='grid gap-3 sm:grid-cols-3'>
            <Slider label={inside ? txa('Yatay yakınlaştırma') : txa('Yatay taşma')} value={form.overflowX} min={0} max={120} onChange={(value) => set('overflowX', value)} />
            <Slider label={inside ? txa('Dikey yakınlaştırma') : txa('Dikey taşma')} value={form.overflowY} min={0} max={200} onChange={(value) => set('overflowY', value)} />
            <Slider label={txa('Dikey kaydırma')} value={form.offsetY} min={-100} max={100} onChange={(value) => set('offsetY', value)} />
          </div>
          <div className='grid gap-3 sm:grid-cols-2'>
            <Field label={txa('Katman')} hint={inside ? txa('Animasyon harflerin içinde oynar; isim rengi yerine görsel görünür.') : undefined}>
              <Segments value={form.layer} onChange={(value) => set('layer', value)} options={[{ value: 'back', label: txa('İsmin arkası') }, { value: 'front', label: txa('İsmin önü') }, { value: 'inside', label: txa('İsmin içi') }]} />
            </Field>
            <Field label={txa('Karışım')} hint={inside ? txa('İsmin içi katmanında kullanılmaz.') : undefined}>
              <select value={form.blend} disabled={inside} onChange={(event) => set('blend', event.target.value as AdminNameEffectInput['blend'])} className={cn(INPUT, inside && 'opacity-50')}>
                <option value='normal'>{txa('Normal')}</option>
                <option value='screen'>{txa('Screen (parlak)')}</option>
                <option value='lighten'>{txa('Lighten')}</option>
                <option value='plus-lighter'>{txa('Plus lighter')}</option>
              </select>
            </Field>
          </div>
          <div className='grid gap-3 sm:grid-cols-2'>
            <Field label={txa('Yazı parlaması')} hint={txa('Boş bırakılırsa okurun isim rengi aynen kalır.')}>
              <span className='flex gap-2'>
                <input type='color' value={form.textGlow ?? '#ffffff'} onChange={(event) => set('textGlow', event.target.value)} className='h-10 w-12 rounded-lg border border-border bg-transparent' />
                <input value={form.textGlow ?? ''} onChange={(event) => set('textGlow', event.target.value || null)} className={INPUT} placeholder='#f97316' />
              </span>
            </Field>
            <Field label={txa('Durum')}>
              <Segments value={form.status} onChange={(value) => set('status', value)} options={[{ value: 'draft', label: txa('Taslak') }, { value: 'published', label: txa('Yayında') }, { value: 'archived', label: txa('Arşiv') }]} />
            </Field>
          </div>
        </div>

        <div className='flex flex-col gap-3' data-name-effect-preview>
          <div className='flex items-center justify-between'>
            <span className='text-[12px] font-extrabold text-muted-foreground'>{txa('Canlı önizleme')}</span>
            <span className='flex gap-1'>
              {PREVIEW_COLORS.map((value) => (
                <button key={value} type='button' onClick={() => setColorId(value)} aria-pressed={colorId === value} className={cn('h-7 rounded-full border px-2.5 text-[11.5px] font-bold', colorId === value ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground')}>
                  {value}
                </button>
              ))}
            </span>
          </div>
          <div className='flex min-h-[320px] flex-col items-center justify-center gap-12 overflow-hidden rounded-2xl bg-[#07080b] p-8'>
            {form.assetUrl ? (
              <>
                <PreviewName slug={PREVIEW_SLUG} colorId={colorId} size={44} text='Demo' />
                <PreviewName slug={PREVIEW_SLUG} colorId={colorId} size={22} text='uzunkullaniciadi' />
                <span className='flex items-center gap-2 text-[14px] text-white/70'>
                  <span className='size-7 rounded-full bg-white/10' />
                  <PreviewName slug={PREVIEW_SLUG} colorId={colorId} size={14} text={txa('yorumdaki ad')} />
                  <span>{txa('· 2 dk önce')}</span>
                </span>
              </>
            ) : (
              <span className='text-[13px] text-white/50'>{txa('Görsel yükleyince isimler burada efektle görünür.')}</span>
            )}
          </div>
        </div>
      </div>
    </AdminPanel>
  )
}

export function ShopAdminNameEffects() {
  const { data, loading, error, reload } = useShopQuery('admin-name-effects', listAdminNameEffects)
  const [editing, setEditing] = useState<AdminNameEffect | 'new' | null>(null)
  const items = useMemo(() => data ?? [], [data])
  useEffect(() => {
    registerAdminNameEffects(items)
    return () => registerAdminNameEffects([])
  }, [items])

  return (
    <div className='flex flex-col gap-4' data-testid='shop-admin-name-effects'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <p className='max-w-[720px] text-[13px] text-muted-foreground'>{txa('Premium okurların adının etrafında oynayan animasyonlu efektler. Yayındaki efektler isim stili seçicisinde görünür; arşivlenen efekti seçmiş okurların adı sade görünür.')}</p>
        {!editing && <button type='button' onClick={() => setEditing('new')} className={BTN_PRIMARY}><Plus size={14} weight='bold' />{txa('Yeni efekt')}</button>}
      </div>
      {editing && (
        <Editor
          key={editing === 'new' ? 'new' : editing.id}
          initial={editing === 'new' ? null : editing}
          onCancel={() => setEditing(null)}
          onSaved={() => { setEditing(null); reload() }}
        />
      )}
      {error && <p className='text-[13px] text-muted-foreground'>{error}</p>}
      {loading && !data ? <div className='h-48 animate-pulse rounded-[18px] bg-muted/40' /> : items.length === 0 ? <EmptyNote>{txa('Henüz isim efekti yok.')}</EmptyNote> : (
        <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-3'>
          {items.map((effect) => (
            <button key={effect.id} type='button' onClick={() => setEditing(effect)} className='flex flex-col gap-3 rounded-[18px] border border-border/70 bg-card p-3 text-left transition-colors hover:border-foreground/25'>
              <span className='flex h-24 items-center justify-center overflow-hidden rounded-xl bg-[#07080b]'>
                <PreviewName slug={effect.slug} colorId='gold' size={24} text='Demo' />
              </span>
              <span className='flex items-center justify-between gap-2 px-1'>
                <span className='min-w-0'>
                  <span className='block truncate text-[14px] font-extrabold'>{effect.name}</span>
                  <span className='block truncate text-[12px] text-muted-foreground'>fx-{effect.slug}</span>
                </span>
                <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-bold', STATE_META[effect.status === 'published' ? 'live' : effect.status]?.tone ?? 'bg-accent')}>
                  {effect.status === 'published' ? txa('Yayında') : effect.status === 'draft' ? txa('Taslak') : txa('Arşiv')}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
