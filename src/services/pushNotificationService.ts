/**
 * pushNotificationService: browser web push subscription (opt-in)
 *
 * Flow: the user enables it in the notification panel -> push-sw.js registers ->
 * PushManager.subscribe (with the VAPID public key) -> the subscription is upserted to
 * public.push_subscriptions (RLS owner-only, user_id DB default).
 * Delivery side is a DB trigger + /api/push/dispatch (see migration 267).
 *
 * Gates: the 'notifications.web_push' feature flag + a VAPID public key from the build or from
 * /api/push/public-key on the same origin. While the key loads no permission
 * is requested and no SW is registered; a subscription only starts from a user action.
 */

import { supabase } from './supabase'
import { isFeatureEnabled } from './featureFlagService'
import { withAbortSignal, withServiceTimeout } from './apiResilience'
import { toUserFacingErrorMessage } from './userFacingError'
import { createScopedLogger } from './logger'
import { txa } from '@/i18n/activeLocale'

const logger = createScopedLogger('pushNotificationService')

const SERVICE_WORKER_PATH = '/push-sw.js'
const FLAG_KEY = 'notifications.web_push'
const PUBLIC_KEY_PATH = '/api/push/public-key'
const PUBLIC_KEY_CACHE_MS = 5 * 60_000
const PUBLIC_KEY_RETRY_MS = 30_000
let publicKeyCache: { value: string; expiresAt: number } | null = null
let publicKeyRequest: Promise<string> | null = null
let configuredPublicKey: Promise<string> | null = null

export type WebPushState =
  | 'unsupported'
  | 'unavailable'
  | 'denied'
  | 'subscribed'
  | 'unsubscribed'

async function normalizeVapidPublicKey(value: unknown): Promise<string> {
  if (typeof value !== 'string') return ''
  const key = value.trim().replace(/=$/, '')
  if (!/^[A-Za-z0-9_-]{87}$/.test(key)) return ''
  try {
    const bytes = urlBase64ToUint8Array(key)
    if (bytes.length !== 65 || bytes[0] !== 4) return ''
    await crypto.subtle.importKey('raw', bytes.buffer as ArrayBuffer, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])
    return key
  } catch { return '' }
}

async function getVapidPublicKey(): Promise<string> {
  configuredPublicKey ??= normalizeVapidPublicKey(import.meta.env.VITE_WEB_PUSH_VAPID_PUBLIC_KEY)
  const configured = await configuredPublicKey
  if (configured) return configured
  if (publicKeyCache && publicKeyCache.expiresAt > Date.now()) return publicKeyCache.value
  if (publicKeyRequest) return publicKeyRequest
  // Even if the menu, reader and settings check at once, only one request is made.
  publicKeyRequest = (async () => {
    let value = ''
    try {
      value = await withServiceTimeout(async signal => {
        const response = await fetch(PUBLIC_KEY_PATH, {
          signal, credentials: 'omit', mode: 'same-origin', redirect: 'error',
          headers: { accept: 'application/json' },
        })
        if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) return ''
        const payload: unknown = await response.json()
        return normalizeVapidPublicKey(payload && typeof payload === 'object' && 'publicKey' in payload ? payload.publicKey : null)
      }, { label: txa('Push genel anahtarı yükleme'), timeoutMs: 4000 })
    } catch {
      // On a temporary network error the UI gate closes safely; failure is not cached permanently.
      logger.warn('Push genel anahtarı şu anda yüklenemedi.')
    }
    publicKeyCache = { value, expiresAt: Date.now() + (value ? PUBLIC_KEY_CACHE_MS : PUBLIC_KEY_RETRY_MS) }
    return value
  })().finally(() => { publicKeyRequest = null })
  return publicKeyRequest
}

export function isWebPushSupported(): boolean {
  return typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window
}

