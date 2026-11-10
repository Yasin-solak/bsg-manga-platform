import { useEffect, useRef, useState } from 'react'
import { Download, FileText } from 'lucide-react'
import { readCommunityFile, type CommunityAttachment } from '@/services/communityFilesService'
import { txa } from '@/i18n/activeLocale'

function Attachment({file}:{file:CommunityAttachment}) {
  const {id,name,content_type,byte_size}=file
  const host=useRef<HTMLLIElement>(null), downloadRequest=useRef<AbortController|null>(null), [visible,setVisible]=useState(false), [url,setUrl]=useState(''), [error,setError]=useState(''), [busy,setBusy]=useState(false), [attempt,setAttempt]=useState(0)
  const image=file.content_type.startsWith('image/')
  useEffect(()=>()=>downloadRequest.current?.abort(),[])
  useEffect(()=>{const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){setVisible(true);observer.disconnect()}},{rootMargin:'100px'});if(host.current)observer.observe(host.current);return()=>observer.disconnect()},[])
  useEffect(()=>{
    if(!visible||!image)return
    const controller=new AbortController();let blobUrl='';setBusy(true);setError('')
    void readCommunityFile({id,name,content_type,byte_size},AbortSignal.any([controller.signal,AbortSignal.timeout(60000)])).then(blob=>{if(controller.signal.aborted)return;blobUrl=URL.createObjectURL(blob);setUrl(blobUrl)}).catch(e=>{if(!controller.signal.aborted)setError(e.message)}).finally(()=>{if(!controller.signal.aborted)setBusy(false)})
    return()=>{controller.abort();if(blobUrl)URL.revokeObjectURL(blobUrl)}
  },[id,name,content_type,byte_size,visible,image,attempt]) // The file id does not change; the polling object does not repeat requests.
  async function download() {
    const controller=new AbortController();downloadRequest.current=controller
    setBusy(true);setError('')
    try {const blob=await readCommunityFile(file,AbortSignal.any([controller.signal,AbortSignal.timeout(60000)]));if(controller.signal.aborted)return;const value=URL.createObjectURL(blob), a=document.createElement('a');a.href=value;a.download=file.name;a.click();setTimeout(()=>URL.revokeObjectURL(value),1000)}
    catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:txa('Dosya indirilemedi.'))}
    finally{if(!controller.signal.aborted)setBusy(false)}
  }
  return <li ref={host}>{image?(url?<img src={url} alt={file.name} onError={()=>{setUrl('');setError(txa('Görsel dosyası tarayıcıda açılamadı.'))}}/>:<div className="cv2-file-placeholder" aria-busy={busy}>{error?txa('Görsel açılamadı'):txa('Görsel yükleniyor…')}</div>):<FileText size={26}/>}
    <div><strong>{file.name}</strong><small>{Math.ceil(file.byte_size/1024)} KB</small></div><button type="button" disabled={busy} onClick={()=>void download()} aria-label={txa('{v1} dosyasını indir', { v1: file.name })}><Download size={17}/></button>
    {error&&<p role="alert">{error}{image&&<button onClick={()=>setAttempt(n=>n+1)}>{txa('Tekrar dene')}</button>}</p>}
  </li>
}
export function CommunityAttachments({files}:{files:CommunityAttachment[]}) {
  if(!files.length)return null
  return <ul className="cv2-attachments" aria-label={txa('Paylaşılan dosyalar')}>{files.map(file=><Attachment key={file.id} file={file}/>)}</ul>
}
