import { Plus, Trash2, LockKeyhole } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { defaultInvitationChoices, invitationChoiceIds, type InvitationChoice } from '@/services/announcementV2'
import { txa } from '@/i18n/activeLocale'

export function AnnouncementInvitationSettings({ options, locked, onChange }: { options?: InvitationChoice[]; locked: boolean; onChange: (options: InvitationChoice[]) => void }) {
  const rows = options || defaultInvitationChoices
  return <fieldset disabled={locked} className="space-y-3 rounded-xl border p-4">
    <legend className="px-1 text-sm font-semibold">{txa('Davet seçenekleri')}</legend>
    <p className="text-xs text-muted-foreground">{txa('1–4 seçenek ekle. Kullanıcı birini seçip kaydeder; ilk yanıt daha sonra değiştirilemez.')}</p>
    {rows.map((row, index) => <div key={row.id} className="flex items-end gap-2">
      <label className="min-w-0 flex-1 space-y-1 text-xs">{txa('{v1}. seçenek', { v1: index + 1 })}<Input value={row.label} maxLength={60} onChange={e => onChange(rows.map(r => r.id === row.id ? { ...r, label: e.target.value } : r))} /></label>
      <Button type="button" size="icon" variant="ghost" disabled={locked || rows.length === 1} aria-label={txa('{v1}. seçeneği kaldır', { v1: index + 1 })} onClick={() => onChange(rows.filter(r => r.id !== row.id))}><Trash2 className="size-4" /></Button>
    </div>)}
    <Button type="button" size="sm" variant="outline" disabled={locked || rows.length >= 4} onClick={() => {
      const id = invitationChoiceIds.find(id => !rows.some(r => r.id === id))
      if (id) onChange([...rows, { id, label: '' }])
    }}><Plus className="size-4" />{txa('Seçenek ekle')}</Button>
    {locked && <p className="flex gap-2 text-xs text-muted-foreground"><LockKeyhole className="size-4 shrink-0" />{txa('Yanıt alındığı için seçenekler kilitli. Yeni seçenekler için ayrı bir davet oluştur.')}</p>}
    <p className="text-xs text-muted-foreground">{txa('Bu yalnız bir yanıt kaydıdır; otomatik fansub üyeliği veya yetki vermez.')}</p>
  </fieldset>
}
