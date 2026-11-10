import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { createRequire } from 'node:module'
import { activeLocaleShim } from './i18n-source.mjs'
const require=createRequire(import.meta.url)
const read=p=>readFileSync(new URL('../../'+p,import.meta.url),'utf8')
const calls=[]
let insertError=null, duplicate=null, replyError=null
const client={auth:{getUser:async()=>({data:{user:{id:'owner'}},error:null})},from:()=>({
  insert:async payload=>{calls.push(payload);return {error:insertError}},
  select:()=>({eq:()=>({maybeSingle:async()=>({data:duplicate,error:null})})}),
  update:()=>({eq:()=>({select:()=>({single:async()=>({data:replyError?null:{id:'ok'},error:replyError})})})}),
})}
const mocks={'./supabase':{supabase:client},'./apiResilience':{withServiceTimeout:async fn=>fn()},'./requestContext':{createRequestContext:()=>({})},'./logger':{createScopedLogger:()=>({})},'./userFacingError':{reportUserFacingError:()=>{}}}
const types={}
new Function('require','exports',ts.transpileModule(read('src/services/diagnosticsTypes.ts'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(require,types)
mocks['./diagnosticsTypes']=types
const exports={}
new Function('require','exports',ts.transpileModule(read('src/services/supportRequestService.ts'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)((name) => name === '@/i18n/activeLocale' ? activeLocaleShim : mocks[name]||require(name),exports)
const input={id:'11111111-1111-4111-8111-111111111111',category:'technical',subject:'  Teknik destek  ',message:'Form kaydı için yeterince uzun bir açıklama.'}
assert.equal(await exports.createSupportRequest(input),input.id)
assert.equal(calls[0].subject,'Teknik destek')
await assert.rejects(()=>exports.createSupportRequest({...input,message:'kısa'}))
assert.equal(calls.length,1,'an invalid message must not reach the network')
insertError={code:'23505'};duplicate={id:input.id}
assert.equal(await exports.createSupportRequest(input),input.id,'on an uncertain network result the same id must not produce a double record')
duplicate=null;await assert.rejects(()=>exports.createSupportRequest(input),'Başkasının id çakışması başarı sayılmamalı')
insertError={code:'P0001'};await assert.rejects(()=>exports.createSupportRequest(input),/24 saat/)
replyError={code:'42501'};await assert.rejects(()=>exports.replySupportRequest(input.id,'Geçerli yanıt metni'))
const css=read('src/pages/settings/settings.css')
assert.match(css,/translate:22px 0;transform:none/,'Tailwind translate and transform must not apply on top of each other')
assert.ok(!read('src/pages/settings/SettingsAccountSection.tsx').includes('Düzeltme iste'))
assert.match(read('supabase/migrations/20260914150413_support_requests.sql'),/pg_advisory_xact_lock/)
console.log('PASS support validation, idempotent retry, rejection errors, notification key and birth date')

const pattern=read('src/pages/settings/SettingsSupportForm.tsx').match(/pattern="([^"]+)"/)[1]
assert.ok(new RegExp('^(?:'+pattern+')$', 'v').test('REF_123-ABC'))
assert.ok(!new RegExp('^(?:'+pattern+')$', 'v').test('https://private'))
await assert.rejects(()=>exports.createSupportRequest({...input,account_context:{premium:false,content:'',transaction:'invalid /'}}),/İşlem referansı/)
