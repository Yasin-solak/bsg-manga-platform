import { normalizeUploadFile } from './media-file-normalization.js'

function reject(status, message) { throw Object.assign(new Error(message), { status }) }

export async function handleAnnouncementImageUpload(authContext, env, formData) {
  if (authContext.profile.role !== 'admin') reject(403, 'Duyuru görseli için yönetici yetkisi gerekli.')
  const id = String(formData.get('announcementId') || '')
  if (!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(id)) reject(400, 'Duyuru kimliği geçersiz.')
  const raw = formData.get('file')
  if (!(raw instanceof File) || raw.size === 0 || raw.size > 10 * 1024 * 1024) reject(400, 'Görsel boş olamaz ve en fazla 10 MB olabilir.')
  const normalized = await normalizeUploadFile(raw)
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(normalized.mimeType)) reject(400, 'JPG, PNG, WebP veya GIF görsel seç.')
  const base = String(env.VITE_STORE_ASSET_PUBLIC_BASE_URL || '').replace(/\/+$/, '')
  if (!/^https:\/\/[a-zA-Z0-9.-]+(?::\d+)?(?:\/[^\s?#]*)?$/.test(base) || !env.STORE_ASSETS_BUCKET) reject(503, 'Cloudflare görsel deposu hazır değil.')
  const objectPath = `announcements/${id.toLowerCase()}/${crypto.randomUUID()}.${normalized.extension}`
  await env.STORE_ASSETS_BUCKET.put(objectPath, await normalized.file.arrayBuffer(), {
    httpMetadata: { contentType: normalized.mimeType, cacheControl: 'public, max-age=31536000, immutable' },
  })
  return new Response(JSON.stringify({ objectPath, publicUrl: `${base}/${objectPath}` }), {
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
  })
}
