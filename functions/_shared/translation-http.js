import { createClient } from '@supabase/supabase-js'

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DB_TIMEOUT_MS = 15_000
const HEADERS = {
  'cache-control': 'private, no-store',
  'content-type': 'application/json; charset=utf-8',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
}

export class HttpError extends Error {
  constructor(status, message, headers = {}, code = undefined) {
    super(message)
    this.status = status
    this.headers = headers
    this.code = code
  }
}

export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), { status, headers: { ...HEADERS, ...extraHeaders } })
}

export function errorResponse(error) {
  if (error instanceof HttpError) return json(error.code ? { error: error.message, code: error.code } : { error: error.message }, error.status, error.headers)
  if (error?.name === 'TranslationAiError') {
    // Provider quota/load: the client waits for Retry-After and retries the same job.
    if (error.code === 'provider_busy') {
      const seconds = Math.min(120, Math.max(1, Math.ceil((error.retryAfterMs ?? 20_000) / 1000)))
      return json({ error: error.message, code: error.code }, 429, { 'retry-after': String(seconds) })
    }
    // A content block is a client error (422): retrying is pointless.
    const status = error.code === 'content_blocked' ? 422
      : ['not_configured', 'quota_exhausted', 'provider_auth'].includes(error.code) ? 503 : 502
    return json({ error: error.message, code: error.code }, status)
  }
  if (typeof error?.status === 'number' && typeof error?.message === 'string') {
    return json({ error: error.message }, error.status, error.headers ?? {})
  }
  return json({ error: 'İşlem tamamlanamadı. Tekrar deneyebilirsiniz.' }, 503)
}

export function methodNotAllowed(allow) {
  return new Response(null, { status: 405, headers: { ...HEADERS, allow } })
}

function clientOptions(token) {
  return {
    ...(token ? { global: { headers: { Authorization: `Bearer ${token}` } } } : {}),
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }
}

/** User client: RLS decides access in the DB. */
export async function authenticate(request, env, factory = createClient) {
  const token = request.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1]
  if (!token) throw new HttpError(401, 'Çeviri Stüdyosu için giriş gerekiyor.')
  if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY) {
    throw new HttpError(503, 'Stüdyo veri servisi hazır değil.')
  }
  const db = factory(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, clientOptions(token))
  const { data, error } = await db.auth.getUser(token)
  if (error || !data?.user) throw new HttpError(401, 'Oturum doğrulanamadı.')
  return { db, authUser: data.user }
}

/** Service client: machine text, the raw key and the job record are written only from here. */
export function serviceClient(env, factory = createClient) {
  if (!env.VITE_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new HttpError(503, 'Otomatik işlem veritabanı yetkisi hazır değil.')
  }
  return factory(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, clientOptions(null))
}

export function timed(query) {
  return typeof query?.abortSignal === 'function' ? query.abortSignal(AbortSignal.timeout(DB_TIMEOUT_MS)) : query
}

export async function readJson(request, allowedKeys, maxBytes = 4096) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) {
    throw new HttpError(415, 'İstek JSON olmalı.')
  }
  const text = await request.text()
  if (new TextEncoder().encode(text).length > maxBytes) throw new HttpError(413, 'İstek çok büyük.')
  let value
  try {
    value = JSON.parse(text)
  } catch {
    throw new HttpError(400, 'İstek okunamadı.')
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).some((key) => !allowedKeys.includes(key))) {
    throw new HttpError(400, 'İstek alanları geçersiz.')
  }
  return value
}

export function requireUuid(value, label = 'Kimlik') {
  if (typeof value !== 'string' || !UUID.test(value)) throw new HttpError(400, `${label} geçersiz.`)
  return value.toLowerCase()
}

