import { useEffect, useRef, useState } from 'react'
import { Paperclip, X } from 'lucide-react'
import { COMMUNITY_FILE_ACCEPT } from '@/services/communityFilesService'
import type { useCommunityFiles, PendingCommunityFile } from './useCommunityFiles'
import { txa } from '@/i18n/activeLocale'
function FileDraft({item,disabled,remove,retry}:{item:PendingCommunityFile;disabled:boolean;remove:()=>void;retry:()=>void}) {
  const [preview,setPreview]=useState('')
  useEffect(()=>{if(!item.file.type.startsWith('image/'))return;const url=URL.createObjectURL(item.file);setPreview(url);return()=>URL.revokeObjectURL(url)},[item.file])
  return <li>{preview&&<img src={preview} alt="" />}<div><strong>{item.file.name}</strong><small>{Math.ceil(item.file.size/1024)} KB · {item.status==='ready'?txa('Gönderilmeye hazır'):item.status==='error'?txa('Yüklenemedi'):txa('Yükleniyor %{v1}', { v1: item.progress })}</small>
    {item.status==='uploading'&&<progress max={100} value={item.progress} aria-label={txa('{v1} yükleniyor', { v1: item.file.name })} />}
    {item.error&&<span role="alert">{item.error} <button type="button" onClick={retry} disabled={disabled}>{txa('Yeniden yükle')}</button></span>}</div>
    <button type="button" aria-label={txa('{v1} dosyasını kaldır', { v1: item.file.name })} onClick={remove} disabled={disabled}><X size={16}/></button></li>
}
export function CommunityFileComposer({uploads,disabled,canUpload}:{uploads:ReturnType<typeof useCommunityFiles>;disabled:boolean;canUpload:boolean}) {
  const input=useRef<HTMLInputElement>(null)
  return <section className="cv2-file-composer" aria-label={txa('Mesaj dosyaları')}>
    {!!uploads.files.length&&<ul>{uploads.files.map(item=><FileDraft key={item.id} item={item} disabled={disabled} remove={()=>uploads.remove(item.id)} retry={()=>uploads.retry(item.id)}/>)}</ul>}
    {uploads.error&&<p role="alert" className="cv2-error">{uploads.error}</p>}
    {canUpload&&<><input ref={input} type="file" hidden multiple accept={COMMUNITY_FILE_ACCEPT} onChange={e=>{uploads.add(e.target.files);e.target.value=''}}/>
      <button type="button" disabled={disabled||uploads.files.length>=4} onClick={()=>input.current?.click()}><Paperclip size={15}/> {txa('Dosya ekle')}</button><small>{txa('En fazla 4 dosya · Her biri 10 MB · Görsel, PDF, TXT')}</small></>}
  </section>
}
