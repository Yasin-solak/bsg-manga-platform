import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import ts from 'typescript'
const require=createRequire(import.meta.url)
const read=p=>readFileSync(new URL('../../'+p,import.meta.url),'utf8')
function compile(p,mocks={}) {
  const result={}
  new Function('require','exports',ts.transpileModule(read(p),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText)(name=>mocks[name]??require(name),result)
  return result
}
const types=compile('src/services/diagnosticsTypes.ts')
const technical={version:1,build:'abc123',browser:'Firefox',browserMajor:130,os:'Windows',device:'desktop',width:1900,height:1100,theme:'dark',reducedMotion:false,online:true,notification:'default',serviceWorker:false}
assert.equal(types.technicalSchema.safeParse(technical).success,true)
for(const extra of [{token:'secret'},{email:'private@example.org'},{query:'arama'},{message:'özel mesaj'}]) assert.equal(types.technicalSchema.safeParse({...technical,...extra}).success,false)
assert.equal(types.technicalSchema.safeParse({...technical,browser:'token-value'}).success,false)
assert.equal(types.supportContextSchema.safeParse({premium:true,content:'Seri / bölüm 5',transaction:'REF_123'}).success,true)
assert.equal(types.supportContextSchema.safeParse({premium:true,content:'',transaction:'https://secret?token=x'}).success,false)
for(const p of ['/oku/private/5?token=secret','/manga/private/bolum/5']) assert.equal(types.routeCategory(p),'reader')
assert.equal(types.routeCategory('/profil/private?email=x'),'profil')
assert.equal(types.routeCategory('/unknown-private-value'),'other')

let effect,cleanup,listener,consent=false,pendingConsent=null
const listeners=new Map(),sent=[]
const old={window:globalThis.window,navigator:globalThis.navigator,location:globalThis.location,HTMLImageElement:globalThis.HTMLImageElement,HTMLVideoElement:globalThis.HTMLVideoElement,document:globalThis.document,BroadcastChannel:globalThis.BroadcastChannel}
Object.defineProperty(globalThis,'navigator',{value:{onLine:true},configurable:true})
globalThis.location={pathname:'/kesfet'}
globalThis.HTMLImageElement=class {}
globalThis.HTMLVideoElement=class {}
globalThis.BroadcastChannel=undefined
globalThis.document={addEventListener:()=>{},removeEventListener:()=>{}}
globalThis.window={setInterval:()=>1,clearInterval:()=>{},addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:(name,fn)=>{if(listeners.get(name)===fn)listeners.delete(name)}}
const runtime=compile('src/components/common/DiagnosticsRuntime.tsx',{
  react:{useEffect:fn=>{effect=fn}},
  '@/contexts/AuthContext':{useAuth:()=>({currentUser:{id:'test'}})},
  '@/services/diagnosticsTypes':{...types,collectTechnicalReport:()=>technical},
  '@/services/diagnosticPerformance':{startPerformanceMeasurements:()=>()=>{}},
  '@/services/diagnosticsService':{diagnosticCollectionEnabled:async()=>true,readDiagnosticConsent:()=>pendingConsent??Promise.resolve(consent),sendDiagnosticEvent:async event=>{sent.push(event)}},
  '@/services/diagnosticSignal':{setDiagnosticListener:fn=>{listener=fn}},
})
runtime.DiagnosticsRuntime();cleanup=effect();await new Promise(resolve=>setImmediate(resolve))
assert.equal(listener,undefined,'the error listener must not attach with consent off')
assert.equal(sent.length,0)
consent=true;await listeners.get('diagnostics-preference')()
listener('service_error');listener('service_error')
assert.equal(sent.length,1,'the same route and error must not be sent again')
assert.equal(sent[0].route,'kesfet')
assert.deepEqual(Object.keys(sent[0]).sort(),['code','duration_ms','id','route','session_id','technical'])
listeners.get('diagnostics-stop')()
assert.equal(listener,null,'must stop synchronously when consent is withdrawn')
assert.equal(listeners.has('error'),false)
let resolveConsent
pendingConsent=new Promise(resolve=>{resolveConsent=resolve})
const refresh=listeners.get('diagnostics-preference')()
listeners.get('diagnostics-stop')();resolveConsent(true);await refresh
assert.equal(listener,null,'a late consent response must not reopen stopped collection')
cleanup()
assert.equal(listeners.size,0,'listeners must be fully removed on exit')
for(const [key,value] of Object.entries(old)) Object.defineProperty(globalThis,key,{value,configurable:true,writable:true})
console.log('PASS diagnostics field list, private data rejection, route cleanup, consent, dedupe and late response guard')
