import { z } from 'zod'
import { supabase } from './supabase'
import { withServiceTimeout } from './apiResilience'

export type PreparedScreenshot = { blob: Blob; preview: string }
const bucket = 'support-screenshots'
const idSchema = z.string().uuid()
const timeout = { label: 'supportScreenshot', timeoutMs: 15000 }

export async function prepareSupportScreenshot(file: File): Promise<PreparedScreenshot> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024) throw new Error('En fazla 8 MB boyutunda PNG, JPEG veya WebP seçmelisin.')
  const bitmap = await createImageBitmap(file).catch(() => { throw new Error('Görsel okunamadı. Başka bir dosya seçebilirsin.') })
  try {
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 40000000) throw new Error('Görselin çözünürlüğü çok büyük.')
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Bu tarayıcı görsel hazırlamayı desteklemiyor.')
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    // Generating a new JPEG does not carry the original file name and EXIF into the upload.
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Görsel hazırlanamadı.')), 'image/jpeg', 0.8))
    if (blob.size > 1024 * 1024) throw new Error('Görsel küçültüldükten sonra da çok büyük; daha küçük bir ekran görüntüsü seçmelisin.')
    return { blob, preview: URL.createObjectURL(blob) }
  } finally { bitmap.close() }
}
async function ownPath(requestId: string) {
  idSchema.parse(requestId)
  const { data, error } = await withServiceTimeout(() => supabase.auth.getUser(), timeout)
  if (error || !data.user) throw new Error('Giriş yapmalısın.')
  return `${data.user.id}/${requestId}/screenshot.jpg`
}
export async function uploadSupportScreenshot(requestId: string, image: PreparedScreenshot) {
  const path = await ownPath(requestId)
  const { error } = await withServiceTimeout(() => supabase.storage.from(bucket).upload(path, image.blob, { contentType: 'image/jpeg', cacheControl: '0', upsert: false }), timeout)
  // If the network response is lost, the same fixed path does not produce a second file.
  if (error && !['409', '400'].includes(String('statusCode' in error ? error.statusCode : ''))) throw new Error('Talebin kayıtlı, fakat görsel yüklenemedi. Talep kartından tekrar deneyebilirsin.')
  const { error: attachError } = await withServiceTimeout(() => supabase.rpc('attach_support_screenshot', { request_id: requestId }), timeout)
  if (attachError) throw new Error('Görsel talebe bağlanamadı. Talep kartından tekrar deneyebilirsin.')
}
export async function downloadSupportScreenshot(requestId: string, ownerId: string) {
  idSchema.parse(requestId); idSchema.parse(ownerId)
  const { data, error } = await withServiceTimeout(() => supabase.storage.from(bucket).download(`${ownerId}/${requestId}/screenshot.jpg`), timeout)
  if (error || !data) throw new Error('Görsel açılamadı veya saklama süresi dolmuş olabilir.')
  const signature = new Uint8Array(await data.slice(0, 3).arrayBuffer())
  if (signature[0] !== 255 || signature[1] !== 216 || signature[2] !== 255) throw new Error('Görselin dosya biçimi doğrulanamadı.')
  return URL.createObjectURL(data)
}
export async function deleteSupportScreenshot(requestId: string) {
  const path = await ownPath(requestId)
  const { error } = await withServiceTimeout(() => supabase.storage.from(bucket).remove([path]), timeout)
  if (error) throw new Error('Görsel silinemedi. Tekrar deneyebilirsin.')
  const { error: detachError } = await withServiceTimeout(() => supabase.rpc('detach_support_screenshot', { request_id: requestId }), timeout)
  if (detachError) throw new Error('Görsel kaldırıldı, kayıt yenilenemedi. Tekrar deneyebilirsin.')
}
