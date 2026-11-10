import { getCurrentAccessToken } from '@/services/authService/shared'

export type CloudflareStorageUploadIntent =
  | 'announcement-image'
  | 'chapter-page'
  | 'community-post-image'
  | 'draft-fansub-avatar'
  | 'fansub-avatar'
  | 'fansub-supporter-asset'
  | 'fansub-profile-background'
  | 'manga-cover'
  | 'profile-effect-asset'
  | 'store-asset'
  | 'storefront-visual'
  | 'event-banner'
  | 'user-avatar'
  | 'user-profile-background'

export interface CloudflareStorageUploadResult {
  objectPath: string
  assetRef?: string
  publicUrl?: string
}

function isLocalDevelopmentHost(hostname: string) {
  const normalized = hostname.trim().toLowerCase()
  return normalized === 'localhost'
    || normalized === '127.0.0.1'
    || normalized === '::1'
    || normalized.endsWith('.local')
}

type CloudflareStorageUploadAvailabilityOptions = {
  allowLocalDev?: boolean
}

export function canUseCloudflareStorageUpload(options: CloudflareStorageUploadAvailabilityOptions = {}) {
  if (typeof window === 'undefined') return false
  if (!isLocalDevelopmentHost(window.location.hostname)) {
    return true
  }

  return options.allowLocalDev === true && import.meta.env.DEV
}

async function getAccessToken() {
  const accessToken = (await getCurrentAccessToken())?.trim()
  if (!accessToken) {
    throw new Error('Kullanici oturumu bulunamadi.')
  }

  return accessToken
}

export async function uploadFileViaCloudflareStorage({
  intent,
  file,
  fields = {},
  onProgress,
}: {
  intent: CloudflareStorageUploadIntent
  file: File
  fields?: Record<string, string | number | null | undefined>
  onProgress?: (percent: number) => void
}): Promise<CloudflareStorageUploadResult> {
  const accessToken = await getAccessToken()
  const formData = new FormData()
  formData.set('intent', intent)
  formData.set('file', file)

  for (const [key, value] of Object.entries(fields)) {
    if (value === null || value === undefined) continue
    formData.set(key, String(value))
  }

  if (typeof XMLHttpRequest !== 'undefined') {
    return new Promise<CloudflareStorageUploadResult>((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open('POST', '/api/storage/upload')
      xhr.responseType = 'text'
      xhr.timeout = 60000
      xhr.ontimeout = () => reject(new Error('Görsel yükleme zaman aşımına uğradı. Tekrar deneyebilirsin.'))
      xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`)

      if (xhr.upload && onProgress) {
        xhr.upload.onprogress = (event) => {
          if (!event.lengthComputable || event.total <= 0) return
          onProgress(Math.max(0, Math.min(100, Math.round((event.loaded / event.total) * 100))))
        }
      }

      xhr.onerror = () => {
        reject(new Error('Cloudflare yukleme istegi ag hatasi nedeniyle tamamlanamadi.'))
      }

      xhr.onload = () => {
        let payload: Partial<CloudflareStorageUploadResult> & { error?: string } = {}
        try {
          payload = xhr.responseText ? JSON.parse(xhr.responseText) : {}
        } catch {
          payload = {}
        }

        if (xhr.status < 200 || xhr.status >= 300) {
          reject(new Error(payload.error || `Cloudflare yukleme istegi basarisiz oldu (${xhr.status}).`))
          return
        }

        if (!payload.objectPath) {
          reject(new Error('Cloudflare yukleme yaniti gecersiz.'))
          return
        }

        onProgress?.(100)
        resolve({
          objectPath: payload.objectPath,
          assetRef: payload.assetRef,
          publicUrl: payload.publicUrl,
        })
      }

      xhr.send(formData)
    })
  }

  const response = await fetch('/api/storage/upload', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: formData,
    signal: AbortSignal.timeout(60000),
  })

  let payload: Partial<CloudflareStorageUploadResult> & { error?: string } = {}
  try {
    payload = await response.json()
  } catch {
    payload = {}
  }

  if (!response.ok) {
    throw new Error(payload.error || `Cloudflare yukleme istegi basarisiz oldu (${response.status}).`)
  }

  if (!payload.objectPath) {
    throw new Error('Cloudflare yukleme yaniti gecersiz.')
  }

  onProgress?.(100)
  return {
    objectPath: payload.objectPath,
    assetRef: payload.assetRef,
    publicUrl: payload.publicUrl,
  }
}
