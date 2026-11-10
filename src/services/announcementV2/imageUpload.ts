import { z } from 'zod'
import { uploadFileViaCloudflareStorage } from '../storageService/cloudflareUploadClient'
import { normalizeUploadFile } from '../storageService/mediaFileNormalization'
import { safeAnnouncementUrl } from './model'

export async function uploadAnnouncementImage(file: File, announcementId: string, onProgress: (value: number) => void) {
  z.string().uuid().parse(announcementId)
  if (!file.size || file.size > 10 * 1024 * 1024) throw new Error('Görsel boş olamaz ve en fazla 10 MB olabilir.')
  const normalized = await normalizeUploadFile(file)
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(normalized.mimeType)) throw new Error('JPG, PNG, WebP veya GIF seç.')
  const result = await uploadFileViaCloudflareStorage({ intent: 'announcement-image', file: normalized.file, fields: { announcementId }, onProgress })
  if (!result.publicUrl?.startsWith('https://') || !safeAnnouncementUrl(result.publicUrl)) throw new Error('Cloudflare görsel adresi doğrulanamadı.')
  return result.publicUrl
}
