import { createClient } from '@supabase/supabase-js'
import { assertFileMeta, safeFileName, validateFileBytes, MAX_FILE_BYTES } from './community-file-validation.js'

const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i
const headers = { 'cache-control':'private, no-store', 'x-content-type-options':'nosniff', 'referrer-policy':'no-referrer', 'cross-origin-resource-policy':'same-origin' }
const json = (data,status=200) => new Response(JSON.stringify(data),{status,headers:{...headers,'content-type':'application/json; charset=utf-8'}})
class MediaError extends Error { constructor(status,message) { super(message); this.status=status } }
function client(env, token, service=false) {
  const key=service ? env.SUPABASE_SERVICE_ROLE_KEY : env.VITE_SUPABASE_ANON_KEY
  if (!env.VITE_SUPABASE_URL || !key) throw new MediaError(503,'Dosya servisi henüz hazır değil.')
  return createClient(env.VITE_SUPABASE_URL,key,{global:{headers:{Authorization:`Bearer ${token || key}`}},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}})
}
async function rpc(db,action,payload,worker=false) {
  const {data,error}=await db.rpc(worker?'community_v2_media_worker':'community_v2_media',{p_action:action,p_payload:payload}).abortSignal(AbortSignal.timeout(15000))
  if(error) throw new MediaError(error.code==='42501'?403:400,['42501','P0001'].includes(error.code)?error.message:'Dosya işlemi tamamlanamadı.')
  return data
}
async function boundedBody(request) {
  if(Number(request.headers.get('content-length'))>MAX_FILE_BYTES+16384) throw new MediaError(413,'Dosya isteği çok büyük.')
  if(!request.body) throw new MediaError(400,'Dosya gerekli.')
  const reader=request.body.getReader(), chunks=[]; let size=0
  const deadline=Date.now()+60000
  try { while(true) {
    let timer
    const next=await Promise.race([reader.read(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new MediaError(408,'Yükleme zaman aşımına uğradı.')),Math.max(0,deadline-Date.now()))})]).finally(()=>clearTimeout(timer))
    const {done,value}=next;if(done) break;size+=value.byteLength;if(size>MAX_FILE_BYTES+16384) throw new MediaError(413,'Dosya isteği çok büyük.');chunks.push(value)
  } }
  finally { await reader.cancel().catch(()=>{}) }
  return new Blob(chunks)
}
export async function handleCommunityFiles(request,env) {
  try {
    if(!['GET','POST','DELETE'].includes(request.method)) return new Response(null,{status:405,headers:{...headers,allow:'GET, POST, DELETE'}})
    const token=request.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1]
    if(!token) throw new MediaError(401,'Dosyalar için giriş yapmalısın.')
    if(!env.COMMUNITY_FILES_BUCKET) throw new MediaError(503,'Özel dosya deposu hazır değil.')
    const user=client(env,token), url=new URL(request.url)
    if(request.method==='GET') {
      const id=url.searchParams.get('id'); if(!UUID.test(id||'')) throw new MediaError(400,'Dosya kimliği geçersiz.')
      const meta=await rpc(user,'access',{id})
      const object=await env.COMMUNITY_FILES_BUCKET.get(meta.object_key)
      if(!object) throw new MediaError(404,'Dosya depoda bulunamadı.')
      return new Response(object.body,{headers:{...headers,'content-type':meta.content_type,'content-length':String(object.size),
        'content-disposition':`attachment; filename="download"; filename*=UTF-8''${encodeURIComponent(meta.name).replace(/['()*]/g,char=>'%'+char.charCodeAt(0).toString(16).toUpperCase())}`,
        'content-security-policy':"default-src 'none'; sandbox"}})
    }
    if(request.method==='DELETE') {
      const id=url.searchParams.get('id'); if(!UUID.test(id||'')) throw new MediaError(400,'Dosya kimliği geçersiz.')
      // An object written late while racing an ongoing upload is also caught by the scheduled cleanup.
      await rpc(user,'discard',{id}); return json({ok:true})
    }
    const id=url.searchParams.get('id'), channelId=url.searchParams.get('channel_id')
    if(!UUID.test(id||'') || !UUID.test(channelId||'')) throw new MediaError(400,'Dosya veya kanal kimliği geçersiz.')
    if(!request.headers.get('content-type')?.startsWith('multipart/form-data;')) throw new MediaError(400,'Dosya isteği geçersiz.')
    // Channel and session are checked without reading the body; permission is checked again before saving.
    const {error}=await user.rpc('community_v2_read',{p_action:'messages',p_payload:{channel_id:channelId,before:'0'}}).abortSignal(AbortSignal.timeout(15000))
    if(error) throw new MediaError(403,'Bu kanala erişimin yok.')
    const body=await boundedBody(request)
    const form=await new Response(body,{headers:{'content-type':request.headers.get('content-type')}}).formData()
    const file=form.get('file')
    if(!(file instanceof File)) throw new MediaError(400,'Dosya gerekli.')
    try { assertFileMeta(file) } catch(e) { throw new MediaError(400,e.message) }
    const bytes=new Uint8Array(await file.arrayBuffer())
    try { validateFileBytes(bytes,file.type) } catch(e) { throw new MediaError(400,e.message) }
    const sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('')
    const meta=await rpc(user,'prepare',{id,channel_id:channelId,name:safeFileName(file.name),content_type:file.type,byte_size:bytes.length,sha256})
    if(meta.state!=='ready') {
      // Concurrent repeats of the same key cannot change the object; the hash is fixed in the DB.
      await env.COMMUNITY_FILES_BUCKET.put(meta.object_key,bytes,{onlyIf:{etagDoesNotMatch:'*'},sha256,
        httpMetadata:{contentType:file.type,cacheControl:'private, no-store'}})
      await rpc(client(env,null,true),'complete',{id,sha256},true)
    }
    return json({id:meta.id,name:meta.name,content_type:meta.content_type,byte_size:meta.byte_size})
  } catch(error) { return json({error:error instanceof MediaError?error.message:'Dosya servisine ulaşılamadı. Tekrar deneyebilirsin.'},error instanceof MediaError?error.status:503) }
}
export async function cleanupCommunityFiles(env) {
  const db=client(env,null,true)
  const keys=await rpc(db,'collect',{},true)
  if(keys.length) await env.COMMUNITY_FILES_BUCKET.delete(keys)
  // Even if no new object is deleted, expired cleaned-up metadata is pruned on every run.
  await rpc(db,'purged',{keys},true)
  return keys.length
}
