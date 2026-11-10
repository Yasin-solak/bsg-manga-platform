import { useRef, useState } from 'react'
import type { CommunityMessage } from '@/services/communityV2Service'
import { communityModeration, REPORT_REASONS } from '@/services/communityModerationService'
import { CommunityModal } from './CommunityShared'
import { communityError } from './communityHelpers'
import { intlLocale, txa } from '@/i18n/activeLocale'

export function CommunityReportDialog({channelId,message,onClose}: {channelId:string;message:CommunityMessage;onClose:()=>void}) {
  const [reason,setReason]=useState<keyof typeof REPORT_REASONS>('spam'), [note,setNote]=useState('')
  const [busy,setBusy]=useState(false), [error,setError]=useState('')
  const [success,setSuccess]=useState('')
  const pending=useRef(false)
  async function submit() {
    if(pending.current) return
    pending.current=true; setBusy(true); setError('')
    try { const result=await communityModeration.report(channelId,message.id,reason,note); setSuccess(result.duplicate?txa('Bu mesaj için bildirimin zaten alındı.'):txa('Bildirimin incelemeye gönderildi.')) }
    catch(e){setError(communityError(e))}
    finally{pending.current=false;setBusy(false)}
  }
  return <CommunityModal title={txa('Mesajı bildir')} description={txa('Bildirimini bu odaya erişebilen sunucu sahibi ve şikâyet inceleme yetkilileri görebilir. Bildirilen kişiye otomatik bildirim gönderilmez.')} onClose={()=>{if(!busy)onClose()}}>
    {success?<><p role="status" className="cv2-success">{success}</p><button className="cv2-primary" onClick={onClose}>{txa('Tamam')}</button></>:<form className="cv2-role-form" onSubmit={e=>{e.preventDefault();void submit()}}>
      <p className="cv2-hint">{txa('@{v1} kullanıcısının mesajı · {v2}', { v1: message.username, v2: new Date(message.created_at).toLocaleString(intlLocale()) })}</p>
      <label>{txa('Bildirim nedeni')}<select value={reason} disabled={busy} onChange={e=>setReason(e.target.value as keyof typeof REPORT_REASONS)}>{Object.entries(REPORT_REASONS).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
      <label>{txa('Açıklama')} {reason==='other'?txa('(en az 10 karakter)'):txa('(isteğe bağlı)')}<textarea value={note} maxLength={1000} minLength={reason==='other'?10:undefined} required={reason==='other'} disabled={busy} onChange={e=>setNote(e.target.value)} /></label>
      <small>{note.length}/1000 · {txa('Şifreni veya özel hesap bilgilerini paylaşma.')}</small>
      {error&&<p role="alert" className="cv2-error">{error}</p>}
      <button className="cv2-primary" disabled={busy||(reason==='other'&&note.trim().length<10)}>{busy?txa('Gönderiliyor…'):txa('Bildirimi gönder')}</button>
    </form>}
  </CommunityModal>
}
