import { conditionDescription } from '@/services/announcementV2/conditions'
import { Link } from '@/i18n/router'
import { Check, Circle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Announcement } from '@/services/announcementV2'
import { txa } from '@/i18n/activeLocale'

export function AnnouncementRewardChecklist({ announcement: a, preview, refresh }: { announcement: Announcement; preview: boolean; refresh?: () => void }) {
  if (a.action.type !== 'reward') return null
  const conditions = preview ? (a.action.conditions || []).map(c => ({
    type: c.type, met: false, href: undefined, current: undefined, target: undefined,
    label: conditionDescription(c, a.references),
  })) : a.reward?.conditions || []
  if (!conditions.length) return null
  return <div className="space-y-2 border-y py-3">
    <h3 className="text-sm font-semibold">{txa('Kazanım şartları')}</h3>
    <ul className="space-y-2">{conditions.map(c => <li key={c.type} className="flex items-start gap-2 text-xs">
      {c.met ? <Check className="mt-0.5 size-3.5 shrink-0 text-primary" aria-label={txa('Tamamlandı')} /> : <Circle className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-label={txa('Henüz tamamlanmadı')} />}
      {!preview && c.href ? <Link className="underline underline-offset-2" to={c.href}>{c.label}</Link> : <span>{c.label}</span>}
    <span className="ml-auto shrink-0 text-muted-foreground">{c.current !== undefined && c.target !== undefined ? `${Math.min(c.current, c.target)}/${c.target}` : ''}</span></li>)}</ul>
    {!preview && !a.reward?.claimed && <Button variant="ghost" size="sm" onClick={refresh}>{txa('Şartları tekrar kontrol et')}</Button>}
  </div>
}
