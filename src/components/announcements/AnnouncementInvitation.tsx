import { useEffect, useRef, useState } from 'react'
import { Check, LockKeyhole } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { defaultInvitationChoices, respondToAnnouncement, type Announcement, type InvitationChoice } from '@/services/announcementV2'
import { toast } from '@/services/toastService'
import { txa } from '@/i18n/activeLocale'

export function AnnouncementInvitation({ announcement: a, userId, preview, refresh }: { announcement: Announcement; userId?: string; preview: boolean; refresh?: () => void }) {
  const [choice, setChoice] = useState<InvitationChoice['id'] | null>(null)
  const [saved, setSaved] = useState(a.response)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const inFlight = useRef(false)
  const identity = useRef(`${a.id}:${userId}`)
  const alive = useRef(true)
  identity.current = `${a.id}:${userId}`
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => { if (a.response) setSaved(a.response) }, [a.response])
  if (a.action.type !== 'rsvp') return null
  const options = a.action.options || defaultInvitationChoices
  const selected = saved || a.response
  const expired = !!a.endsAt && Date.parse(a.endsAt) <= Date.now()
  async function submit() {
    if (!choice || selected || inFlight.current || preview || !userId || expired) return
    const actor = identity.current
    inFlight.current = true; setBusy(true); setError('')
    try {
      const result = await respondToAnnouncement(a.id, choice)
      if (!alive.current || identity.current !== actor) return
      setSaved((result.response || choice) as InvitationChoice['id']); toast.success(txa('Yanıtın kaydedildi.')); refresh?.()
    } catch (e) {
      if (alive.current && identity.current === actor) { setError(e instanceof Error ? e.message : txa('Yanıt kaydedilemedi.')); refresh?.() }
    } finally { inFlight.current = false; if (alive.current && identity.current === actor) setBusy(false) }
  }
  if (selected) return <div className="space-y-2" role="status"><p className="flex items-center gap-2 font-semibold text-primary"><Check className="size-4" />{options.find(o => o.id === selected)?.label || txa('Yanıt kaydedildi')}</p><p className="flex gap-2 text-xs text-muted-foreground"><LockKeyhole className="size-3.5 shrink-0" />{txa('Yanıtın kaydedildi. İlk seçim daha sonra değiştirilemez.')}</p></div>
  return <div className="space-y-3">
    <p className="text-xs text-muted-foreground">{txa('Bir seçenek seç ve kaydet. Kaydettikten sonra yanıtını değiştiremezsin.')}</p>
    <fieldset disabled={busy || preview || expired} className="grid gap-2 sm:grid-cols-2"><legend className="sr-only">{txa('Davet yanıtın')}</legend>
      {options.map(o => <label key={o.id} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-3 text-sm ${choice === o.id ? 'border-primary bg-primary/10' : 'hover:bg-muted/50'}`}>
        <input type="radio" name={`invitation-${a.id}`} value={o.id} checked={choice === o.id} onChange={() => setChoice(o.id)} className="accent-primary" /><span className="break-words">{o.label}</span>
      </label>)}
    </fieldset>
    <Button disabled={!choice || busy || preview || expired} onClick={() => void submit()}>{expired ? txa('Süre doldu') : busy ? txa('Kaydediliyor…') : txa('Yanıtımı kaydet')}</Button>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>
}
