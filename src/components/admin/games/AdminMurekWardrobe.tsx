import { useCallback, useEffect, useState } from 'react'
import { Coins, Loader2, Save } from 'lucide-react'
import { AdminSurface } from '@/components/admin/shared/AdminSurface'
import { Murek } from '@/components/murek/Murek'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { getAdminMurekItems, saveAdminMurekItem, type MurekAdminSnapshot, type MurekItem } from '@/services/murekService'
import { toast } from '@/services/toastService'
import { txa } from '@/i18n/activeLocale'

/* Admin > Oyunlar > Murek Dolabi: parca fiyati, satista olup olmadigi, kac kisinin aldigi/kusandigi. */

const RARITY_LABEL: Record<MurekItem['rarity'], string> = { get common() { return txa('Yaygın') }, get rare() { return txa('Nadir') }, get epic() { return txa('Destansı') }, get legendary() { return txa('Efsanevi') } }

function ItemRow({ item, onSaved }: { item: MurekItem, onSaved: (next: MurekAdminSnapshot) => void }) {
  const [price, setPrice] = useState(item.price)
  const [active, setActive] = useState(item.isActive)
  const [saving, setSaving] = useState(false)
  const dirty = price !== item.price || active !== item.isActive
  const isDefault = item.id === 'mor'

  const save = async () => {
    setSaving(true)
    try {
      onSaved(await saveAdminMurekItem({ id: item.id, price, isActive: active }))
      toast.success(`${item.name} kaydedildi.`)
    } catch (error) {
      toast.error(error instanceof Error ? txa(error.message) : txa('Kaydedilemedi.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <tr className='border-t border-border/60'>
      <td className='px-4 py-2'>
        <span className='flex items-center gap-3'>
          <Murek mood='happy' motion='none' size={36} color={item.kind === 'color' ? item.data.hex ?? '#7c6cff' : '#7c6cff'} accessory={item.kind === 'accessory' ? item.id : null} animated={item.data.animated ?? null} />
          <span>
            <span className='block font-medium'>{item.name}</span>
            <span className='block text-xs text-muted-foreground'>{item.kind === 'color' ? txa('Renk') : txa('Aksesuar')} · {RARITY_LABEL[item.rarity]}</span>
          </span>
        </span>
      </td>
      <td className='px-4 py-2'>
        <Input type='number' className='h-8 w-24' value={price} disabled={isDefault} onChange={(event) => setPrice(Math.max(0, Number.parseInt(event.currentTarget.value, 10) || 0))} aria-label={txa('{v1} fiyatı', { v1: item.name })} />
      </td>
      <td className='px-4 py-2'><Switch checked={active} disabled={isDefault} onCheckedChange={setActive} aria-label={txa('{v1} satışta', { v1: item.name })} /></td>
      <td className='px-4 py-2 text-right tabular-nums'>{item.owners ?? 0}</td>
      <td className='px-4 py-2 text-right tabular-nums'>{item.equipped ?? 0}</td>
      <td className='px-4 py-2 text-right'>
        <Button type='button' size='sm' variant='outline' disabled={!dirty || saving} onClick={() => void save()}>
          {saving ? <Loader2 className='size-3.5 animate-spin' /> : <Save className='size-3.5' />}{txa('Kaydet')}
        </Button>
      </td>
    </tr>
  )
}

export function AdminMurekWardrobe() {
  const [snapshot, setSnapshot] = useState<MurekAdminSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setSnapshot(await getAdminMurekItems())
    } catch (loadError) {
      setError(loadError instanceof Error ? txa(loadError.message) : txa('Yüklenemedi.'))
    }
  }, [])

  useEffect(() => { void load() }, [load])

  if (error) return <p className='rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive'>{error}</p>
  if (!snapshot) return <div className='flex justify-center py-10'><Loader2 className='size-5 animate-spin text-muted-foreground' /></div>

  return (
    <AdminSurface className='overflow-hidden' data-testid='admin-murek-wardrobe'>
      <div className='flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3'>
        <div>
          <h3 className='text-sm font-semibold'>{txa('Mürek Dolabı')}</h3>
          <p className='text-xs text-muted-foreground'>{txa('Mağazadaki Mürek renk ve aksesuarları. Kapalı parça satılmaz; alanlarda kalır.')}</p>
        </div>
        <span className='inline-flex items-center gap-1.5 rounded-md bg-amber-500/10 px-2 py-1 text-xs font-semibold text-amber-700 dark:text-amber-300'>
          <Coins className='size-3.5' />{txa('Toplam satış: {v1} coin', { v1: snapshot.revenue })}
        </span>
      </div>
      <div className='overflow-x-auto'>
        <table className='w-full min-w-[680px] text-sm'>
          <thead className='bg-muted/40 text-left text-xs text-muted-foreground'>
            <tr>
              <th className='px-4 py-2 font-medium'>{txa('Parça')}</th>
              <th className='px-4 py-2 font-medium'>{txa('Fiyat (coin)')}</th>
              <th className='px-4 py-2 font-medium'>{txa('Satışta')}</th>
              <th className='px-4 py-2 text-right font-medium'>{txa('Alan')}</th>
              <th className='px-4 py-2 text-right font-medium'>{txa('Kuşanan')}</th>
              <th className='px-4 py-2' />
            </tr>
          </thead>
          <tbody>
            {snapshot.items.map((item) => (
              <ItemRow key={`${item.id}:${item.price}:${item.isActive}`} item={item} onSaved={setSnapshot} />
            ))}
          </tbody>
        </table>
      </div>
    </AdminSurface>
  )
}
