import assert from 'node:assert/strict'
import {assertFileMeta,safeFileName,validateFileBytes} from '../../functions/_shared/community-file-validation.js'
import {handleCommunityFiles,cleanupCommunityFiles} from '../../functions/_shared/community-files.js'
const encode=value=>new TextEncoder().encode(value)
assertFileMeta({name:'Notlar.txt',size:12,type:'text/plain'})
for(const file of [{name:'x.html',size:12,type:'text/html'},{name:'x.svg',size:12,type:'image/svg+xml'},{name:'x.txt',size:0,type:'text/plain'},{name:'x.png',size:10485761,type:'image/png'},{name:'x.pdf',size:10,type:'text/plain'}])assert.throws(()=>assertFileMeta(file))
assert.equal(safeFileName('a/../b\n.txt'),'a_.._b_.txt')
assert.equal(safeFileName('a\u202eb\u0000\u007f.txt'),'a_b__.txt')
validateFileBytes(encode('Bölüm üzerine okuma notları.'),'text/plain')
validateFileBytes(encode('Başlık\r\n\tNotlar'),'text/plain')
assert.throws(()=>validateFileBytes(encode('Gizli\u0000kontrol'),'text/plain'))
assert.throws(()=>validateFileBytes(Uint8Array.from([255,0]),'text/plain'))
assert.throws(()=>validateFileBytes(encode('<svg></svg>'),'image/png'))
validateFileBytes(encode('%PDF-1.7\n%%EOF'),'application/pdf')
assert.throws(()=>validateFileBytes(encode('%PDF-1.7\nEksik'),'application/pdf'))
const id='11111111-1111-4111-8111-111111111111', channel='22222222-2222-4222-8222-222222222222'
const key=`community/${id}`, calls=[], objects=new Map(), nativeFetch=globalThis.fetch
let denied=false, completed=false, collection=[key]
const env={VITE_SUPABASE_URL:'https://unit.supabase.co',VITE_SUPABASE_ANON_KEY:'unit-anon',SUPABASE_SERVICE_ROLE_KEY:'unit-service',COMMUNITY_FILES_BUCKET:{
  async get(k){calls.push(['get',k]);return objects.get(k)},
  async put(k,bytes,options){calls.push(['put',k,options]);objects.set(k,{body:bytes,size:bytes.length})},
  async delete(keys){calls.push(['delete',keys]);for(const k of keys)objects.delete(k)},
}}
globalThis.fetch=async(input,init)=>{
  const url=String(input), p=JSON.parse(init.body);calls.push(['rpc',p.p_action,init.headers])
  if(denied)return Response.json({code:'42501',message:'Oda erişimi yok.'},{status:403})
  if(url.endsWith('/community_v2_read'))return Response.json([])
  if(p.p_action==='prepare')return Response.json({id,object_key:key,state:completed?'ready':'pending',...p.p_payload})
  if(p.p_action==='complete'){assert.equal(new Headers(init.headers).get('authorization'),'Bearer unit-service');completed=true;return Response.json({ok:true})}
  if(p.p_action==='access')return Response.json({id,object_key:key,name:'Notlar.txt',content_type:'text/plain',byte_size:5})
  if(p.p_action==='collect')return Response.json(collection)
  return Response.json({ok:true})
}
const request=(method,body,auth=true)=>new Request(`https://local/api/community/files?id=${id}&channel_id=${channel}`,{method,body,headers:auth?{Authorization:'Bearer unit-user'}:{}})
try{
  assert.equal((await handleCommunityFiles(request('GET',undefined,false),env)).status,401)
  assert.equal((await handleCommunityFiles(request('PATCH'),env)).status,405)
  denied=true
  assert.equal((await handleCommunityFiles(request('GET'),env)).status,403)
  assert.equal(calls.filter(x=>x[0]==='get').length,0)
  denied=false
  const form=new FormData();form.set('file',new File(['Not 1'],'Notlar.txt',{type:'text/plain'}))
  const upload=await handleCommunityFiles(request('POST',form),env)
  assert.equal(upload.status,200,await upload.clone().text());assert.equal((await upload.json()).id,id)
  assert.equal(calls.find(x=>x[0]==='put')[2].onlyIf.etagDoesNotMatch,'*')
  assert.equal((await handleCommunityFiles(request('POST',form),env)).status,200)
  assert.equal(calls.filter(x=>x[0]==='put').length,1)
  const get=await handleCommunityFiles(request('GET'),env)
  assert.equal(await get.text(),'Not 1');assert.equal(get.headers.get('cache-control'),'private, no-store');assert.match(get.headers.get('content-disposition'),/^attachment;/)
  assert.equal(await cleanupCommunityFiles(env),1);assert.equal(objects.size,0)
  collection=[]
  const acknowledgements=calls.filter(x=>x[0]==='rpc'&&x[1]==='purged').length
  assert.equal(await cleanupCommunityFiles(env),0)
  assert.equal(calls.filter(x=>x[0]==='rpc'&&x[1]==='purged').length,acknowledgements+1)
  assert.equal(calls.filter(x=>x[0]==='delete').length,1)
  assert.equal((await handleCommunityFiles(request('GET'),env)).status,404)
  const spoof=new FormData();spoof.set('file',new File(['<html>'],'resim.png',{type:'image/png'}))
  assert.equal((await handleCommunityFiles(request('POST',spoof),env)).status,400)
}finally{globalThis.fetch=nativeFetch}
console.log('PASS community files: type/size, real content, authorized R2 access, retry, cache and cleanup')
