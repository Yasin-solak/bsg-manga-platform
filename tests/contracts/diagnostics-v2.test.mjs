import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import ts from 'typescript'
import {handleCleanup} from '../../supabase/functions/support-screenshot-cleanup/index.js'
const require=createRequire(import.meta.url)
const read=p=>readFileSync(new URL('../../'+p,import.meta.url),'utf8')
function load(p,mocks={}){const value={};new Function('require','exports',ts.transpileModule(read(p),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(name=>mocks[name]??require(name),value);return value}
const performance=load('src/services/diagnosticPerformance.ts')
assert.deepEqual(performance.cleanPerformanceMetric({name:'LCP',value:2543,id:'ephemeral',entries:[{url:'private',text:'secret'}]}),{key:'ephemeral',code:'lcp',value:2540})
assert.equal(performance.cleanPerformanceMetric({name:'INP',value:NaN,id:'x'}),null)
assert.equal(performance.cleanPerformanceMetric({name:'SECRET',value:1,id:'x'}),null)
assert.equal(performance.cleanPerformanceMetric({name:'CLS',value:0.25678,id:'x'}).value,0.257)
const env={SUPABASE_URL:'https://project.invalid',SUPABASE_SERVICE_ROLE_KEY:'local-test-key'}
const request=body=>new Request('https://project.invalid/function',{method:'POST',body:JSON.stringify(body)})
let calls=[]
assert.equal((await handleCleanup(request({secret:'bad'}),env,async()=>{throw Error('ağa çıkmamalı')})).status,401)
const secret='a'.repeat(64),path='11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/screenshot.jpg'
const fake=async(url,opts)=>{calls.push({url,opts});return new Response(JSON.stringify(url.includes('claim_')?[path]:{}),{status:200})}
assert.equal((await handleCleanup(request({secret}),env,fake)).status,200)
assert.equal(calls.length,3)
assert.ok(calls[1].url.endsWith('/storage/v1/object/support-screenshots'))
assert.deepEqual(JSON.parse(calls[1].opts.body),{prefixes:[path]})
calls=[]
assert.equal((await handleCleanup(request({secret}),env,async(url)=>{calls.push(url);return new Response(JSON.stringify(['../other-bucket/file']),{status:200})})).status,503)
assert.equal(calls.length,1,'an out-of-scope object path must not be deleted')
calls=[]
assert.equal((await handleCleanup(request({secret}),env,async(url)=>{calls.push(url);return new Response(url.includes('claim_')?JSON.stringify([path]):'{}',{status:url.includes('claim_')?200:503})})).status,503)
assert.equal(calls.length,2,'if deletion fails the last cleanup time must not advance')
const schema=read('supabase/migrations/20260915135532_support_screenshots_performance_alerts.sql')
assert.match(schema,/count\(\*\)>=20 and count\(distinct user_id\)>=5/)
assert.match(schema,/metric_value is not null/)
assert.match(schema,/on conflict do nothing/)
assert.match(schema,/allowed_mime_types/)
assert.ok(!/delete from storage\.objects/i.test(schema),'objects must not be deleted via SQL')
console.log('PASS performance cleanup, diagnostics alarm thresholds and bounded Storage API cleanup')
