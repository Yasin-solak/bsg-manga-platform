import { useState } from 'react'
import { SpinnerGap, UploadSimple } from '@phosphor-icons/react'
import type { ProfileEffectLayerBlendMode, StoreProfileEffectMediaMeta } from '@/data/storeProducts'
import { cn } from '@/lib/utils'
import { buildSingleLayerEffectManifest } from '@/services/profileEffectManifest'
import { shopAdmin } from '@/services/shopAdminService'
import { uploadProfileEffectAsset, uploadStoreAsset } from '@/services/storageService'
import { Field, Segments } from './ShopAdminKit'
import { BTN_GHOST, BTN_PRIMARY, INPUT } from './shopAdminFormat'
import { txa } from '@/i18n/activeLocale'

/*
 * New cosmetic record: frame (live layer + poster), background (image / video), profile effect
 * (poster + optional intro + loop, Discord style). A record is not on sale; it sells once linked to a product.
 * For effects, media info and layout (manifest) are saved too: the profile and hover card play the
 * intro once, then the loop;
 * blend mode is 'normal' for transparent images, 'screen' for black background video.
 */

type CosmeticType = 'frame' | 'background' | 'profile_effect'
type SlotKey = 'asset' | 'poster' | 'intro' | 'profile'

const SLOTS: Record<CosmeticType, Array<{ key: SlotKey, label: string, hint: string, required: boolean }>> = {
  frame: [
    { key: 'asset', get label() { return txa('Çerçeve katmanı') }, get hint() { return txa('PNG / WebP / GIF, şeffaf arka plan') }, required: true },
    { key: 'poster', get label() { return txa('Durağan poster') }, get hint() { return txa('Kartlarda ilk kare (isteğe bağlı)') }, required: false },
  ],
  background: [
    { key: 'asset', get label() { return txa('Arka plan') }, get hint() { return txa('Görsel ya da MP4 / WebM video') }, required: true },
  ],
  profile_effect: [
    { key: 'poster', get label() { return txa('Poster') }, get hint() { return txa('Mağaza kartında görünen kare') }, required: true },
    { key: 'intro', get label() { return txa('Giriş animasyonu') }, get hint() { return txa('Bir kez oynar, sonra döngüye geçer (isteğe bağlı)') }, required: false },
    { key: 'profile', get label() { return txa('Döngü animasyonu') }, get hint() { return txa('APNG / animasyonlu WebP / GIF ya da WebM / MP4; sürekli oynar') }, required: true },
  ],
}

const BLENDS: Array<{ value: ProfileEffectLayerBlendMode, label: string }> = [
  { value: 'normal', get label() { return txa('Şeffaf görsel (normal)') } },
  { value: 'screen', get label() { return txa('Siyah zeminli (ekran)') } },
]

