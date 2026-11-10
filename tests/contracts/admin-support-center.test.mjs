import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
import { untranslate } from './i18n-source.mjs'
const read=p=>untranslate(readFileSync(new URL('../../'+p,import.meta.url), 'utf8'))
function load(path,mocks={}){const out={};new Function('require','exports',ts.transpileModule(read(path),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(name=>{if(name==='./notificationMessageText')return {translateNotificationMessage:text=>text};if(name in mocks)return mocks[name];throw Error(name)},out);return out}
const routes=load('src/pages/admin/adminRoutes.ts')
for(const [section,path] of [['support','/admin/destek'],['diagnostics','/admin/tanilama']]){assert.equal(routes.sectionToAdminPath(section),path);assert.equal(routes.sectionFromAdminPath(path),section);assert.equal(routes.isKnownAdminPath(path),true)}
let response={data:true,error:null},called=''
const service=load('src/services/diagnosticsService.ts',{'./apiResilience':{withServiceTimeout:fn=>fn()},'./supabase':{supabase:{rpc:async name=>{called=name;return response}}},'./diagnosticsTypes':{}})
assert.equal(await service.readDiagnosticConsent(),true);assert.equal(called,'get_diagnostic_preference')
response={data:false,error:null};assert.equal(await service.readDiagnosticConsent(),false)
response={data:null,error:{code:'timeout'}};await assert.rejects(()=>service.readDiagnosticConsent())
const notification=load('src/components/notifications/notificationPresentation.ts',{'@/lib/routes':{},'@/i18n/activeLocale':{ intlLocale: () => 'tr-TR', txa: (text, vars = {}) => text.replace(/\{(\w+)\}/g, (whole, name) => (name in vars ? String(vars[name]) : whole)) }})
assert.equal(notification.notificationDestination({data:{event:'diagnostic_alert',route_hint:'/ayarlar?bolum=destek'}}),'/admin/tanilama')
assert.ok(!read('src/pages/settings/SettingsDiagnostics.tsx').includes('DiagnosticAdminOverview'))
assert.ok(!read('src/pages/settings/SettingsSupportForm.tsx').includes('Yönetici destek kutusu'))
const sql=read('supabase/migrations/20260915155932_admin_support_identity.sql')
assert.match(sql,/on conflict\(user_id\) do nothing/)
assert.match(sql,/not support_internal.is_support_admin\(\)/)
console.log('PASS admin support routes, alert destination, default preference, opt-out and failure handling')

const icons=new Proxy({}, {get:()=>()=>null})
const nav=load('src/pages/admin/adminNavigation.ts',{'lucide-react':icons}).buildAdminNavItems({isReportsFeatureEnabled:true,isOperationsCenterEnabled:true,pendingCount:0,communityOpenReportCount:0,legalRequestPendingCount:0,reportPendingCount:0,announcementCount:0,userCount:0})
assert.deepEqual([...new Set(nav.map(item=>item.group))],['overview','queues','moderation','content','economy','system'])
assert.equal(nav[0].id,'dashboard')
assert.equal(nav.filter(item=>item.group==='queues').at(-1).id,'support')
// A badge shows only pending work: open support request count on the support row.
assert.equal(load('src/pages/admin/adminNavigation.ts',{'lucide-react':icons}).buildAdminNavItems({isReportsFeatureEnabled:true,isOperationsCenterEnabled:true,pendingCount:0,communityOpenReportCount:0,legalRequestPendingCount:0,reportPendingCount:0,supportOpenCount:4}).find(item=>item.id==='support').badge,4)
assert.equal(nav.filter(item=>item.group==='system').at(-1).id,'diagnostics')
