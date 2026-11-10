import { useEffect, useRef, useState } from 'react'
import { communityV2 } from '@/services/communityV2Service'
import { communityModeration, REPORT_REASONS, REPORT_STATES, type CommunityReport, type ReportState } from '@/services/communityModerationService'
import type { ManagerProps } from './types'
import { CommunityIdentity, CommunityLoading } from '../CommunityShared'
import { CommunityMessageBody } from '../CommunityMessageBody'
import { CommunityAttachments } from '../CommunityAttachments'
import { communityError } from '../communityHelpers'
import '../communityModeration.css'
import { intlLocale, txa } from '@/i18n/activeLocale'

export function ReportsPanel({serverId,server}:ManagerProps) {
  const [status,setStatus]=useState<ReportState>('open'), [cursors,setCursors]=useState<(string|undefined)[]>([undefined])
  const [rows,setRows]=useState<CommunityReport[]>([]), [selected,setSelected]=useState<string|null>(null)
  const [loading,setLoading]=useState(true), [error,setError]=useState(''), [revision,setRevision]=useState(0)
  const before=cursors[cursors.length-1]
  const access=server.channels.filter(ch=>ch.can_read).map(ch=>ch.id).sort().join(',')
  useEffect(()=>{
    let alive=true, pending=false
    const controller=new AbortController()
    setRows([]);setSelected(null);setLoading(true)
    async function load(){
      if(pending)return
      pending=true
      try{const value=await communityModeration.list(serverId,status,before,controller.signal);if(alive){setRows(value);setError('')}}
      catch(e){if(alive){setRows([]);setSelected(null);setError(communityError(e))}}
      finally{pending=false;if(alive)setLoading(false)}
    }
    void load()
    const timer=setInterval(()=>{if(document.visibilityState==='visible')void load()},30000)
    return()=>{alive=false;controller.abort();clearInterval(timer)}
  },[serverId,status,before,revision,access])
  const report=rows.slice(0,25).find(r=>r.id===selected&&server.channels.some(ch=>ch.id===r.channel_id&&ch.can_read))
  return <div className="cv2-reports">
    <p className="cv2-hint">{txa('Yalnız okuyabildiğin kanalların bildirimleri görünür. Metin ve dosyalar mesajın güncel halidir; silinen içerik saklanmaz. Liste 30 saniyede bir yenilenir.')}</p>
    <div className="cv2-report-filters"><label>{txa('Durum')}<select value={status} disabled={loading} onChange={e=>{setStatus(e.target.value as ReportState);setCursors([undefined]);setSelected(null)}}>{Object.entries(REPORT_STATES).map(([id,label])=><option value={id} key={id}>{label}</option>)}</select></label><button className="cv2-secondary" disabled={loading} onClick={()=>setRevision(v=>v+1)}>{txa('Listeyi yenile')}</button></div>
    {error&&<p className="cv2-error" role="alert">{error}</p>}
    {loading?<CommunityLoading/>:report?<ReportDetail key={report.id} report={report} serverId={serverId} canDelete={server.permissions.includes('messages.others.delete')} onBack={()=>setSelected(null)} onChanged={()=>setRevision(v=>v+1)}/>:<>
      {!rows.length&&!error&&<p className="cv2-hint">{txa('Bu durumda bir bildirim yok.')}</p>}
      {rows.slice(0,25).map(r=><button className="cv2-report-row" key={r.id} onClick={()=>setSelected(r.id)}><span><strong>{REPORT_REASONS[r.reason]}</strong><small>#{r.channel_name}{' '}{txa('· Bildiren @')}{r.reporter.username}{' '}{txa('· Mesaj @')}{r.message.username}</small></span><time dateTime={r.created_at}>{new Date(r.created_at).toLocaleString(intlLocale())}</time><span>{txa('İncele →')}</span></button>)}
      <div className="cv2-pagination"><button disabled={cursors.length===1||loading} onClick={()=>setCursors(v=>v.slice(0,-1))}>{txa('Önceki')}</button><span>{txa('Sayfa {v1}', { v1: cursors.length })}</span><button disabled={rows.length<=25||loading} onClick={()=>setCursors(v=>[...v,rows[24].cursor])}>{txa('Sonraki')}</button></div>
    </>}
  </div>
}
function ReportDetail({report,serverId,canDelete,onBack,onChanged}:{report:CommunityReport;serverId:string;canDelete:boolean;onBack:()=>void;onChanged:()=>void}) {
  const [note,setNote]=useState(''), [busy,setBusy]=useState(false), [error,setError]=useState(''), [confirm,setConfirm]=useState(false)
  const pending=useRef(false)
  async function act(action:'resolved'|'dismissed'|'delete') {
    if(pending.current)return
    pending.current=true;setBusy(true);setError('')
    try{
      if(action==='delete')await communityV2.write('delete_message',{channel_id:report.channel_id,message_id:report.message.id})
      else await communityModeration.decide(serverId,report,action,note)
      onChanged()
    }catch(e){setError(communityError(e))}finally{pending.current=false;setBusy(false)}
  }
  return <section className="cv2-report-detail" aria-label={txa('Şikâyet ayrıntısı')}>
    <button className="cv2-back" disabled={busy} onClick={onBack}>{txa('← Listeye dön')}</button>
    <h3>{REPORT_REASONS[report.reason]} · #{report.channel_name}</h3>
    <p className="cv2-hint">{txa('Bildiren')}</p><CommunityIdentity user={report.reporter}/>
    {report.note&&<p className="cv2-report-note">{report.note}</p>}
    <article className="cv2-report-message"><p className="cv2-hint">{txa('Bildirilen mesaj ·')}{' '}{new Date(report.message.created_at).toLocaleString(intlLocale())}{report.message.edited_at&&txa(' · Düzenlenmiş')}</p><CommunityIdentity user={{...report.message,user_id:report.message.author_id}}/><CommunityMessageBody message={report.message}/>{!report.message.deleted_at&&<CommunityAttachments files={report.message.attachments}/>}</article>
    {report.status==='open'?<>
      <label>{txa('İnceleme notu (isteğe bağlı)')}<textarea value={note} maxLength={1000} disabled={busy} onChange={e=>setNote(e.target.value)}/></label>
      <p className="cv2-hint">{txa('Kararı kaydetmek mesajı silmez veya üyeye yaptırım uygulamaz. Üye yaptırımları Üyeler bölümündeki ayrı izinlere bağlıdır.')}</p>
      <div className="cv2-form-actions"><button className="cv2-secondary" disabled={busy} onClick={()=>void act('dismissed')}>{txa('Gerekçesiz bul')}</button><button className="cv2-primary" disabled={busy} onClick={()=>void act('resolved')}>{txa('Sonuçlandır')}</button></div>
    </>:<p className="cv2-report-note">{REPORT_STATES[report.status]} · @{report.reviewer_username||txa('silinmiş hesap')} · {report.reviewed_at&&new Date(report.reviewed_at).toLocaleString(intlLocale())}<br/>{report.resolution_note}</p>}
    {canDelete&&!report.message.deleted_at&&<button className="cv2-danger" disabled={busy} onClick={()=>setConfirm(v=>!v)}>{txa('Mesajı sil')}</button>}
    {confirm&&canDelete&&!report.message.deleted_at&&<div className="cv2-confirm"><p>{txa('Mesaj ve dosyaları kullanıcılara kapanacak. Şikâyeti ayrıca sonuçlandırabilirsin.')}</p><button disabled={busy} onClick={()=>void act('delete')}>{txa('Silmeyi onayla')}</button><button disabled={busy} onClick={()=>setConfirm(false)}>{txa('Vazgeç')}</button></div>}
    {error&&<p role="alert" className="cv2-error">{error}</p>}
  </section>
}
