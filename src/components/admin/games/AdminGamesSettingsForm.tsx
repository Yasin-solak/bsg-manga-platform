import { useState } from 'react'
import { Loader2, Plus, Save, Trash2 } from 'lucide-react'
import { AdminConfirmDialog, type AdminConfirmRequest } from '@/components/admin/shared/AdminConfirmDialog'
import { AdminSurface } from '@/components/admin/shared/AdminSurface'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import {
  updateAdminDailyGameSettings,
  validateDailyGameSettings,
  type DailyGameSettings,
} from '@/services/adminDailyGamesService'
import { toast } from '@/services/toastService'
import { txa } from '@/i18n/activeLocale'

/*
 * Rules: turning games on/off, shared daily coin cap, guess rewards, attempts, run and
 * match tiers, Panel Hunt threshold. Saving goes live immediately (the server reads this row).
 */

const GAME_LABELS: Array<[keyof DailyGameSettings['enabled'], string]> = [
  ['cover', 'Günün Kapağı'],
  ['panel', 'Panel Avı'],
  ['runner', 'Mürek Koşusu'],
  ['match', 'Kapak Eşle'],
]

const toInt = (value: string) => {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : 0
}

function NumberField({ label, value, onChange, hint, testId }: { label: string, value: number, onChange: (value: number) => void, hint?: string, testId?: string }) {
  return (
    <label className='block space-y-1 text-xs font-medium'>
      {label}
      <Input type='number' inputMode='numeric' value={value} onChange={(event) => onChange(toInt(event.currentTarget.value))} data-testid={testId} />
      {hint && <span className='block text-[11px] font-normal text-muted-foreground'>{hint}</span>}
    </label>
  )
}

