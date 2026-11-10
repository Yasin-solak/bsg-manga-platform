import { txa } from '@/i18n/activeLocale'

export type ToastVariant = 'success' | 'error' | 'warning' | 'info'

export interface ToastMessage {
    id: string
    message: string
    variant: ToastVariant
    duration: number
}

type ToastListener = (toast: ToastMessage) => void

const listeners = new Set<ToastListener>()
const pendingQueue: ToastMessage[] = []

function createToastId() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function emit(toast: ToastMessage) {
    if (listeners.size === 0) {
        pendingQueue.push(toast)
        return
    }
    listeners.forEach((listener) => listener(toast))
}

function toMessage(input: unknown) {
    if (typeof input === 'string') return txa(input)
    if (input instanceof Error) return txa(input.message)
    try {
        return JSON.stringify(input)
    } catch {
        return String(input)
    }
}

function inferVariantFromLegacyAlert(message: string): ToastVariant {
    const text = message
        .toLocaleLowerCase('tr-TR')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')

    if (text.includes('hata') || text.includes('basarisiz') || text.includes('kaydedilemedi') || text.includes('engell')) {
        return 'error'
    }
    if (text.includes('uyari') || text.includes('dikkat') || text.includes('yetersiz')) {
        return 'warning'
    }
    if (text.includes('basari') || text.includes('kaydedildi') || text.includes('olusturuldu') || text.includes('eklendi')) {
        return 'success'
    }
    return 'info'
}

const DEFAULT_DURATION: Record<ToastVariant, number> = {
    success: 2800,
    error: 4200,
    warning: 3600,
    info: 3000,
}

function pushToast(message: unknown, variant: ToastVariant, duration?: number) {
    const normalized = toMessage(message).trim()
    if (!normalized) return
    emit({
        id: createToastId(),
        message: normalized,
        variant,
        duration: duration ?? DEFAULT_DURATION[variant],
    })
}

export const toast = {
    success(message: unknown, duration?: number) {
        pushToast(message, 'success', duration)
    },
    error(message: unknown, duration?: number) {
        pushToast(message, 'error', duration)
    },
    warning(message: unknown, duration?: number) {
        pushToast(message, 'warning', duration)
    },
    info(message: unknown, duration?: number) {
        pushToast(message, 'info', duration)
    },
}

export function subscribeToToast(listener: ToastListener) {
    listeners.add(listener)
    if (pendingQueue.length > 0) {
        const queued = pendingQueue.splice(0, pendingQueue.length)
        queued.forEach((toastItem) => listener(toastItem))
    }
    return () => listeners.delete(listener)
}

let legacyAlertInstalled = false
let nativeAlertRef: ((message?: unknown) => void) | null = null

export function installLegacyAlertToToastBridge() {
    if (typeof window === 'undefined' || legacyAlertInstalled) return

    nativeAlertRef = window.alert.bind(window)
    window.alert = (message?: unknown) => {
        const normalized = toMessage(message)
        const variant = inferVariantFromLegacyAlert(normalized)
        pushToast(normalized, variant)
    }

    legacyAlertInstalled = true
}

export function uninstallLegacyAlertToToastBridge() {
    if (typeof window === 'undefined' || !legacyAlertInstalled || !nativeAlertRef) return
    window.alert = nativeAlertRef
    nativeAlertRef = null
    legacyAlertInstalled = false
}

