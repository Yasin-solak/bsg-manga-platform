import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { Announcement, AnnouncementReference, RewardCondition } from '@/services/announcementV2'
import { AnnouncementReferencePicker } from './AnnouncementReferencePicker'
import { conditionLabels, conditionReferenceKind } from '@/services/announcementV2/conditions'
import { txa } from '@/i18n/activeLocale'

export function AnnouncementRewardConditions({ conditions, onChange, locked, references, onReference }: {
  conditions: RewardCondition[]; onChange: (v: RewardCondition[]) => void; locked: boolean
  references: Announcement['references']; onReference: (r: AnnouncementReference) => void
}) {
  const [picker, setPicker] = useState<'follow_manga' | 'follow_fansub' | 'read_manga' | 'fansub_member' | null>(null)
  const pickerKind = picker === 'follow_manga' || picker === 'read_manga' ? 'manga' : 'fansub'
  const has = (type: RewardCondition['type']) => conditions.some(c => c.type === type)
  const remove = (type: RewardCondition['type']) => onChange(conditions.filter(c => c.type !== type))
  const age = conditions.find(c => c.type === 'account_age')
  const select = (r: AnnouncementReference) => {
    if (!picker || r.kind !== pickerKind) return
    onReference(r)
    const next: RewardCondition = picker === 'read_manga' ? { type: picker, id: r.id, count: 1 } : { type: picker, id: r.id }
    onChange([...conditions.filter(c => c.type !== picker), next])
  }
  return <fieldset disabled={locked} className="space-y-3 border-t pt-4">
    <legend className="px-1 text-sm font-semibold">{txa('Kazanım şartları')}</legend>
    <p className="text-xs text-muted-foreground">{txa('Seçilen şartların tamamı ödül alınırken kontrol edilir. Boş bırakırsan ek şart aranmaz.')}</p>
    {([['verified_email', txa('E-posta doğrulanmış olsun')], ['premium', txa('Aktif Premium üyeliği olsun')], ['profile_completed', txa('Profil kurulumu tamamlanmış olsun')]] as const).map(([type, label]) =>
      <label key={type} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={has(type)} onChange={e => e.target.checked ? onChange([...conditions, { type }]) : remove(type)} />{label}</label>)}
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!age} onChange={e => e.target.checked ? onChange([...conditions, { type: 'account_age', days: 7 }]) : remove('account_age')} />{txa('En az belirli süredir üye olsun')}</label>
    {age?.type === 'account_age' && <label className="block space-y-1 text-xs">{txa('Minimum üyelik günü')}<Input type="number" min={1} max={3650} value={age.days} onChange={e => onChange(conditions.map(c => c.type === 'account_age' ? { ...c, days: Number(e.target.value) } : c))} /></label>}
    {(['read_chapters', 'follow_manga_count', 'follow_fansub_count', 'level', 'claimed_quests'] as const).map(type => {
      const condition = conditions.find(c => c.type === type)
      return <div key={type} className="space-y-2 rounded-lg border bg-background p-3">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!condition} onChange={e => e.target.checked ? onChange([...conditions, { type, count: 1 }]) : remove(type)} />{conditionLabels[type]}</label>
        {condition && 'count' in condition && <label className="block space-y-1 text-xs">{type === 'level' ? txa('Minimum seviye') : txa('Minimum sayı')}<Input type="number" min={1} max={type === 'level' ? 10 : 100000} value={condition.count} onChange={e => onChange(conditions.map(c => c.type === type ? { ...condition, count: Number(e.target.value) } : c))} /></label>}
      </div>
    })}
    <p className="text-xs text-muted-foreground">{txa('Okuma şartları hesaba kayıtlı farklı bölümleri; görev şartı ödülü alınmış kişisel görevleri sayar. Aynı bölümün tekrarı sayıyı artırmaz.')}</p>
    {(['follow_manga', 'follow_fansub', 'read_manga', 'fansub_member'] as const).map(type => {
      const condition = conditions.find(c => c.type === type)
      return <div key={type} className="space-y-2">
        <Button type="button" variant="outline" size="sm" onClick={() => setPicker(type)}>{txa('{v1} seç', { v1: conditionLabels[type] })}</Button>
        {condition && 'id' in condition && <div className="flex items-center justify-between gap-2 rounded-lg bg-muted p-2 text-sm">
          <span>{references[`${conditionReferenceKind(condition)}:${condition.id}`]?.title || txa('Seçili içerik şu anda erişilemiyor')}</span>
          <Button type="button" variant="ghost" size="sm" aria-label={txa('{v1} şartını kaldır', { v1: conditionLabels[type] })} onClick={() => remove(type)}>{txa('Kaldır')}</Button>
        </div>}
        {condition?.type === 'read_manga' && <label className="block space-y-1 text-xs">{txa('Bu seriden okunacak farklı bölüm')}<Input type="number" min={1} max={100000} value={condition.count} onChange={e => onChange(conditions.map(c => c.type === type ? { ...condition, count: Number(e.target.value) } : c))} /></label>}
      </div>
    })}
    {locked && <p className="text-xs text-muted-foreground">{txa('İlk ödül alındığı için kazanım şartları kilitli. Farklı şartlar için yeni ödül duyurusu oluştur.')}</p>}
    <AnnouncementReferencePicker open={picker !== null} fixedKind={pickerKind} onClose={() => setPicker(null)} onSelect={select} />
  </fieldset>
}
