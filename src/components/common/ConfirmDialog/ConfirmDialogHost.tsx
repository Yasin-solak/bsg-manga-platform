import { useEffect, useState } from 'react'
import {
    subscribeToConfirm,
    resolveConfirm,
    type ConfirmRequest,
} from '@/services/confirmService'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { txa } from '@/i18n/activeLocale'

const VARIANT_CONFIG: Record<ConfirmRequest['variant'], { label: string; className: string }> = {
    danger: { get label() { return txa('Dikkat') }, className: 'bg-destructive text-white' },
    warning: { get label() { return txa('Onay') }, className: 'bg-amber-500 text-white' },
    info: { get label() { return txa('Bilgi') }, className: 'bg-blue-500 text-white' },
}

function ConfirmDialogHost() {
    const [queue, setQueue] = useState<ConfirmRequest[]>([])
    const current = queue[0] ?? null

    useEffect(() => {
        const unsubscribe = subscribeToConfirm((request) => {
            setQueue((prev) => [...prev, request])
        })
        return () => unsubscribe()
    }, [])

    const closeCurrent = (accepted: boolean) => {
        if (!current) return
        resolveConfirm(current.id, accepted)
        setQueue((prev) => prev.slice(1))
    }

    if (!current) return null

    const config = VARIANT_CONFIG[current.variant]

    return (
        <Dialog open={true} onOpenChange={(open) => { if (!open) closeCurrent(false) }}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <div className="mb-2">
                        <Badge className={cn('text-xs', config.className)}>{config.label}</Badge>
                    </div>
                    <DialogTitle>{current.title}</DialogTitle>
                    <DialogDescription>{current.message}</DialogDescription>
                </DialogHeader>
                <DialogFooter className="gap-2 sm:gap-0">
                    <Button variant="outline" onClick={() => closeCurrent(false)}>
                        {current.cancelText}
                    </Button>
                    <Button
                        variant={current.variant === 'danger' ? 'destructive' : 'default'}
                        onClick={() => closeCurrent(true)}
                    >
                        {current.confirmText}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

export default ConfirmDialogHost
