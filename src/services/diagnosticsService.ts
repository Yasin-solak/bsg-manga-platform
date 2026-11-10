import type { PerformanceSample } from './diagnosticPerformance'
import { withServiceTimeout } from './apiResilience'
import { supabase } from './supabase'
import { technicalSchema, type TechnicalReport, type DiagnosticCode } from './diagnosticsTypes'

export async function readDiagnosticConsent() {
  const { data, error } = await withServiceTimeout(() => supabase.rpc('get_diagnostic_preference'), { label: 'diagnostics', timeoutMs: 12000 })
  if (error) throw new Error('Tanılama tercihi yüklenemedi.')
  return data === true
}
export function stopLocalDiagnostics() { window.dispatchEvent(new Event('diagnostics-stop')) }
export async function saveDiagnosticConsent(enabled: boolean) {
  if (!enabled) stopLocalDiagnostics()
  const { data: auth, error: authError } = await withServiceTimeout(() => supabase.auth.getUser(), { label: 'diagnostics', timeoutMs: 12000 })
  if (authError || !auth.user) throw new Error('Giriş yapmalısın.')
  const { error } = await withServiceTimeout(() => supabase.from('diagnostic_preferences').upsert({ user_id: auth.user.id, enabled, version: 2 }), { label: 'diagnostics', timeoutMs: 12000 })
  if (error) throw new Error('Tercih kaydedilemedi. Tekrar deneyebilirsin.')
  window.dispatchEvent(new Event('diagnostics-preference'))
  if (typeof BroadcastChannel !== 'undefined') { const channel = new BroadcastChannel('bsg-diagnostics-preference'); channel.postMessage('changed'); channel.close() }
}
export async function deleteDiagnosticHistory() {
  const { error } = await withServiceTimeout(() => supabase.rpc('delete_my_diagnostics'), { label: 'diagnostics', timeoutMs: 12000 })
  if (error) throw new Error('Raporların silinemedi. Tekrar deneyebilirsin.')
}
export async function removeSupportReport(id: string) {
  const { error } = await withServiceTimeout(() => supabase.rpc('clear_my_support_diagnostics', { request_id: id }), { label: 'diagnostics', timeoutMs: 12000 })
  if (error) throw new Error('Rapor kaldırılamadı.')
}
export type DiagnosticEvent = { id: string; session_id: string; code: DiagnosticCode; route: string; duration_ms: number | null; technical: TechnicalReport }
export async function sendDiagnosticEvent(event: DiagnosticEvent) {
  technicalSchema.parse(event.technical)
  const { error } = await withServiceTimeout(() => supabase.from('diagnostic_events').insert(event), { label: 'diagnostics', timeoutMs: 12000 })
  if (error) throw new Error('Tanılama gönderilemedi.')
}
export type DiagnosticOverview = { collection_enabled:boolean; screenshot_cleanup_at:string|null; metrics:{code:string;p50:number;p75:number;p95:number;samples:number}[]; alerts:{id:string;kind:string;dimension:string;samples:number;value:number|null;created_at:string;acknowledged_at:string|null}[]; total: number; accounts: number; p75: number | null; groups: {code:string;route:string;build:string;device:string;count:number}[]; recent: {id:string;user_id:string;username:string|null;code:string;route:string;created_at:string;technical:TechnicalReport}[]; cleanup_at:string|null }
export async function readDiagnosticOverview(): Promise<DiagnosticOverview> {
  const { data, error } = await withServiceTimeout(() => supabase.rpc('diagnostic_overview'), { label: 'diagnostics', timeoutMs: 12000 })
  if (error) throw new Error('Yönetici tanılama verisi yüklenemedi.')
  const raw = (data ?? {}) as Partial<DiagnosticOverview>
  const list = <T,>(value: T[] | undefined) => (Array.isArray(value) ? value : [])
  return {
    collection_enabled: raw.collection_enabled !== false,
    screenshot_cleanup_at: raw.screenshot_cleanup_at ?? null,
    metrics: list(raw.metrics),
    alerts: list(raw.alerts),
    total: Number(raw.total) || 0,
    accounts: Number(raw.accounts) || 0,
    p75: raw.p75 ?? null,
    groups: list(raw.groups),
    recent: list(raw.recent),
    cleanup_at: raw.cleanup_at ?? null,
  }
}

export async function diagnosticCollectionEnabled() {
  const {data,error}=await withServiceTimeout(()=>supabase.rpc('diagnostic_collection_enabled'),{label:'diagnosticControl',timeoutMs:12000})
  if(error)throw new Error('Tanılama durumu doğrulanamadı.')
  return data===true
}
export async function setDiagnosticCollection(value:boolean) {
  const {error}=await withServiceTimeout(()=>supabase.rpc('set_diagnostic_collection',{value}),{label:'diagnosticControl',timeoutMs:12000})
  if(error)throw new Error('Toplama ayarı kaydedilemedi.')
  window.dispatchEvent(new Event('diagnostics-preference'))
}
export async function acknowledgeDiagnosticAlert(id:string) {
  const {error}=await withServiceTimeout(()=>supabase.rpc('acknowledge_diagnostic_alert',{alert_id:id}),{label:'diagnosticAlert',timeoutMs:12000})
  if(error)throw new Error('Alarm güncellenemedi.')
}
export async function sendDiagnosticMetric(id:string,session:string,sample:PerformanceSample,route:string,technical:TechnicalReport) {
  const {error}=await withServiceTimeout(()=>supabase.rpc('record_diagnostic_metric',{event_id:id,session,metric:sample.code,value:sample.value,route_name:route,environment:technicalSchema.parse(technical)}),{label:'diagnosticMetric',timeoutMs:12000})
  if(error)throw new Error('Performans ölçümü gönderilemedi.')
}
