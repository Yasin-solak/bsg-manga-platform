import { z } from 'zod'
import { getCurrentAccessToken } from '@/services/authService/shared'
import { txa } from '@/i18n/activeLocale'

export const communityAttachmentSchema = z.object({ id:z.string().uuid(), name:z.string().min(1).max(120), content_type:z.enum(['image/jpeg','image/png','image/webp','image/gif','application/pdf','text/plain']), byte_size:z.number().int().min(1).max(10*1024*1024) })
export type CommunityAttachment = z.infer<typeof communityAttachmentSchema>
export const COMMUNITY_FILE_ACCEPT = '.jpg,.jpeg,.png,.webp,.gif,.pdf,.txt'
const endpoint='/api/community/files'
async function authorization() {
  const token=await getCurrentAccessToken()
  if(!token) throw new Error(txa('Dosya paylaşmak için tekrar giriş yapmalısın.'))
  return `Bearer ${token}`
}
async function failed(response:Response) {
  const value=await response.json().catch(()=>null)
  return new Error(z.object({error:z.string()}).safeParse(value).data?.error || txa('Dosya işlemi tamamlanamadı.'))
}
export function validateCommunityFile(file:File) {
  const types:Record<string,string[]>={'image/jpeg':['jpg','jpeg'],'image/png':['png'],'image/webp':['webp'],'image/gif':['gif'],'application/pdf':['pdf'],'text/plain':['txt']}
  if(!types[file.type]?.includes(file.name.split('.').pop()?.toLowerCase()||'')) throw new Error(txa('JPG, PNG, WebP, GIF, PDF veya TXT dosyası seç.'))
  if(!file.size || file.size>10*1024*1024) throw new Error(txa('Dosya boş olamaz ve en fazla 10 MB olabilir.'))
}
export async function uploadCommunityFile(channelId:string,id:string,file:File,signal:AbortSignal,onProgress:(value:number)=>void):Promise<CommunityAttachment> {
  validateCommunityFile(file)
  const auth=await authorization()
  signal.throwIfAborted()
  return new Promise((resolve,reject)=>{
    const xhr=new XMLHttpRequest(), form=new FormData(); form.set('file',file)
    const abort=()=>xhr.abort()
    const done=()=>signal.removeEventListener('abort',abort)
    xhr.open('POST',`${endpoint}?channel_id=${encodeURIComponent(channelId)}&id=${encodeURIComponent(id)}`)
    xhr.timeout=60000; xhr.setRequestHeader('Authorization',auth)
    xhr.upload.onprogress=e=>{ if(e.lengthComputable) onProgress(Math.min(99,Math.round(e.loaded/e.total*100))) }
    xhr.onerror=()=>{done();reject(new Error(txa('Yükleme kesildi. Yeniden deneyebilirsin.')))}
    xhr.ontimeout=()=>{done();reject(new Error(txa('Yükleme zaman aşımına uğradı. Yeniden deneyebilirsin.')))}
    xhr.onabort=()=>{done();reject(new DOMException(txa('Yükleme iptal edildi.'),'AbortError'))}
    xhr.onload=()=>{
      done()
      let payload:unknown=null
      try {payload=JSON.parse(xhr.responseText)} catch { /* Proxy kesintisi boş veya HTML yanıt döndürebilir. */ }
      try {
        if(xhr.status<200 || xhr.status>=300) throw new Error(z.object({error:z.string()}).safeParse(payload).data?.error || txa('Dosya yüklenemedi.'))
        const result=communityAttachmentSchema.safeParse(payload)
        if(!result.success) throw new Error(txa('Dosya servisinden geçerli yanıt alınamadı. Tekrar deneyebilirsin.'))
        resolve(result.data); onProgress(100)
      } catch(e) {reject(e)}
    }
    signal.addEventListener('abort',abort,{once:true}); xhr.send(form)
  })
}
export async function discardCommunityFile(id:string) {
  const response=await fetch(`${endpoint}?id=${encodeURIComponent(id)}`,{method:'DELETE',headers:{Authorization:await authorization()},signal:AbortSignal.timeout(15000)})
  if(!response.ok) throw await failed(response)
}
export async function readCommunityFile(file:CommunityAttachment,signal:AbortSignal) {
  const response=await fetch(`${endpoint}?id=${encodeURIComponent(file.id)}`,{headers:{Authorization:await authorization()},signal,cache:'no-store'})
  if(!response.ok) throw await failed(response)
  const blob=await response.blob()
  if(blob.size!==file.byte_size || blob.type!==file.content_type) throw new Error(txa('Dosya içeriği doğrulanamadı.'))
  return blob
}
