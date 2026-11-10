import { z } from 'zod'

export const technicalSchema = z.object({
  version: z.literal(1),
  build: z.string().regex(/^[a-zA-Z0-9.-]{1,40}$/),
  browser: z.enum(['Chrome', 'Edge', 'Firefox', 'Safari', 'Other']),
  browserMajor: z.number().int().min(0).max(999),
  os: z.enum(['Windows', 'macOS', 'Android', 'iOS', 'Linux', 'Other']),
  device: z.enum(['mobile', 'desktop']),
  width: z.number().int().min(0).max(10000),
  height: z.number().int().min(0).max(10000),
  theme: z.enum(['light', 'dark']),
  reducedMotion: z.boolean(),
  online: z.boolean(),
  notification: z.enum(['unsupported', 'default', 'granted', 'denied']),
  serviceWorker: z.boolean(),
}).strict()
export const supportContextSchema = z.object({
  premium: z.boolean(),
  content: z.string().trim().max(120),
  transaction: z.string().trim().max(80).regex(/^[a-zA-Z0-9_-]*$/),
}).strict()
export type TechnicalReport = z.infer<typeof technicalSchema>
export type SupportContext = z.infer<typeof supportContextSchema>
export const diagnosticCodes = ['ui_error', 'promise_error', 'media_error', 'service_error', 'render_error', 'page_load'] as const
export type DiagnosticCode = typeof diagnosticCodes[number]

export function routeCategory(path: string) {
  const first = path.split(/[?#]/)[0].split('/')[1]
  if (!first) return 'home'
  if (['oku', 'manga'].includes(first)) return 'reader'
  if (['kesfet', 'ayarlar', 'bildirimler', 'giris', 'magaza', 'profil', 'fansublar'].includes(first)) return first
  return 'other'
}

export function collectTechnicalReport(): TechnicalReport {
  const ua = navigator.userAgent
  const match = /Edg\/(\d+)|Firefox\/(\d+)|Chrome\/(\d+)|Version\/(\d+).*Safari/.exec(ua)
  const browser = match?.[1] ? 'Edge' : match?.[2] ? 'Firefox' : match?.[3] ? 'Chrome' : match?.[4] ? 'Safari' : 'Other'
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad|iPod/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'Other'
  const build = typeof __APP_COMMIT__ === 'string' && /^[a-zA-Z0-9.-]{1,40}$/.test(__APP_COMMIT__) ? __APP_COMMIT__ : 'unknown'
  return technicalSchema.parse({ version: 1, build, browser, browserMajor: Math.min(999, Number(match?.slice(1).find(Boolean) || 0)), os,
    device: innerWidth < 640 ? 'mobile' : 'desktop', width: Math.min(10000, Math.round(innerWidth / 100) * 100), height: Math.min(10000, Math.round(innerHeight / 100) * 100),
    theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light', reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    online: navigator.onLine, notification: 'Notification' in window ? Notification.permission : 'unsupported', serviceWorker: 'serviceWorker' in navigator && Boolean(navigator.serviceWorker.controller),
  })
}
