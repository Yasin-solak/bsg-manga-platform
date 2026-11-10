import { SupportScreenshotPicker, SupportScreenshotTicket } from './SupportScreenshot'
import { uploadSupportScreenshot, type PreparedScreenshot } from '@/services/supportScreenshotService'
import { collectTechnicalReport, type TechnicalReport, type SupportContext } from '@/services/diagnosticsTypes'
import { removeSupportReport } from '@/services/diagnosticsService'
import { useEffect, useRef, useState } from 'react'
import { Link } from '@/i18n/router'
import { useAuth } from '@/contexts/AuthContext'
import { createSupportRequest, listSupportRequests, replySupportRequest, type SupportRequest } from '@/services/supportRequestService'
import { intlLocale, txa } from '@/i18n/activeLocale'

const categories = [['technical','Teknik sorun'],['account','Hesap'],['content','İçerik'],['payment','Coin / Premium'],['suggestion','Öneri'],['other','Diğer']] as const
const labels = { open:'İncelenmeyi bekliyor', answered:'Yanıtlandı', closed:'Kapatıldı' }
export function SettingsSupportForm({ adminMode = false }: { adminMode?: boolean }) {
  const { currentUser } = useAuth()
  const isAdmin = adminMode
  const [subject,setSubject]=useState(''), [message,setMessage]=useState(''), [category,setCategory]=useState('technical')
  const [rows,setRows]=useState<SupportRequest[]>([]), [busy,setBusy]=useState(false), [loading,setLoading]=useState(false)
  const [error,setError]=useState(''), [notice,setNotice]=useState(''), [all]=useState(adminMode), [page,setPage]=useState(0)
  const [replyId,setReplyId]=useState<string|null>(null), [reply,setReply]=useState('')
  const [technical,setTechnical]=useState<TechnicalReport|null>(null), [contextEnabled,setContextEnabled]=useState(false)
  const [content,setContent]=useState(''), [transaction,setTransaction]=useState('')
  const [preparingScreenshot,setPreparingScreenshot]=useState(false)
  const [screenshot,setScreenshot]=useState<PreparedScreenshot|null>(null)
  const attempt=useRef<{fingerprint:string;id:string}|null>(null)
  const userId=currentUser?.id
  const [refresh,setRefresh]=useState(0)
  useEffect(()=>{
    let cancelled=false
    setRows([]); setError(''); setLoading(Boolean(userId))
    if(userId) listSupportRequests(all&&isAdmin,page).then(data=>{if(!cancelled)setRows(data)}).catch(()=>{if(!cancelled)setError(txa('Talepler yüklenemedi. Tekrar deneyebilirsin.'))}).finally(()=>{if(!cancelled)setLoading(false)})
    return ()=>{cancelled=true}
  },[userId,all,isAdmin,page,refresh])
  if(!currentUser) return <div className="settings-row"><div><h3>{txa('Destek talebi oluştur')}</h3><p className="settings-row-description">{txa('Mesajını göndermek ve yanıtları burada takip etmek için giriş yap.')}</p><Link className="settings-action mt-4" to="/giris">{txa('Giriş yap')}</Link></div></div>
  async function submit(event:React.FormEvent){
    event.preventDefault(); if(busy||preparingScreenshot)return
    setBusy(true);setError('');setNotice('')
    const account_context:SupportContext|null=contextEnabled?{premium:Boolean(currentUser?.premiumExpiresAt && Date.parse(currentUser.premiumExpiresAt)>Date.now()),content:content.trim(),transaction:transaction.trim()}:null
    const fingerprint=JSON.stringify([subject.trim(),message.trim(),category,technical,account_context])
    if(attempt.current?.fingerprint!==fingerprint)attempt.current={fingerprint,id:crypto.randomUUID()}
    try{const id=await createSupportRequest({id:attempt.current.id,subject,message,category,technical,account_context});if(screenshot){try{await uploadSupportScreenshot(id,screenshot)}catch(reason){setError(reason instanceof Error?reason.message:txa('Talebin kayıtlı, görsel yüklenemedi. Talep kartından tekrar deneyebilirsin.'))}}setScreenshot(null);setTechnical(null);setContextEnabled(false);setContent('');setTransaction('');setSubject('');setMessage('');attempt.current=null;setNotice(txa('Talebin kaydedildi. Takip numarası: {v1}', { v1: id.slice(0,8).toUpperCase() }));setPage(0);setRefresh(v=>v+1)}catch(err){setError(err instanceof Error?err.message:txa('Talebin gönderilemedi. Yazdıkların korunuyor.'))}finally{setBusy(false)}
  }
  async function sendReply(){if(!replyId||busy)return;setBusy(true);setError('');try{await replySupportRequest(replyId,reply);setReplyId(null);setReply('');setNotice(txa('Yanıt kaydedildi.'));setRefresh(v=>v+1)}catch{setError(txa('Yanıt kaydedilemedi. Tekrar deneyebilirsin.'))}finally{setBusy(false)}}
  return <>
    {!adminMode && <form className="settings-support-form" onSubmit={event=>void submit(event)}>
      <h3>{txa('Destek ekibine yaz')}</h3><p>{txa('Sorunun ne zaman ve hangi adımlarda oluştuğunu anlat. Şifre, doğrulama kodu veya kart bilgisi paylaşma.')}</p>
      <label>{txa('Kategori')}<select value={category} disabled={busy} onChange={e=>setCategory(e.target.value)}>{categories.map(([value,label])=><option key={value} value={value}>{txa(label)}</option>)}</select></label>
      <label>{txa('Konu')}<input required minLength={5} maxLength={120} value={subject} disabled={busy} onChange={e=>setSubject(e.target.value)} placeholder={txa('Örneğin: Bölüm görselleri yüklenmiyor')} /></label>
      <label>{txa('Mesajın')}<textarea required minLength={20} maxLength={5000} rows={6} value={message} disabled={busy} onChange={e=>setMessage(e.target.value)} placeholder={txa('Yaşadığın sorunu ayrıntılarıyla yaz…')} /></label>
      <label className="settings-support-checkbox"><input type="checkbox" checked={technical!==null} disabled={busy} onChange={e=>setTechnical(e.target.checked?collectTechnicalReport():null)} />{txa('Teknik rapor ekle (isteğe bağlı)')}</label>
      {technical&&<><p>{txa('Bu bilgiler yalnız bu talebinle birlikte gönderilir, hesabına bağlanır ve 30 gün sonra günlük temizlikte kaldırılır. Otomatik tanılama izni vermez.')}</p><pre className="settings-report-preview" aria-label={txa('Gönderilecek teknik rapor')}>{JSON.stringify(technical,null,2)}</pre></>}
      <label className="settings-support-checkbox"><input type="checkbox" checked={contextEnabled} disabled={busy} onChange={e=>setContextEnabled(e.target.checked)} />{txa('Premium durumumu ve aşağıda yazdığım sorun bilgilerini ekle')}</label>
      {contextEnabled&&<><p>{txa('Premium:')} {currentUser.premiumExpiresAt&&Date.parse(currentUser.premiumExpiresAt)>Date.now()?txa('Aktif'):txa('Aktif değil')} {txa('(cihazın bildirdiği durum). Bu ek, yalnız site yöneticilerinin sorunu çözmesi için hesabına bağlanır; 30 gün sonunda kaldırılır.')}</p><label>{txa('Sorun yaşadığın manga / bölüm')}<input maxLength={120} disabled={busy} value={content} onChange={e=>setContent(e.target.value)} placeholder={txa('İsteğe bağlı: seri adı ve bölüm numarası')} /></label><label>{txa('İşlem referansı')}<input maxLength={80} pattern="[a-zA-Z0-9_\-]*" disabled={busy} value={transaction} onChange={e=>setTransaction(e.target.value)} placeholder={txa('İsteğe bağlı: işlem numarası; kart bilgisi yazma')} /></label></>}
      <SupportScreenshotPicker value={screenshot} onChange={setScreenshot} disabled={busy} onPreparing={setPreparingScreenshot} />
      <small>{message.length}/5000 · {txa('24 saatte en fazla 5 talep')}</small><button className="settings-save" disabled={busy||preparingScreenshot}>{busy?txa('Gönderiliyor…'):txa('Talebi gönder')}</button>
    </form>}
    {notice&&<p role="status" className="settings-note">{notice}</p>}
    {error&&<p role="alert" className="settings-error">{error} <button className="settings-action" onClick={()=>setRefresh(v=>v+1)}>{txa('Listeyi yenile')}</button></p>}
    <div className="flex items-center justify-between gap-3"><h3 className="font-bold">{all&&isAdmin?txa('Destek kutusu'):txa('Taleplerim')}</h3><button className="settings-action" disabled={loading} onClick={()=>setRefresh(v=>v+1)}>{txa('Yenile')}</button></div>
    {loading?<p role="status">{txa('Talepler yükleniyor…')}</p>:rows.length===0&&!error?<p className="settings-note">{txa('Henüz destek talebi yok.')}</p>:rows.map(row=><article className="settings-support-ticket" key={row.id}><div className="flex flex-wrap justify-between gap-2"><strong>{row.subject}</strong><span className="settings-note">{txa(labels[row.status])}</span></div>{adminMode&&<p className="settings-note">{txa('Gönderen:')}{' '}{row.username?<Link to={`/profil/${encodeURIComponent(row.username)}`}>@{row.username}</Link>:txa('Kullanıcı adı bulunamadı')}<br/><small>{txa('Hesap kimliği: {v1}', { v1: row.user_id })}</small> · {categories.find(([key])=>key===row.category)?.[1]}</p>}<small>#{row.id.slice(0,8).toUpperCase()} · {new Date(row.created_at).toLocaleString(intlLocale())}</small><p>{row.message}</p><SupportScreenshotTicket requestId={row.id} ownerId={row.user_id} attached={row.hasScreenshot} canEdit={!all&&Date.parse(row.created_at)>Date.now()-30*86400000} onChange={()=>setRefresh(v=>v+1)} />{(row.technical||row.account_context)&&<details><summary>{txa('Eklenen tanılama bilgileri')}</summary><pre className="settings-report-preview">{JSON.stringify({technical:row.technical,account_context:row.account_context},null,2)}</pre>{!all&&<button className="settings-action" disabled={busy} onClick={()=>{setBusy(true);void removeSupportReport(row.id).then(()=>setRefresh(v=>v+1)).catch(()=>setError(txa('Rapor kaldırılamadı.'))).finally(()=>setBusy(false))}}>{txa('Bu talebin tanılama ekini kaldır')}</button>}</details>}{row.admin_response&&<blockquote><strong>{txa('Destek yanıtı')}</strong><p>{row.admin_response}</p></blockquote>}{all&&isAdmin&&<button className="settings-action" onClick={()=>{setReplyId(row.id);setReply(row.admin_response||'')}}>{txa('Yanıt yaz')}</button>}{replyId===row.id&&<div className="settings-support-form"><label>{txa('Yanıt')}<textarea maxLength={5000} value={reply} onChange={e=>setReply(e.target.value)} /></label><button className="settings-save" disabled={busy||reply.trim().length<5} onClick={()=>void sendReply()}>{txa('Yanıtı kaydet')}</button></div>}</article>)}
    <div className="flex gap-3"><button className="settings-action" disabled={page===0||loading} onClick={()=>setPage(v=>v-1)}>{txa('Önceki')}</button><button className="settings-action" disabled={rows.length<20||loading} onClick={()=>setPage(v=>v+1)}>{txa('Sonraki')}</button></div>
  </>
}