export function AdminGamesSettingsForm({ settings, onSaved }: { settings: DailyGameSettings, onSaved: (next: DailyGameSettings) => void }) {
  const [draft, setDraft] = useState<DailyGameSettings>(settings)
  const [saving, setSaving] = useState(false)
  const [confirm, setConfirm] = useState<AdminConfirmRequest | null>(null)
  const patch = (next: Partial<DailyGameSettings>) => setDraft((current) => ({ ...current, ...next }))
  const dirty = JSON.stringify(draft) !== JSON.stringify(settings)

  // A save that closes an open game goes live immediately: it first says which games will close.
  const requestSave = () => {
    const problem = validateDailyGameSettings(draft)
    if (problem) { toast.error(problem); return }
    const closing = GAME_LABELS.filter(([key]) => settings.enabled[key] && !draft.enabled[key]).map(([, label]) => txa(label))
    if (closing.length === 0) { void save(); return }
    setConfirm({
      title: closing.length > 1 ? txa('{v1} oyunu kapat', { v1: closing.length }) : txa('{v1} kapat', { v1: closing[0] }),
      subject: closing.join(', '),
      consequence: txa('Kaydedince hemen geçerli olur: oyuncular "Şu an kapalı" görür, sunucu yeni tahmin ve denemeleri reddeder. Bugün kazanılmış coinler geri alınmaz.'),
      confirmLabel: txa('Kaydet ve kapat'),
      destructive: true,
      run: save,
    })
  }

  const save = async () => {
    setSaving(true)
    try {
      const { updatedAt: _ignored, ...payload } = draft
      const next = await updateAdminDailyGameSettings(payload)
      setDraft(next)
      onSaved(next)
      toast.success(txa('Oyun kuralları kaydedildi; hemen geçerli.'))
    } catch (error) {
      toast.error(error instanceof Error ? txa(error.message) : txa('Kaydedilemedi.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className='space-y-4' data-testid='admin-games-settings'>
      <AdminSurface className='p-4'>
        <h3 className='text-sm font-semibold'>{txa('Oyunlar')}</h3>
        <p className='mb-3 text-xs text-muted-foreground'>{txa('Kapalı oyun, kullanıcıya "Şu an kapalı" görünür; sunucu tahmin ve denemeleri reddeder.')}</p>
        <div className='grid gap-2 sm:grid-cols-2'>
          {GAME_LABELS.map(([key, label]) => (
            <label key={key} className='flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm'>
              {txa(label)}
              <Switch checked={draft.enabled[key]} onCheckedChange={(checked) => patch({ enabled: { ...draft.enabled, [key]: checked } })} data-testid={`admin-games-toggle-${key}`} />
            </label>
          ))}
        </div>
      </AdminSurface>

      <div className='grid gap-4 lg:grid-cols-2'>
        <AdminSurface className='space-y-3 p-4'>
          <h3 className='text-sm font-semibold'>{txa('Coin ekonomisi')}</h3>
          <NumberField label={txa('Günlük oyun coin tavanı')} value={draft.dailyCoinCap} onChange={(value) => patch({ dailyCoinCap: value })} hint={txa('Tüm oyunlar toplamı, kullanıcı başına gün içinde.')} testId='admin-games-cap' />
          <div className='space-y-1'>
            <p className='text-xs font-medium'>{txa('Günün Kapağı / Panel Avı ödülleri (1.–6. tahmin)')}</p>
            <div className='grid grid-cols-6 gap-1.5'>
              {draft.guessRewards.map((value, index) => (
                <Input key={index} type='number' aria-label={txa('{v1}. tahmin ödülü', { v1: index + 1 })} value={value} onChange={(event) => patch({ guessRewards: draft.guessRewards.map((item, itemIndex) => (itemIndex === index ? toInt(event.currentTarget.value) : item)) })} />
              ))}
            </div>
          </div>
          <NumberField label={txa('Atari deneme hakkı (gün)')} value={draft.runAttempts} onChange={(value) => patch({ runAttempts: value })} hint={txa('Mürek Koşusu ve Kapak Eşle için ayrı ayrı.')} />
          <NumberField label={txa('Panel Avı açılış eşiği (seri)')} value={draft.panelMinSeries} onChange={(value) => patch({ panelMinSeries: value })} hint={txa('Bu kadar seride gerçek bölüm sayfası olunca açılır.')} />
        </AdminSurface>

        <AdminSurface className='space-y-4 p-4'>
          <div>
            <div className='mb-1.5 flex items-center justify-between'>
              <h3 className='text-sm font-semibold'>{txa('Mürek Koşusu kademeleri')}</h3>
              <Button type='button' size='sm' variant='ghost' onClick={() => patch({ runnerTiers: [...draft.runnerTiers, { score: 2500, coin: 10 }] })}><Plus className='size-3.5' />{txa('Kademe')}</Button>
            </div>
            <div className='space-y-1.5'>
              {draft.runnerTiers.map((tier, index) => (
                <div key={index} className='flex items-center gap-2 text-xs'>
                  <Input type='number' aria-label={txa('Puan eşiği')} value={tier.score} onChange={(event) => patch({ runnerTiers: draft.runnerTiers.map((item, itemIndex) => (itemIndex === index ? { ...item, score: toInt(event.currentTarget.value) } : item)) })} />
                  <span className='shrink-0 text-muted-foreground'>{txa('puan →')}</span>
                  <Input type='number' aria-label={txa('Coin')} value={tier.coin} onChange={(event) => patch({ runnerTiers: draft.runnerTiers.map((item, itemIndex) => (itemIndex === index ? { ...item, coin: toInt(event.currentTarget.value) } : item)) })} />
                  <span className='shrink-0 text-muted-foreground'>coin</span>
                  <Button type='button' size='icon' variant='ghost' aria-label={txa('Kademeyi sil')} onClick={() => patch({ runnerTiers: draft.runnerTiers.filter((_, itemIndex) => itemIndex !== index) })}><Trash2 className='size-3.5' /></Button>
                </div>
              ))}
            </div>
            <p className='mt-1 text-[11px] text-muted-foreground'>{txa('Sunucu skoru süreyle kırptığı için (saniyede en fazla 12 puan) yüksek eşikler uzun koşu ister.')}</p>
          </div>
          <div>
            <div className='mb-1.5 flex items-center justify-between'>
              <h3 className='text-sm font-semibold'>{txa('Kapak Eşle kademeleri')}</h3>
              <Button type='button' size='sm' variant='ghost' onClick={() => patch({ matchTiers: [...draft.matchTiers, { seconds: 120, coin: 3 }] })}><Plus className='size-3.5' />{txa('Kademe')}</Button>
            </div>
            <div className='space-y-1.5'>
              {draft.matchTiers.map((tier, index) => (
                <div key={index} className='flex items-center gap-2 text-xs'>
                  <span className='shrink-0 text-muted-foreground'>≤</span>
                  <Input type='number' aria-label={txa('Saniye eşiği')} value={tier.seconds} onChange={(event) => patch({ matchTiers: draft.matchTiers.map((item, itemIndex) => (itemIndex === index ? { ...item, seconds: toInt(event.currentTarget.value) } : item)) })} />
                  <span className='shrink-0 text-muted-foreground'>{txa('sn →')}</span>
                  <Input type='number' aria-label={txa('Coin')} value={tier.coin} onChange={(event) => patch({ matchTiers: draft.matchTiers.map((item, itemIndex) => (itemIndex === index ? { ...item, coin: toInt(event.currentTarget.value) } : item)) })} />
                  <span className='shrink-0 text-muted-foreground'>coin</span>
                  <Button type='button' size='icon' variant='ghost' aria-label={txa('Kademeyi sil')} onClick={() => patch({ matchTiers: draft.matchTiers.filter((_, itemIndex) => itemIndex !== index) })}><Trash2 className='size-3.5' /></Button>
                </div>
              ))}
            </div>
            <div className='mt-2 max-w-[220px]'>
              <NumberField label={txa('Bitirme coini (kademe dışı)')} value={draft.matchFinishCoin} onChange={(value) => patch({ matchFinishCoin: value })} />
            </div>
          </div>
        </AdminSurface>
      </div>

      <div className='flex items-center justify-end gap-2'>
        {dirty && <Button type='button' variant='ghost' onClick={() => setDraft(settings)} disabled={saving}>{txa('Vazgeç')}</Button>}
        <Button type='button' onClick={requestSave} disabled={!dirty || saving} data-testid='admin-games-save'>
          {saving ? <Loader2 className='size-4 animate-spin' /> : <Save className='size-4' />}{txa('Kaydet')}
        </Button>
      </div>
      <AdminConfirmDialog request={confirm} busy={saving} onCancel={() => setConfirm(null)} onConfirm={() => { void confirm?.run().then(() => setConfirm(null)) }} />
    </div>
  )
}
