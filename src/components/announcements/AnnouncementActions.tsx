import { useEffect, useRef, useState } from 'react'
import { Link } from '@/i18n/router'
import { Check, Gift } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/contexts/AuthContext'
import { respondToAnnouncement, type Announcement } from '@/services/announcementV2'
import { clearMyAccountEconomySnapshotCache } from '@/services/selfAccountEconomyService'
import { AnnouncementInvitation } from './AnnouncementInvitation'
import { AnnouncementRewardChecklist } from './AnnouncementRewardChecklist'
import { toast } from '@/services/toastService'
import { intlLocale, txa } from '@/i18n/activeLocale'

export function AnnouncementActions({ announcement: a, preview = false, refresh }: { announcement: Announcement; preview?: boolean; refresh?: () => void }) {
  const { currentUser, updateCurrentUser } = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const identity = useRef(currentUser?.id)
  const alive = useRef(true)
  const inFlight = useRef(false)
  identity.current = currentUser?.id
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => { setError('') }, [a.id, currentUser?.id])
  const expired = !!a.endsAt && Date.parse(a.endsAt) <= Date.now()
  async function respond(action: 'claim' | 'accepted' | 'declined') {
    if (inFlight.current || preview) return
    inFlight.current = true
    const actor = currentUser?.id
    setBusy(true); setError('')
    try {
      const result = await respondToAnnouncement(a.id, action)
      if (!alive.current || identity.current !== actor) return
      if (action === 'claim') {
        clearMyAccountEconomySnapshotCache()
        if (result.new_balance !== undefined) updateCurrentUser({ stones: result.new_balance })
        toast.success(result.alreadyClaimed ? txa('Bu ödülü zaten aldın.') : txa('{count} coin hesabına eklendi.', { count: result.credited_value || a.reward?.value || 0 }))
      } else toast.success(action === 'accepted' ? txa('Katılımın kaydedildi.') : txa('Yanıtın kaydedildi.'))
      refresh?.()
    } catch (e) { if (alive.current && identity.current === actor) setError(e instanceof Error ? e.message : txa('İşlem tamamlanamadı. Tekrar deneyebilirsin.')) }
    finally { inFlight.current = false; if (alive.current) setBusy(false) }
  }
  if (a.action.type === 'none') return null
  const trackLink = () => { if (currentUser && !preview) void respondToAnnouncement(a.id, 'link').catch(() => {}) }
  if (a.action.type === 'link') return <div className="mt-5"><Button asChild disabled={preview}>
    {preview ? <span>{txa(a.action.label)}</span> : a.action.url.startsWith('/') ? <Link to={a.action.url} onClick={trackLink}>{txa(a.action.label)}</Link> : <a href={a.action.url} onClick={trackLink} target="_blank" rel="noopener noreferrer">{txa(a.action.label)} ↗</a>}
  </Button></div>
  return <div className="mt-5 space-y-3 rounded-xl border bg-muted/20 p-4">
    {a.action.type === 'reward' && <><div className="flex items-center gap-2 font-bold"><Gift className="size-5 text-primary" />{a.reward?.value ?? a.action.value} coin</div>
      <p className="text-xs text-muted-foreground">{txa('Kişi başına bir kez')} · {a.reward ? txa('{count} ödül kaldı', { count: a.reward.remaining.toLocaleString(intlLocale()) }) : txa('{count} kişilik dağıtım', { count: a.action.maxClaims.toLocaleString(intlLocale()) })}</p></>}
    <AnnouncementRewardChecklist announcement={a} preview={preview} refresh={refresh} />
    {!currentUser && !preview ? <Button asChild><Link to="/giris">{txa('Devam etmek için giriş yap')}</Link></Button> : a.action.type === 'reward' ?
      <Button disabled={preview || busy || expired || a.reward?.claimed || !a.reward?.available || a.reward.remaining === 0 || a.reward?.eligible === false} onClick={() => void respond('claim')}>
        {a.reward?.claimed ? <><Check className="size-4" />{txa('Ödül alındı')}</> : expired ? txa('Süre doldu') : a.reward?.remaining === 0 ? txa('Ödüller tükendi') : busy ? txa('İşleniyor…') : a.reward && !a.reward.available ? txa('Ödül şu anda kapalı') : a.reward?.eligible === false ? txa('Önce şartları tamamla') : txa('Ödülü al')}
      </Button> : <AnnouncementInvitation key={`${a.id}:${currentUser?.id}`} announcement={a} userId={currentUser?.id} preview={preview} refresh={refresh} />}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>
}
