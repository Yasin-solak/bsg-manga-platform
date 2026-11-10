export type ConfirmVariant = 'danger' | 'warning' | 'info'

export interface ConfirmRequest {
    id: string
    title: string
    message: string
    confirmText: string
    cancelText: string
    variant: ConfirmVariant
}

interface ConfirmOptions {
    title?: string
    message: string
    confirmText?: string
    cancelText?: string
    variant?: ConfirmVariant
}

type ConfirmListener = (request: ConfirmRequest) => void

const listeners = new Set<ConfirmListener>()
const pendingQueue: ConfirmRequest[] = []
const resolverMap = new Map<string, (value: boolean) => void>()

function createConfirmId() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function emit(request: ConfirmRequest) {
    if (listeners.size === 0) {
        pendingQueue.push(request)
        return
    }
    listeners.forEach((listener) => listener(request))
}

function normalizeOptions(input: string | ConfirmOptions): ConfirmRequest {
    const opts: ConfirmOptions = typeof input === 'string' ? { message: input } : input
    return {
        id: createConfirmId(),
        title: opts.title?.trim() || 'Onay Gerekli',
        message: opts.message.trim(),
        confirmText: opts.confirmText?.trim() || 'Onayla',
        cancelText: opts.cancelText?.trim() || 'Iptal',
        variant: opts.variant || 'warning',
    }
}

export function confirmDialog(input: string | ConfirmOptions): Promise<boolean> {
    const request = normalizeOptions(input)

    if (typeof window !== 'undefined' && listeners.size === 0) {
        // Host henuz mount edilmediyse native fallback.
        return Promise.resolve(window.confirm(request.message))
    }

    return new Promise<boolean>((resolve) => {
        resolverMap.set(request.id, resolve)
        emit(request)
    })
}

export function subscribeToConfirm(listener: ConfirmListener) {
    listeners.add(listener)
    if (pendingQueue.length > 0) {
        const queued = pendingQueue.splice(0, pendingQueue.length)
        queued.forEach((request) => listener(request))
    }
    return () => {
        listeners.delete(listener)
    }
}

export function resolveConfirm(requestId: string, accepted: boolean) {
    const resolver = resolverMap.get(requestId)
    if (!resolver) return
    resolver(accepted)
    resolverMap.delete(requestId)
}
