import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {createClient} from '@supabase/supabase-js'
import {loadProjectEnv} from './lib/project-env.mjs'

// Only a temporary, invite-only test room. Results keep no session or message text.
const args=Object.fromEntries(process.argv.slice(2).map(v=>v.replace(/^--/,'').split('=')))
assert.ok(args.state&&args.output&&args.mode,'state, output ve mode gerekli')
const fixture=JSON.parse(fs.readFileSync(args.state,'utf8'))
assert.equal(fixture.testOnly,true);assert.equal(args['confirm-live'],fixture.project)
loadProjectEnv({cwd:process.cwd()})
const url=process.env.VITE_SUPABASE_URL,key=process.env.VITE_SUPABASE_ANON_KEY
assert.equal(new URL(url).hostname,`${fixture.project}.supabase.co`)
const opts={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}}
const clients=fixture.actors.map(a=>createClient(url,key,{...opts,global:{headers:{Authorization:`Bearer ${a.token}`}}}))
const times={},errors=[],recentTimes=[],started=performance.now();let bytes=0,total=0,stopped=''
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))
const summary=values=>{const a=[...values].sort((x,y)=>x-y),at=p=>Math.round(a[Math.min(a.length-1,Math.floor(a.length*p))]||0);return {count:a.length,p50_ms:at(.5),p95_ms:at(.95),p99_ms:at(.99),max_ms:at(1)}}
async function rpc(client,endpoint,action,payload={}) {
  const begin=performance.now(),{data,error,status}=await client.rpc(`community_v2_${endpoint}`,{p_action:action,p_payload:payload}).abortSignal(AbortSignal.timeout(8000))
  const elapsed=performance.now()-begin,label=`${endpoint}.${action}`
  ;(times[label]??=[]).push(elapsed);recentTimes.push(elapsed);if(recentTimes.length>200)recentTimes.shift();total++
  if(error){errors.push({action:label,status,code:error.code||'network'});const failure=Error(`${label}: ${error.code||status}`);failure.recorded=true;throw failure}
  bytes+=Buffer.byteLength(JSON.stringify(data));return data
}
const serverId=fixture.servers[0],channelId=fixture.channels[0]
const metadata=await rpc(clients[0],'read','server',{server_id:serverId})
assert.equal(metadata.profile.kind,'room');assert.equal(metadata.profile.join_mode,'invite')
assert.match(metadata.profile.name,/performans/)
const initial=await rpc(clients[1],'read','messages',{channel_id:channelId})
const ids=initial.map(m=>m.id),samples=[]
if(args.mode==='baseline'||args.mode==='ack') {
  for(let i=0;i<12;i++) {
    const begin=performance.now(),client=clients[i%clients.length]
    const sent=await rpc(client,'write','send',{channel_id:channelId,client_id:randomUUID(),body:`Okuma buluşması için birlikte hazırlanan not ${i+1}.`})
    const ack=performance.now()-begin
    if(args.mode==='baseline') {
      await rpc(client,'read','server',{server_id:serverId})
      await Promise.all([rpc(client,'read','messages',{channel_id:channelId}),rpc(client,'read','message_snapshot',{channel_id:channelId,ids})])
    }else assert.equal(sent.message?.id,sent.id,'Gönderim cevabında yetkili mesaj bulunmalı')
    samples.push({ack_ms:Math.round(ack),visible_after_ms:Math.round(performance.now()-begin)})
    await sleep(800)
  }
}else if(args.mode==='http') {
  const rps=Number(args.rps||5),seconds=Number(args.seconds||60),ceiling=Number(args.concurrency||16)
  assert.ok(Number.isInteger(rps)&&rps>0&&rps<=100&&seconds>=10&&seconds<=300&&Number.isInteger(ceiling)&&ceiling>0&&ceiling<=32)
  let active=0,scheduled=0,skipped=0;const jobs=new Set(),lags=[];const stageStart=performance.now()
  for(let n=0;n<rps*seconds&&!stopped;n++) {
    if(args['stop-file']&&fs.existsSync(args['stop-file'])){stopped='Dış sağlık denetimi yükü durdurdu.';break}
    const due=stageStart+n*1000/rps;await sleep(Math.max(0,due-performance.now()))
    if(active>=ceiling){skipped++;continue}
    scheduled++;active++;lags.push(Math.max(0,performance.now()-due))
    const client=clients[n%clients.length],c=fixture.channels[n%fixture.channels.length]
    const op=n%20
    const job=(async()=>{
      try {
        if(op<11)await rpc(client,'read',args.combined==='true'?'message_refresh':'messages',{channel_id:c,ids:c===channelId?ids:[]})
        else if(op<14)await rpc(client,'read',args.activity==='true'?'activity':'server',{server_id:serverId})
        else if(op<16)await rpc(client,'read','message_snapshot',{channel_id:channelId,ids})
        else if(op<18)await rpc(client,'read','members',{server_id:serverId,channel_id:c})
        else if(op===18)await rpc(client,'personal','presence',{channel_id:c})
        else if(args.writes==='true') {
          const sent=await rpc(clients[Math.floor(n/20)%clients.length],'write','send',{channel_id:fixture.channels[Math.floor(n/20)%fixture.channels.length],client_id:randomUUID(),body:'Okuma kulübünün yoğun katılım sırasında paylaşılan notu.'})
          assert.equal(sent.message?.id,sent.id,'Yazma cevabında yetkili mesaj eksik')
        }else await rpc(client,'personal','search',{channel_id:c,search:'buluşması',has_files:false})
      }catch(error){if(!error.recorded)errors.push({action:'verification',code:error.code||'network'});if(errors.length>=3)stopped='Üç başarısız istek; canlı yük otomatik durduruldu.'}
      finally{active--}
    })();jobs.add(job);void job.finally(()=>jobs.delete(job))
    if(n&&n%(rps*10)===0){const p=summary(recentTimes);console.log(JSON.stringify({progress_seconds:Math.round((performance.now()-stageStart)/1000),requests:total,active,p95_ms:p.p95_ms,errors:errors.length}));if(p.p95_ms>3000)stopped='p95 3 saniyeyi aştı; daha yüksek aşama uygulanmamalı.'}
    if(bytes>200*1024*1024)stopped='200 MiB ölçüm bütçesine ulaşıldı.'
  }
  await Promise.allSettled(jobs);samples.push({rps,seconds,scheduled,skipped,start_lag:summary(lags)})
}else throw Error('Bilinmeyen test modu')
const result={mode:args.mode,workload:args.writes==='true'?'mixed-95-read-5-send':'read-heavy',project:fixture.project,started_at:new Date(Date.now()-(performance.now()-started)).toISOString(),duration_ms:Math.round(performance.now()-started),total,bytes,errors,stopped,metrics:Object.fromEntries(Object.entries(times).map(([k,v])=>[k,summary(v)])),samples}
fs.mkdirSync(path.dirname(args.output),{recursive:true});fs.writeFileSync(args.output,JSON.stringify(result,null,2))
console.log(JSON.stringify(result));if(stopped||errors.length||samples.some(s=>s.skipped>0))process.exitCode=2
