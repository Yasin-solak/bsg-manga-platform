import { useCallback, useEffect, useRef, useState } from 'react'
import { discardCommunityFile, uploadCommunityFile, validateCommunityFile, type CommunityAttachment } from '@/services/communityFilesService'
import { txa } from '@/i18n/activeLocale'

export type PendingCommunityFile = {id:string; file:File; progress:number; status:'uploading'|'ready'|'error'; error?:string; result?:CommunityAttachment; controller:AbortController}
export function useCommunityFiles(channelId:string) {
  const [files,setFiles]=useState<PendingCommunityFile[]>([]), [error,setError]=useState('')
  const current=useRef<PendingCommunityFile[]>([]), alive=useRef(true)
  const update=useCallback((next:PendingCommunityFile[])=>{current.current=next;if(alive.current)setFiles(next)},[])
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;current.current.forEach(item=>{item.controller.abort();void discardCommunityFile(item.id).catch(()=>{})});current.current=[]}},[])
  function run(item:PendingCommunityFile) {
    void uploadCommunityFile(channelId,item.id,item.file,item.controller.signal,progress=>{
      update(current.current.map(row=>row.id===item.id?{...row,progress}:row))
    }).then(result=>{update(current.current.map(row=>row.id===item.id?{...row,result,status:'ready'}:row))})
      .catch(e=>{if(!item.controller.signal.aborted)update(current.current.map(row=>row.id===item.id?{...row,status:'error',error:e instanceof Error?e.message:txa('Yükleme tamamlanamadı.')}:row))})
  }
  return {files,error, busy:files.some(f=>f.status==='uploading'), ready:files.every(f=>f.status==='ready'),
    add(selected:FileList|null) {
      if(!selected)return
      setError('')
      if(current.current.length+selected.length>4){setError(txa('Bir mesajda en fazla 4 dosya paylaşabilirsin.'));return}
      try {Array.from(selected).forEach(validateCommunityFile)} catch(e){setError((e as Error).message);return}
      const next=Array.from(selected).map(file=>({id:crypto.randomUUID(),file,progress:0,status:'uploading' as const,controller:new AbortController()}))
      update([...current.current,...next]);next.forEach(run)
    },
    remove(id:string) {const item=current.current.find(f=>f.id===id);if(!item)return;item.controller.abort();update(current.current.filter(f=>f.id!==id));void discardCommunityFile(id).catch(()=>{})},
    retry(id:string) {const item=current.current.find(f=>f.id===id);if(!item||item.status!=='error')return;const next={...item,status:'uploading' as const,error:undefined,controller:new AbortController()};update(current.current.map(f=>f.id===id?next:f));run(next)},
    sent(){update([]);setError('')},
  }
}
