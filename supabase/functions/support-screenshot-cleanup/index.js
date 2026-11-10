/* global Deno */
// Yalnız DB'deki rastgele iş anahtarını doğrulayan, tek özel bucket'a sınırlı temizlik.
export async function handleCleanup(request, env, fetcher = fetch) {
  const reply = (status, data) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })
  if (request.method !== 'POST') return reply(405, { error: 'method' })
  if (Number(request.headers.get('content-length') || 0) > 512) return reply(413, { error: 'size' })
  let secret
  try {
    const reader = request.body?.getReader()
    if (!reader) return reply(400, { error: 'body' })
    let text = '', bytes = 0
    const decoder = new TextDecoder()
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      bytes += chunk.value.byteLength
      if (bytes > 512) { await reader.cancel(); return reply(413, { error: 'size' }) }
      text += decoder.decode(chunk.value, { stream: true })
    }
    text += decoder.decode()
    secret = JSON.parse(text).secret
  } catch { return reply(400, { error: 'body' }) }
  if (typeof secret !== 'string' || !/^[a-f0-9]{64}$/.test(secret)) return reply(401, { error: 'unauthorized' })
  const base = env.SUPABASE_URL, key = env.SUPABASE_SERVICE_ROLE_KEY
  if (!base || !key) return reply(503, { error: 'unavailable' })
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'content-type': 'application/json' }
  try {
    const claim = await fetcher(`${base}/rest/v1/rpc/claim_support_screenshot_cleanup`, { method: 'POST', headers, body: JSON.stringify({ job_secret: secret }), signal: AbortSignal.timeout(8000) })
    if (!claim.ok) return reply(claim.status >= 500 ? 503 : 401, { error: 'unauthorized' })
    const paths = await claim.json()
    if (!Array.isArray(paths) || paths.length > 100 || paths.some(path => typeof path !== 'string' || !/^[a-f0-9-]{36}\/[a-f0-9-]{36}\/screenshot\.jpg$/.test(path))) return reply(503, { error: 'invalid_scope' })
    if (paths.length) {
      const deletion = await fetcher(`${base}/storage/v1/object/support-screenshots`, { method: 'DELETE', headers, body: JSON.stringify({ prefixes: paths }), signal: AbortSignal.timeout(8000) })
      if (!deletion.ok) return reply(503, { error: 'cleanup_failed' })
    }
    const finish = await fetcher(`${base}/rest/v1/rpc/finish_support_screenshot_cleanup`, { method: 'POST', headers, body: JSON.stringify({ job_secret: secret }), signal: AbortSignal.timeout(8000) })
    return finish.ok ? reply(200, { removed: paths.length }) : reply(503, { error: 'finalize_failed' })
  } catch { return reply(503, { error: 'cleanup_failed' }) }
}
if (typeof Deno !== 'undefined') Deno.serve(request => handleCleanup(request, { SUPABASE_URL: Deno.env.get('SUPABASE_URL'), SUPABASE_SERVICE_ROLE_KEY: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') }))
