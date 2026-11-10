import { z } from 'zod'

// push-sw.js on the same origin also reads this record; it is not an account or server preference.
const DATABASE_NAME = 'bsg-notification-device-settings'
const STORE_NAME = 'settings'
const RECORD_KEY = 'quiet-hours'
const STORAGE_TIMEOUT_MS = 4000
const timeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)
const quietHoursSchema = z.object({
  enabled: z.boolean(),
  start: timeSchema,
  end: timeSchema,
}).refine((value) => value.start !== value.end)

export type NotificationQuietHours = z.infer<typeof quietHoursSchema>

const DEFAULT_QUIET_HOURS: NotificationQuietHours = { enabled: false, start: '22:00', end: '07:00' }

/** Start inclusive, end exclusive; a range crossing midnight uses the device's local time. */
export function isNotificationQuietHoursActive(value: NotificationQuietHours, date = new Date()): boolean {
  const parsed = quietHoursSchema.safeParse(value)
  if (!parsed.success || !parsed.data.enabled || !Number.isFinite(date.getTime())) return false
  const toMinutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3))
  const start = toMinutes(parsed.data.start)
  const end = toMinutes(parsed.data.end)
  const now = date.getHours() * 60 + date.getMinutes()
  return start < end ? now >= start && now < end : now >= start || now < end
}

function openSettingsDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('Bu tarayıcı cihaz ayarlarını kaydetmeyi desteklemiyor.'))
      return
    }
    let finished = false
    const timer = setTimeout(() => fail(), STORAGE_TIMEOUT_MS)
    const fail = () => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      reject(new Error('Cihaz ayarlarına erişilemedi. Tekrar dene.'))
    }
    try {
      const request = indexedDB.open(DATABASE_NAME, 1)
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME)
      }
      request.onerror = fail
      request.onblocked = fail
      request.onsuccess = () => {
        const database = request.result
        if (finished) { database.close(); return }
        finished = true
        clearTimeout(timer)
        database.onversionchange = () => database.close()
        resolve(database)
      }
    } catch { fail() }
  })
}

async function accessSettings(value?: NotificationQuietHours): Promise<unknown> {
  const database = await openSettingsDatabase()
  return new Promise((resolve, reject) => {
    let transaction: IDBTransaction | undefined
    let finished = false
    const finish = (error?: Error, result?: unknown) => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      database.close()
      if (error) reject(error)
      else resolve(result)
    }
    const timer = setTimeout(() => {
      try { transaction?.abort() } catch { /* Tamamlanmış işlem ayrıca iptal edilemez. */ }
      finish(new Error('Cihaz ayarı işlemi zaman aşımına uğradı. Tekrar dene.'))
    }, STORAGE_TIMEOUT_MS)
    try {
      transaction = database.transaction(STORE_NAME, value ? 'readwrite' : 'readonly')
      const store = transaction.objectStore(STORE_NAME)
      const request = value ? store.put(value, RECORD_KEY) : store.get(RECORD_KEY)
      transaction.oncomplete = () => finish(undefined, request.result)
      transaction.onerror = () => finish(new Error('Cihaz ayarı kaydedilemedi. Tekrar dene.'))
      transaction.onabort = () => finish(new Error('Cihaz ayarı işlemi tamamlanamadı. Tekrar dene.'))
    } catch {
      finish(new Error('Cihaz ayarlarına erişilemedi. Tekrar dene.'))
    }
  })
}

export async function getNotificationQuietHours(): Promise<NotificationQuietHours> {
  const result = quietHoursSchema.safeParse(await accessSettings())
  return result.success ? result.data : { ...DEFAULT_QUIET_HOURS }
}

export async function setNotificationQuietHours(value: NotificationQuietHours): Promise<void> {
  const result = quietHoursSchema.safeParse(value)
  if (!result.success) throw new Error('Geçerli ve birbirinden farklı başlangıç ile bitiş saatleri seç.')
  await accessSettings(result.data)
}