export async function sha256Hex(input) {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** Page + project through RLS: no row comes back if the user has no access. */
export async function loadPageForUser(db, pageId) {
  const { data, error } = await timed(db.from('translation_pages')
    .select('id,project_id,page_index,raw_status,raw_object_key,raw_sha256,raw_mime_type,raw_byte_size,width,height,clean_object_key,scan_stage,version,translation_projects!inner(id,fansub_id,manga_id,source_language,target_language)')
    .eq('id', pageId).maybeSingle())
  if (error) throw new HttpError(503, 'Sayfa okunamadı.')
  if (!data) throw new HttpError(403, 'Bu sayfaya erişiminiz yok.')
  return { page: data, project: data.translation_projects }
}

/**
 * Studio permission (Roles and Permissions): asked with the user's own JWT. If a list is given,
 * any one permission is enough. Reads are already tied to "ceviri.gor" by RLS.
 */
export async function requireStudioPermission(db, fansubId, permissions) {
  const list = Array.isArray(permissions) ? permissions : [permissions]
  for (const permission of list) {
    const { data, error } = await timed(db.rpc('tl_has_permission', { p_fansub_id: fansubId, p_permission: permission }))
    if (error) throw new HttpError(503, 'Yetki doğrulanamadı.')
    if (data === true) return
  }
  throw new HttpError(403, 'Bu işlem için ekip yöneticisinin sana izin vermesi gerekiyor.')
}

/**
 * AI is off for 18+ (adult) series: no page or text is sent to the service.
 * The series flag comes from the manga or new series draft (tl_project_ai_allowed).
 */
export async function requireAiAllowed(db, projectId) {
  const { data, error } = await timed(db.rpc('tl_project_ai_allowed', { p_project_id: projectId }))
  if (error) throw new HttpError(503, 'Yetki doğrulanamadı.')
  if (data !== true) {
    throw new HttpError(403, 'Bu seri +18 işaretli: yapay zekâ taraması ve çevirisi kapalı. Alanları ve metinleri elle girebilirsin.', {}, 'ai_disabled_mature')
  }
}

/**
 * Pilot: daily AI page allowance per fansub (tl_claim_ai_page). The same page on the same day is
 * not counted twice (scan + translate + re-read use one allowance).
 */
export async function requireAiPageQuota(db, pageId) {
  const { data, error } = await timed(db.rpc('tl_claim_ai_page', { p_page_id: pageId }))
  if (error) throw new HttpError(503, 'Günlük kullanım hakkı doğrulanamadı.')
  if (data?.allowed !== true) {
    const usage = data ? ` (${data.used}/${data.limit} sayfa)` : ''
    throw new HttpError(429, `Ekibin bugünkü yapay zekâ sayfa hakkı doldu${usage}. Gece yarısı yenilenir; bu arada elle devam edebilirsin.`, {}, 'daily_limit')
  }
}

export async function loadRoutes(service, task) {
  const { data, error } = await timed(service.from('translation_model_routes')
    .select('provider,model,priority,input_cost_per_mtok,output_cost_per_mtok')
    .eq('task', task).eq('enabled', true).order('priority', { ascending: true }))
  if (error) throw new HttpError(503, 'Model ayarları okunamadı.')
  return data ?? []
}

/**
 * Gunluk butce: fansub basina UTC gunluk USD siniri (TRANSLATION_DAILY_USD_CAP,
 * varsayilan 5). Maliyet translation_jobs.cost_usd toplamindan hesaplanir.
 */
export async function assertBudget(service, env, fansubId) {
  const cap = Number(env.TRANSLATION_DAILY_USD_CAP ?? 5)
  if (!Number.isFinite(cap) || cap <= 0) return
  const since = new Date()
  since.setUTCHours(0, 0, 0, 0)
  const { data, error } = await timed(service.from('translation_jobs')
    .select('cost_usd,translation_projects!inner(fansub_id)')
    .eq('translation_projects.fansub_id', fansubId)
    .gte('created_at', since.toISOString()))
  if (error) throw new HttpError(503, 'Bütçe okunamadı.')
  const spent = (data ?? []).reduce((sum, row) => sum + (Number(row.cost_usd) || 0), 0)
  if (spent >= cap) throw new HttpError(429, 'Bugünkü otomatik işlem bütçesi doldu. Yarın tekrar deneyin.')
}

/**
 * Idempotent job record. If the same key finished successfully, returns `succeeded` (no repeat
 * cost); a job with a live lease raises `busy`; an expired job is taken over.
 */
export async function claimJob(service, { projectId, pageId = null, task, key, leaseSeconds = 300 }) {
  const lease = new Date(Date.now() + leaseSeconds * 1000).toISOString()
  const token = crypto.randomUUID()
  const { data: inserted, error: insertError } = await timed(service.from('translation_jobs')
    .upsert({
      project_id: projectId, page_id: pageId, task, idempotency_key: key,
      status: 'running', attempt: 1, attempt_token: token, lease_until: lease,
    }, { onConflict: 'project_id,idempotency_key', ignoreDuplicates: true })
    .select('id'))
  if (insertError) throw new HttpError(503, 'İş kaydı alınamadı.')
  if (inserted?.length) return { state: 'claimed', id: inserted[0].id, token }

  const { data: job, error } = await timed(service.from('translation_jobs')
    .select('id,status,attempt,lease_until').eq('project_id', projectId).eq('idempotency_key', key).single())
  if (error || !job) throw new HttpError(503, 'İş kaydı okunamadı.')
  if (job.status === 'succeeded') return { state: 'succeeded', id: job.id }
  if (job.status === 'running' && new Date(job.lease_until).getTime() > Date.now()) {
    throw new HttpError(409, 'Bu işlem başka bir oturumda sürüyor. Biraz sonra yenileyin.')
  }
  if (job.attempt >= 10) throw new HttpError(409, 'Bu işlem çok kez başarısız oldu. Elle düzenleme gerekiyor.')
  // Conditional update: if two clients try to take over at once, only one wins.
  const { data: taken, error: takeError } = await timed(service.from('translation_jobs')
    .update({ status: 'running', attempt: job.attempt + 1, attempt_token: token, lease_until: lease, error: null })
    .eq('id', job.id).eq('attempt', job.attempt).select('id'))
  if (takeError) throw new HttpError(503, 'İş kaydı alınamadı.')
  if (!taken?.length) throw new HttpError(409, 'Bu işlem başka bir oturumda sürüyor. Biraz sonra yenileyin.')
  return { state: 'claimed', id: job.id, token }
}

export async function finishJob(service, claim, result) {
  if (claim?.state !== 'claimed') return
  const patch = result.ok
    ? { status: 'succeeded', lease_until: null, error: null }
    : { status: 'failed', lease_until: null, error: String(result.error ?? 'processing_failed').slice(0, 500) }
  if (result.route) {
    patch.provider = result.route.provider
    patch.model = result.route.model
  }
  if (result.usage) {
    patch.input_tokens = result.usage.input
    patch.output_tokens = result.usage.output
  }
  if (typeof result.cost === 'number') patch.cost_usd = result.cost
  const { error } = await timed(service.from('translation_jobs').update(patch).eq('id', claim.id).eq('attempt_token', claim.token))
  // If the job succeeded we do not throw, to avoid charging again, but it is not silent either
  // (in a real test a job stayed stuck in 'running' unnoticed).
  if (error) console.warn(`[translation-job] ${claim.id} could not be closed: ${String(error.message ?? error).slice(0, 200)}`)
}
