import { useEffect, useRef, useState } from 'react'
import { subscribeToToast, type ToastMessage } from '@/services/toastService'
import { cn } from '@/lib/utils'
import { X, CheckCircle2, AlertCircle, AlertTriangle, Info } from 'lucide-react'
import { txa } from '@/i18n/activeLocale'

interface ToastState extends ToastMessage {
    expiresAt: number
}

const VARIANT_CONFIG: Record<ToastMessage['variant'], { icon: React.ReactNode; className: string }> = {
    success: {
        icon: <CheckCircle2 className="h-5 w-5 text-green-500" />,
        className: 'border-green-500/30 bg-green-500/10',
    },
    error: {
        icon: <AlertCircle className="h-5 w-5 text-destructive" />,
        className: 'border-destructive/30 bg-destructive/10',
    },
    warning: {
        icon: <AlertTriangle className="h-5 w-5 text-amber-500" />,
        className: 'border-amber-500/30 bg-amber-500/10',
    },
    info: {
        icon: <Info className="h-5 w-5 text-blue-500" />,
        className: 'border-blue-500/30 bg-blue-500/10',
    },
}

function ToastContainer() {
    const [items, setItems] = useState<ToastState[]>([])
    const timeoutMapRef = useRef(new Map<string, number>())

    useEffect(() => {
        const timeoutMap = timeoutMapRef.current
        const unsubscribe = subscribeToToast((toast) => {
            const now = Date.now()
            const nextItem: ToastState = { ...toast, expiresAt: now + toast.duration }

            setItems((prev) => {
                const next = [...prev, nextItem]
                if (next.length <= 5) return next

                const overflowItem = next[0]
                const overflowTimeoutId = timeoutMap.get(overflowItem.id)
                if (overflowTimeoutId) {
                    window.clearTimeout(overflowTimeoutId)
                    timeoutMap.delete(overflowItem.id)
                }
                return next.slice(1)
            })

            const timeoutId = window.setTimeout(() => {
                setItems((prev) => prev.filter((item) => item.id !== toast.id))
                timeoutMap.delete(toast.id)
            }, toast.duration)

            timeoutMap.set(toast.id, timeoutId)
        })

        return () => {
            unsubscribe()
            timeoutMap.forEach((id) => window.clearTimeout(id))
            timeoutMap.clear()
        }
    }, [])

    const removeToast = (id: string) => {
        const timeoutId = timeoutMapRef.current.get(id)
        if (timeoutId) { window.clearTimeout(timeoutId); timeoutMapRef.current.delete(id) }
        setItems((prev) => prev.filter((item) => item.id !== id))
    }

    if (items.length === 0) return null

    // z-index must be ABOVE the reader shell (z-[10000]): otherwise
    // notifications sent in the reader (e.g. "Your report was sent") stayed behind the shell
    // and were never visible.
    return (
        <div className="fixed right-4 top-4 z-[10100] flex flex-col gap-2 w-80" aria-live="polite" aria-atomic="true">
            {items.map((item) => {
                const config = VARIANT_CONFIG[item.variant]
                return (
                    <div
                        key={item.id}
                        role="status"
                        className={cn(
                            'flex items-start gap-3 rounded-lg border p-3 shadow-lg backdrop-blur-sm animate-in slide-in-from-right-full fade-in-0 duration-300',
                            config.className,
                        )}
                    >
                        <div className="shrink-0 mt-0.5">{config.icon}</div>
                        <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-foreground">{item.message}</p>
                        </div>
                        <button
                            type="button"
                            className="shrink-0 rounded-md p-0.5 text-muted-foreground hover:text-foreground transition-colors"
                            onClick={() => removeToast(item.id)}
                            aria-label={txa('Bildirimi kapat')}
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                )
            })}
        </div>
    )
}

export default ToastContainer
