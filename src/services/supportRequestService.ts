import { technicalSchema, supportContextSchema, type TechnicalReport, type SupportContext } from './diagnosticsTypes'
import { z } from 'zod'
import { supabase } from './supabase'
import { withAbortSignal, withServiceTimeout } from './apiResilience'
import { createRequestContext } from './requestContext'
import { createScopedLogger } from './logger'
import { reportUserFacingError } from './userFacingError'
import { txa } from '@/i18n/activeLocale'
const logger=createScopedLogger('supportRequestService')
const schema=z.object({id:z.string().uuid(),subject:z.string().trim().min(5).max(120),message:z.string().trim().min(20).max(5000),category:z.enum(['technical','account','content','payment','suggestion','other']),technical:technicalSchema.nullable().optional(),account_context:supportContextSchema.nullable().optional()})
export type SupportRequest={username?:string|null;hasScreenshot:boolean;id:string;user_id:string;subject:string;message:string;category:string;status:'open'|'answered'|'closed';admin_response:string|null;created_at:string;responded_at:string|null;technical:TechnicalReport|null;account_context:SupportContext|null}
const columns='id,user_id,subject,message,category,status,admin_response,created_at,responded_at,technical,account_context,support_attachments(request_id)'
async function run<T>(event:string,work:()=>PromiseLike<T>):Promise<T>{
  const requestContext=createRequestContext('supportRequestService',event)
  try{return await withServiceTimeout(work,{label:event,timeoutMs:12000})}catch(error){reportUserFacingError(logger,{event,error,requestContext,fallback:'Destek işlemi tamamlanamadı. Tekrar deneyebilirsin.'});throw error}
}
export async function createSupportRequest(input:{id:string;subject:string;message:string;category:string;technical?:TechnicalReport|null;account_context?:SupportContext|null}){
  const parsed=schema.safeParse(input)
  if(!parsed.success){
    if(parsed.error.issues.some(issue=>issue.path[0]==='account_context'))throw new Error(txa('İşlem referansı yalnız harf, rakam, alt çizgi ve kısa çizgi içerebilir; manga/bölüm bilgisi en fazla 120 karakter olmalı.'))
    if(parsed.error.issues.some(issue=>issue.path[0]==='technical'))throw new Error(txa('Teknik rapor doğrulanamadı. Rapor seçimini kapatıp tekrar açabilirsin.'))
    throw new Error(txa('Konu 5–120, mesaj 20–5000 karakter olmalı.'))
  }
  return run('createSupportRequest',async()=>{
    const {error}=await supabase.from('support_requests').insert(parsed.data)
    if(error?.code==='23505'){
      const {data,error:lookupError}=await supabase.from('support_requests').select('id').eq('id',parsed.data.id).maybeSingle()
      if(!lookupError&&data)return data.id as string
    }
    if(error)throw new Error(error.code==='P0001'?txa('24 saat içinde en fazla 5 destek talebi gönderebilirsin.'):txa('Talebin kaydedilemedi. Yazdıkların korunuyor; tekrar deneyebilirsin.'))
    return parsed.data.id
  })
}
export async function listSupportRequests(all:boolean,page:number){
  return run('listSupportRequests',async()=>{
    const {data:auth,error:authError}=await supabase.auth.getUser()
    if(authError||!auth.user)throw new Error(txa('Giriş yapmalısın.'))
    let query=supabase.from('support_requests').select(columns).order('created_at',{ascending:false}).order('id',{ascending:false}).range(page*20,page*20+19)
    if(!all)query=query.eq('user_id',auth.user.id)
    const {data,error}=await query
    if(error)throw error
    let names: {user_id:string;username:string|null}[] = []
    if(all && data?.length){const result=await supabase.rpc('admin_support_identities',{owner_ids:[...new Set(data.map(row=>row.user_id))]});if(result.error)throw result.error;names=result.data||[]}
    return (data||[]).map(row=>({...row,username:names.find(owner=>owner.user_id===row.user_id)?.username,hasScreenshot:Array.isArray(row.support_attachments)?row.support_attachments.length>0:Boolean(row.support_attachments)})) as SupportRequest[]
  })
}
export async function replySupportRequest(id:string,response:string){
  const parsed=z.object({id:z.string().uuid(),response:z.string().trim().min(5).max(5000)}).parse({id,response})
  return run('replySupportRequest',async()=>{
    const {data,error}=await supabase.from('support_requests').update({admin_response:parsed.response,status:'answered'}).eq('id',parsed.id).select('id').single()
    if(error||!data)throw error||new Error(txa('Yanıt kaydedilemedi.'))
  })
}

export type AdminSupportFilter = { page: number; search: string; status: string; category: string }
export async function listAdminSupportPage(input: AdminSupportFilter) {
  const filter = z.object({
    page: z.number().int().min(0).max(100000), search: z.string().trim().max(120),
    status: z.enum(['all', 'open', 'answered', 'closed']),
    category: z.enum(['all', 'technical', 'account', 'content', 'payment', 'suggestion', 'other']),
  }).parse(input)
  return run('listAdminSupportPage', async () => {
    let query = supabase.from('support_requests').select(columns, { count: 'exact' })
    if (filter.status !== 'all') query = query.eq('status', filter.status)
    if (filter.category !== 'all') query = query.eq('category', filter.category)
    if (filter.search) query = query.ilike('subject', `%${filter.search.replace(/[\\%_]/g, '\\$&')}%`)
    const { data, error, count } = await query.order('created_at', { ascending: false }).order('id', { ascending: false }).range(filter.page * 20, filter.page * 20 + 19)
    if (error) throw error
    const rows = data || []
    const owners = new Map<string, string | null>()
    if (rows.length) {
      const result = await supabase.rpc('admin_support_identities', { owner_ids: [...new Set(rows.map(row => row.user_id))] })
      if (result.error) throw result.error
      for (const owner of result.data || []) owners.set(owner.user_id, owner.username)
    }
    return { total: count ?? 0, rows: rows.map(row => ({ ...row, username: owners.get(row.user_id), hasScreenshot: Array.isArray(row.support_attachments) ? row.support_attachments.length > 0 : Boolean(row.support_attachments) })) as SupportRequest[] }
  })
}

/** Admin sidebar badge: open support requests awaiting a reply. */
export async function countOpenSupportRequests(signal?: AbortSignal): Promise<number> {
  const { count, error } = await withServiceTimeout(
    (requestSignal) => withAbortSignal(supabase.from('support_requests')
      .select('id', { count: 'exact', head: true }).eq('status', 'open'), requestSignal),
    { label: 'countOpenSupportRequests', signal },
  )
  if (error) throw error
  return z.number().int().min(0).parse(count ?? 0)
}

export type SupportStatusCounts = { open: number; answered: number; closed: number }

/** Support desk summary strip: real request counts by status (all, not the page). */
export async function countSupportRequestsByStatus(signal?: AbortSignal): Promise<SupportStatusCounts> {
  const statuses = ['open', 'answered', 'closed'] as const
  const counts = await Promise.all(statuses.map(async (status) => {
    const { count, error } = await withServiceTimeout(
      (requestSignal) => withAbortSignal(supabase.from('support_requests')
        .select('id', { count: 'exact', head: true }).eq('status', status), requestSignal),
      { label: 'countSupportRequestsByStatus', signal },
    )
    if (error) throw error
    return z.number().int().min(0).parse(count ?? 0)
  }))
  return { open: counts[0], answered: counts[1], closed: counts[2] }
}