export function ShopAdminCosmeticCreator({ onCreated, onCancel }: { onCreated: (id: string) => void, onCancel: () => void }) {
  const [type, setType] = useState<CosmeticType>('frame')
  const [name, setName] = useState('')
  const [files, setFiles] = useState<Partial<Record<SlotKey, File>>>({})
  const [blend, setBlend] = useState<ProfileEffectLayerBlendMode>('normal')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const slots = SLOTS[type]
  const ready = name.trim().length > 0 && slots.every((slot) => !slot.required || files[slot.key])

  const submit = async () => {
    if (!ready) return
    setBusy(true)
    setError(null)
    try {
      const urls: Partial<Record<SlotKey, string>> = {}
      let mediaMeta: StoreProfileEffectMediaMeta = {}
      for (const slot of slots) {
        const file = files[slot.key]
        if (!file) continue
        if (type === 'profile_effect') {
          const variant = slot.key === 'poster' ? 'card-asset' : slot.key === 'intro' ? 'profile-intro' : 'profile-loop'
          const uploaded = await uploadProfileEffectAsset(file, variant)
          urls[slot.key] = uploaded.url
          mediaMeta = { ...mediaMeta, ...uploaded.mediaMetaPatch }
        } else {
          urls[slot.key] = await uploadStoreAsset(file, type, slot.key === 'poster' ? 'poster' : 'live')
        }
      }
      const loopMeta = mediaMeta.profileLoop
      if (loopMeta) mediaMeta = { ...mediaMeta, cardLoop: loopMeta, hoverLoop: loopMeta }
      const introMeta = mediaMeta.profileIntro
      if (introMeta) mediaMeta = { ...mediaMeta, cardIntro: introMeta, hoverIntro: introMeta }
      const id = await shopAdmin.createCosmetic({
        type,
        name: name.trim(),
        assetUrl: urls.asset ?? urls.profile ?? null,
        posterUrl: urls.poster ?? null,
        profileUrl: urls.profile ?? null,
        introUrl: urls.intro ?? null,
        ...(type === 'profile_effect' && urls.profile ? {
          mediaMeta,
          effectManifest: buildSingleLayerEffectManifest({
            assetUrl: urls.profile,
            label: name.trim(),
            blendMode: blend,
            durationMs: loopMeta?.durationMs,
            intro: urls.intro ? { assetUrl: urls.intro, durationMs: introMeta?.durationMs } : null,
          }),
        } : {}),
      })
      onCreated(id)
    } catch (reason) {
      setError(reason instanceof Error ? txa(reason.message) : txa('Kozmetik oluşturulamadı.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className='flex flex-col gap-3 rounded-2xl border border-primary/30 bg-primary/[0.04] p-4'>
      <span className='text-[13px] font-extrabold'>{txa('Yeni kozmetik yükle')}</span>
      <Segments value={type} onChange={(value) => { setType(value); setFiles({}) }} options={[
        { value: 'frame', label: txa('Çerçeve') },
        { value: 'profile_effect', label: txa('Profil efekti') },
      ]} />
      <Field label={txa('Kozmetik adı')}>
        <input value={name} onChange={(event) => setName(event.target.value)} className={INPUT} placeholder={txa('Örn. Altın Alev')} />
      </Field>
      {type === 'profile_effect' && (
        <Field label={txa('Karışım modu')}>
          <Segments value={blend} onChange={setBlend} options={BLENDS} />
        </Field>
      )}
      <div className='grid gap-2 sm:grid-cols-2'>
        {slots.map((slot) => (
          <label key={slot.key} className={cn('flex cursor-pointer flex-col gap-1 rounded-xl border border-dashed px-3 py-2.5', files[slot.key] ? 'border-primary/50' : 'border-border')}>
            <span className='flex items-center gap-2 text-[12.5px] font-bold'>
              <UploadSimple size={14} />{slot.label}{slot.required ? ' *' : ''}
            </span>
            <span className='truncate text-[11.5px] text-muted-foreground'>{files[slot.key]?.name ?? slot.hint}</span>
            <input
              type='file'
              className='sr-only'
              accept='image/*,video/mp4,video/webm'
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (!file) return
                setFiles((current) => ({ ...current, [slot.key]: file }))
                // Video effects usually come on a black background; transparent images stay normal.
                if (slot.key === 'profile') setBlend(file.type.startsWith('video/') ? 'screen' : 'normal')
              }}
            />
          </label>
        ))}
      </div>
      {error && <p className='text-[12.5px] text-rose-600 dark:text-rose-300' role='alert'>{error}</p>}
      <div className='flex justify-end gap-2'>
        <button type='button' onClick={onCancel} className={BTN_GHOST}>{txa('Vazgeç')}</button>
        <button type='button' onClick={() => { void submit() }} disabled={!ready || busy} className={BTN_PRIMARY}>
          {busy && <SpinnerGap size={14} className='animate-spin' />}{txa('Yükle ve ekle')}
        </button>
      </div>
    </div>
  )
}
