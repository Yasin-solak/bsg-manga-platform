import { useEffect, useState } from 'react'
import { Monitor, Smartphone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AnnouncementContent } from '@/components/announcements/AnnouncementContent'
import { AnnouncementActions } from '@/components/announcements/AnnouncementActions'
import { getAnnouncementHistory, statusLabels, kindLabels, newAnnouncementDraft, notifyAnnouncement, saveAnnouncement, toAnnouncementDraft,
  type AdminAnnouncementV2, type Announcement, type AnnouncementDraft, type AnnouncementReference } from '@/services/announcementV2'
import { toast } from '@/services/toastService'
import { AnnouncementBlockEditor } from './AnnouncementBlockEditor'
import { AnnouncementPublishSettings } from './AnnouncementPublishSettings'
import { intlLocale, txa } from '@/i18n/activeLocale'

export function AnnouncementEditor({ initial, onClose, onSaved }: { initial: AdminAnnouncementV2 | null; onClose: () => void; onSaved: () => void }) {
  const [saved, setSaved] = useState(initial)
  const [id] = useState(() => initial?.id || crypto.randomUUID())
  const [draft, setDraft] = useState<AnnouncementDraft>(() => initial ? toAnnouncementDraft(initial) : newAnnouncementDraft())
  const [references, setReferences] = useState<Announcement['references']>(initial?.preview.references || {})
  const [recipients, setRecipients] = useState<AnnouncementReference[]>(initial?.recipients || [])
  const [tab, setTab] = useState('content')
  const [device, setDevice] = useState('desktop')
  const [busy, setBusy] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState('')
  const [history, setHistory] = useState<Awaited<ReturnType<typeof getAnnouncementHistory>> | null>(null)
  const [historyError, setHistoryError] = useState('')
  const [historyRetry, setHistoryRetry] = useState(0)
  const [notifyResult, setNotifyResult] = useState('')
  // Kaydedilmemis degisiklik uyarisi pencereyle (eskiden tarayicinin yerli onay kutusu).
  const [confirmClose, setConfirmClose] = useState(false)
  useEffect(() => {
    if (tab !== 'history' || !saved) return
    let alive = true
    setHistory(null); setHistoryError('')
    void getAnnouncementHistory(saved.id).then(rows => { if (alive) setHistory(rows) }).catch(() => { if (alive) setHistoryError(txa('Geçmiş alınamadı.')) })
    return () => { alive = false }
  }, [tab, saved, historyRetry])
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault() }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])
  const update = (d: AnnouncementDraft) => { setDraft(d); setDirty(true); setNotifyResult('') }
  const preview: Announcement = { id, title: draft.title || txa('Duyuru başlığı'), document: draft.document, kind: draft.kind, startsAt: draft.startsAt,
    endsAt: draft.endsAt, action: draft.action, priority: draft.priority, references, reward: null, response: null, revision: saved?.revision || 0 }
  async function save(status: AnnouncementDraft['status']) {
    setBusy(true); setError('')
    try {
      const result = await saveAnnouncement(id, saved?.revision || 0, { ...draft, status })
      setSaved(result); setDraft(toAnnouncementDraft(result)); setReferences(result.preview.references); setDirty(false); setNotifyResult('')
      toast.success(status === 'draft' ? txa('Taslak kaydedildi.') : status === 'archived' ? txa('Duyuru arşivlendi.') : Date.parse(result.starts_at) > Date.now() ? txa('Duyuru planlandı.') : txa('Duyuru yayımlandı.'))
      onSaved()
    } catch (e) {
      const message = e instanceof Error ? txa(e.message) : txa('Kaydedilemedi.')
      try { const issues = JSON.parse(message) as { message: string }[]; setError(issues.map(x => txa(x.message)).join(' ')) } catch { setError(message) }
    } finally { setBusy(false) }
  }
  async function notify() {
    setBusy(true); setError('')
    try { const result = await notifyAnnouncement(id); setNotifyResult(txa('{v1} bildirim gönderildi. {v2} alıcı atlandı (önceki gönderim veya kapalı tercih). {v3} gönderim başarısız; tekrar deneyebilirsin.', { v1: result.sent, v2: result.skipped, v3: result.failed })) }
    catch (e) { setError(e instanceof Error ? txa(e.message) : txa('Bildirim gönderilemedi.')) }
    finally { setBusy(false) }
  }
  const close = () => { if (busy) return; if (dirty) setConfirmClose(true); else onClose() }
  return <><Dialog open onOpenChange={open => { if (!open) close() }}><DialogContent className="flex h-[90dvh] max-h-[900px] flex-col overflow-hidden sm:max-w-6xl">
    <header className="shrink-0 pr-6"><DialogTitle>{saved ? txa('Duyuruyu düzenle') : txa('Yeni duyuru')}</DialogTitle><p className="mt-1 text-xs text-muted-foreground">{saved ? txa('Sürüm {v1} · Son kayıt {v2}', { v1: saved.revision, v2: new Date(saved.updated_at).toLocaleString(intlLocale()) }) : txa('Önce içeriği hazırla, önizle ve yayınla.')}</p></header>
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-6 overflow-y-auto [scrollbar-gutter:stable] lg:grid lg:grid-cols-2 lg:overflow-hidden">
      <div className="min-w-0 shrink-0 space-y-4 lg:min-h-0 lg:overflow-y-auto lg:pr-2 [scrollbar-gutter:stable]"><nav className="sticky top-0 z-10 flex flex-wrap gap-2 bg-background pb-2" aria-label={txa('Duyuru düzenleme bölümleri')}>{[['content', txa('İçerik')], ['publish', txa('Yayın ayarları')], ['history', txa('Geçmiş')]].map(([key, label]) => <Button size="sm" key={key} variant={tab === key ? 'default' : 'outline'} disabled={busy || (key === 'history' && !saved)} aria-pressed={tab === key} onClick={() => setTab(key)}>{label}</Button>)}</nav>
        <fieldset disabled={busy} className="min-w-0 shrink-0 space-y-4 lg:min-h-0 lg:overflow-y-auto lg:pr-2 [scrollbar-gutter:stable]">
          {tab === 'content' && <><label className="block space-y-1 text-sm">{txa('Başlık')}<Input value={draft.title} onChange={e => update({ ...draft, title: e.target.value })} maxLength={160} placeholder={txa('Duyuru başlığı')} /></label>
            <div className="space-y-1 text-sm"><span>{txa('Duyuru türü')}</span><Select value={draft.kind} disabled={saved?.rewardLocked || !!saved?.responseCount || !!saved?.accepted || !!saved?.declined} onValueChange={value => { const kind = value as AnnouncementDraft['kind']; update({ ...draft, kind, action: kind === 'reward' ? { type: 'reward', value: 50, maxClaims: 100 } : kind === 'invitation' ? { type: 'rsvp' } : { type: 'none' } }) }}><SelectTrigger className="h-10 w-full" aria-label={txa('Duyuru türü')}><SelectValue /></SelectTrigger><SelectContent>{Object.entries(kindLabels).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent></Select></div>
            <AnnouncementBlockEditor announcementId={id} onBusy={setBusy} blocks={draft.document} onChange={document => update({ ...draft, document })} references={references} onReference={r => setReferences(old => ({ ...old, [`${r.kind}:${r.id}`]: r }))} />
          </>}
          {tab === 'publish' && <AnnouncementPublishSettings draft={draft} onChange={update} recipients={recipients} rewardLocked={saved?.rewardLocked || false} conditionsLocked={(saved?.claims || 0) > 0} invitationLocked={(saved?.responseCount || 0) > 0 || !!saved?.accepted || !!saved?.declined} references={references} onReference={r => setReferences(old => ({ ...old, [`${r.kind}:${r.id}`]: r }))} onRecipients={rows => { setRecipients(rows); setDraft(old => ({ ...old, recipients: rows.map(r => r.id) })); setDirty(true) }} />}
        </fieldset>
        {tab === 'history' && <div className="space-y-2">{historyError ? <p role="alert">{historyError}<Button variant="outline" onClick={() => setHistoryRetry(v => v + 1)}>{txa('Tekrar dene')}</Button></p> : !history ? <div role="status" aria-label={txa('Geçmiş yükleniyor')} className="h-32 rounded-xl bg-muted motion-safe:animate-pulse" /> : history.length ? history.map(h => <div key={h.revision} className="rounded-lg border p-3 text-sm"><strong>{txa('Sürüm {v1} · {v2}', { v1: h.revision, v2: h.title })}</strong><p className="mt-1 text-xs text-muted-foreground">{h.actor || txa('Silinmiş hesap')} · {new Date(h.created_at).toLocaleString(intlLocale())} · {statusLabels[h.status as keyof typeof statusLabels] || h.status}</p></div>) : <p className="text-sm text-muted-foreground">{txa('Eski kaynaktan taşınan duyuru. İlk düzenlemeden sonra sürüm geçmişi oluşur.')}</p>}</div>}
      </div>
      <aside className="min-w-0 shrink-0 rounded-xl border bg-muted/20 p-4 lg:min-h-0 lg:overflow-y-auto [scrollbar-gutter:stable]"><div className="mb-4 flex items-center justify-between"><h3 className="text-sm font-semibold">{txa('Canlı önizleme')}</h3><div className="flex gap-1"><Button variant={device === 'desktop' ? 'secondary' : 'ghost'} size="icon" aria-label={txa('Masaüstü önizleme')} aria-pressed={device === 'desktop'} onClick={() => setDevice('desktop')}><Monitor className="size-4" /></Button><Button variant={device === 'mobile' ? 'secondary' : 'ghost'} size="icon" aria-label={txa('Mobil önizleme')} aria-pressed={device === 'mobile'} onClick={() => setDevice('mobile')}><Smartphone className="size-4" /></Button></div></div>
        <div className={`mx-auto rounded-xl border bg-card p-5 ${device === 'mobile' ? 'max-w-[350px]' : ''}`}><p className="mb-2 text-xs font-bold text-primary">{kindLabels[draft.kind]}</p><h2 className="mb-4 break-words text-xl font-bold">{preview.title}</h2><AnnouncementContent announcement={preview} preview /><AnnouncementActions announcement={preview} preview /></div><p className="mt-3 text-xs text-muted-foreground">{txa('Önizleme işlem yapmaz. İçerik erişimi okuyucunun hesabına göre yeniden kontrol edilir.')}</p>
      </aside>
    </div>
    <footer className="max-h-[28dvh] shrink-0 space-y-3 overflow-y-auto border-t pt-4">{error && <p role="alert" className="text-sm text-destructive">{error}</p>}{notifyResult && <p role="status" className="text-sm text-primary">{notifyResult}</p>}
      <div className="flex flex-wrap items-center gap-2"><Button variant="outline" disabled={busy} onClick={() => void save('draft')}>{txa('Taslağa kaydet')}</Button><Button disabled={busy} onClick={() => void save('published')}>{busy ? txa('İşleniyor…') : draft.status === 'published' ? txa('Yayını güncelle') : txa('Yayımla / planla')}</Button>
        {saved && <Button variant="ghost" disabled={busy} onClick={() => void save('archived')}>{txa('Arşivle')}</Button>}
        {saved?.status === 'published' && saved.audience === 'selected' && <Button variant="outline" disabled={busy || dirty || Date.parse(saved.starts_at) > Date.now() || (!!saved.ends_at && Date.parse(saved.ends_at) <= Date.now())} onClick={() => void notify()}>{txa('Seçili alıcılara bildir')}</Button>}
        <Button variant="ghost" className="ml-auto" disabled={busy} onClick={close}>{txa('Kapat')}</Button></div>
      <p className="text-xs text-muted-foreground">{txa('Yayınlamak bildirim göndermez. Özel alıcılara, yayındayken ayrı düğmeyle bir kez sistem bildirimi gönderebilirsin.')}</p>
    </footer>
  </DialogContent></Dialog>
  <Dialog open={confirmClose} onOpenChange={setConfirmClose}><DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-[420px]" data-testid="announcement-editor-discard">
    <DialogTitle>{txa('Kaydedilmemiş değişiklikler var')}</DialogTitle>
    <DialogDescription>{txa('Kapatırsan son kayıttan sonraki değişiklikler kaybolur.')}</DialogDescription>
    <DialogFooter><Button variant="ghost" onClick={() => setConfirmClose(false)}>{txa('Düzenlemeye dön')}</Button><Button variant="destructive" onClick={() => { setConfirmClose(false); onClose() }}>{txa('Kaydetmeden kapat')}</Button></DialogFooter>
  </DialogContent></Dialog></>
}