/** Flag + VAPID key + browser support all present? (UI visibility gate) */
export async function isWebPushAvailable(): Promise<boolean> {
  if (!isWebPushSupported() || !(await isFeatureEnabled(FLAG_KEY, false))) return false
  return Boolean(await getVapidPublicKey())
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i += 1) outputArray[i] = rawData.charCodeAt(i)
  return outputArray
}

async function getServiceWorkerRegistration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration(SERVICE_WORKER_PATH)
  if (existing) return existing
  return navigator.serviceWorker.register(SERVICE_WORKER_PATH)
}

async function getCurrentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration(SERVICE_WORKER_PATH)
  if (!registration) return null
  return registration.pushManager.getSubscription()
}

/** Status to show when the panel opens. */
export async function getWebPushState(): Promise<WebPushState> {
  if (!isWebPushSupported()) return 'unsupported'
  if (!(await isWebPushAvailable())) return 'unavailable'
  if (Notification.permission === 'denied') return 'denied'
  try {
    const subscription = await getCurrentSubscription()
    return subscription ? 'subscribed' : 'unsubscribed'
  } catch (error) {
    logger.warn('Push abonelik durumu okunamadi', { error })
    return 'unsubscribed'
  }
}

function toSubscriptionRow(subscription: PushSubscription) {
  const json = subscription.toJSON()
  const p256dh = json.keys?.p256dh
  const auth = json.keys?.auth
  if (!json.endpoint || !p256dh || !auth) {
    throw new Error(txa('Tarayici gecersiz push aboneligi dondurdu.'))
  }
  return {
    endpoint: json.endpoint,
    p256dh,
    auth,
    user_agent: navigator.userAgent.slice(0, 255),
    last_seen_at: new Date().toISOString(),
  }
}

/**
 * Requests permission, subscribes and writes to the DB.
 * Error messages are in a user-displayable format.
 */
export async function enableWebPush(): Promise<WebPushState> {
  if (!isWebPushSupported()) return 'unsupported'
  if (!(await isFeatureEnabled(FLAG_KEY, false))) return 'unavailable'
  const publicKey = await getVapidPublicKey()
  if (!publicKey) return 'unavailable'

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'unsubscribed'

  try {
    const registration = await getServiceWorkerRegistration()
    const subscription = await registration.pushManager.getSubscription()
      || await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey).buffer as ArrayBuffer,
      })

    const row = toSubscriptionRow(subscription)
    const { error } = await withServiceTimeout(
      (signal) => withAbortSignal(
        supabase.from('push_subscriptions').upsert(row, { onConflict: 'endpoint' }),
        signal,
      ),
      { label: txa('Push aboneligi kaydetme') },
    )
    if (error) throw error

    logger.info('Web push aboneligi kaydedildi')
    return 'subscribed'
  } catch (error) {
    logger.error('Web push aboneligi acilamadi', { error })
    throw new Error(toUserFacingErrorMessage(error, txa('Tarayici bildirimleri acilamadi.')))
  }
}

/** Cancels the browser subscription and deletes the DB record. */
export async function disableWebPush(): Promise<WebPushState> {
  try {
    const subscription = await getCurrentSubscription()
    if (!subscription) return 'unsubscribed'

    const endpoint = subscription.endpoint
    await subscription.unsubscribe()

    const { error } = await withServiceTimeout(
      (signal) => withAbortSignal(
        supabase.from('push_subscriptions').delete().eq('endpoint', endpoint),
        signal,
      ),
      { label: txa('Push aboneligi silme') },
    )
    if (error) {
      // The browser side closed; if the DB row stays dead it is removed on delivery by 404/410.
      logger.warn('Push abonelik satiri silinemedi', { error })
    }

    logger.info('Web push aboneligi kapatildi')
    return 'unsubscribed'
  } catch (error) {
    logger.error('Web push aboneligi kapatilamadi', { error })
    throw new Error(toUserFacingErrorMessage(error, txa('Tarayici bildirimleri kapatilamadi.')))
  }
}
