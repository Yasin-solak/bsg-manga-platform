import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { replySupportRequest, type SupportRequest } from '@/services/supportRequestService'
import { downloadSupportScreenshot } from '@/services/supportScreenshotService'
import { toUserFacingErrorMessage } from '@/services/userFacingError'
import { ReviewOwner, ReviewReport } from './AdminReviewShared'
import { reviewDate } from './adminReviewFormat'
import { txa } from '@/i18n/activeLocale'

export function AdminSupportDetail({ request, onSaved }: { request: SupportRequest; onSaved: (response: string) => void }) {
  const [reply, setReply] = useState(request.admin_response || ''), [busy, setBusy] = useState(false), [error, setError] = useState('')
  async function save() {
    setBusy(true); setError('')
    try { await replySupportRequest(request.id, reply); onSaved(reply.trim()) }
    catch (reason) { setError(toUserFacingErrorMessage(reason, txa('Yanıt kaydedilemedi.'))) }
    finally { setBusy(false) }
  }
  return <div className="space-y-6 p-4 pt-0">
    <div><h3 className="break-words text-lg font-semibold">{request.subject}</h3><p className="mt-1 break-all text-xs text-muted-foreground">#{request.id} · {reviewDate(request.created_at)}</p></div>
    <div className="rounded-xl border border-border p-4"><p className="mb-2 text-xs text-muted-foreground">{txa('Talebi gönderen')}</p><ReviewOwner username={request.username} id={request.user_id} /></div>
    <section><h3 className="mb-2 text-sm font-semibold">{txa('Kullanıcı mesajı')}</h3><p className="whitespace-pre-wrap break-words rounded-lg bg-muted/40 p-4 text-sm leading-relaxed">{request.message}</p></section>
    {request.hasScreenshot && <AdminSupportImage request={request} />}
    {request.account_context && <details><summary className="cursor-pointer text-sm font-semibold">{txa('Kullanıcının eklediği işlem bilgileri')}</summary><div className="mt-3"><ReviewReport value={request.account_context} /></div></details>}
    {request.technical && <details><summary className="cursor-pointer text-sm font-semibold">{txa('Teknik rapor')}</summary><div className="mt-3"><ReviewReport value={request.technical} /></div></details>}
    {request.admin_response && <section className="rounded-xl border border-primary/20 bg-primary/5 p-4"><h3 className="text-sm font-semibold">{txa('Kaydedilen yanıt')}</h3><p className="mt-2 whitespace-pre-wrap break-words text-sm">{request.admin_response}</p></section>}
    <form className="space-y-3 border-t border-border pt-5" onSubmit={event => { event.preventDefault(); void save() }}>
      <label htmlFor="admin-support-reply" className="text-sm font-semibold">{request.admin_response ? txa('Yanıtı güncelle') : txa('Kullanıcıya yanıt')}</label>
      <Textarea id="admin-support-reply" value={reply} onChange={event => setReply(event.target.value)} minLength={5} maxLength={5000} required rows={6} disabled={busy} placeholder={txa('Sorunu çözmek için kullanıcıya yol göster…')} />
      <p className="text-xs text-muted-foreground">{reply.length}/5000 · {txa('Kaydettiğinde talep yanıtlandı olarak işaretlenir ve kullanıcıya bildirim gider.')}</p>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={busy || reply.trim().length < 5 || reply.trim() === request.admin_response}>{busy ? txa('Kaydediliyor…') : txa('Yanıtı kaydet')}</Button>
    </form>
  </div>
}

function AdminSupportImage({ request }: { request: SupportRequest }) {
  const [url, setUrl] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const mounted = useRef(true), objectUrl = useRef('')
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; if (objectUrl.current) URL.revokeObjectURL(objectUrl.current) } }, [])
  async function open() {
    setBusy(true); setError('')
    try {
      const next = await downloadSupportScreenshot(request.id, request.user_id)
      if (!mounted.current) { URL.revokeObjectURL(next); return }
      objectUrl.current = next; setUrl(next)
    } catch (reason) { if (mounted.current) setError(toUserFacingErrorMessage(reason, txa('Görsel açılamadı.'))) }
    finally { if (mounted.current) setBusy(false) }
  }
  return <section className="space-y-3"><h3 className="text-sm font-semibold">{txa('Ekran görüntüsü')}</h3>{url ? <a href={url} target="_blank" rel="noreferrer"><img src={url} alt={txa('Kullanıcının destek talebine eklediği ekran görüntüsü')} className="max-h-96 w-full rounded-lg border border-border object-contain" /><span className="text-xs text-primary">{txa('Tam boyutta aç')}</span></a> : <Button variant="outline" disabled={busy} onClick={() => void open()}>{busy ? txa('Görsel yükleniyor…') : txa('Görseli görüntüle')}</Button>}{error && <p role="alert" className="text-sm text-destructive">{error}</p>}</section>
}
