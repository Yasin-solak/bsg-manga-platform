import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { txa } from '@/i18n/activeLocale'

interface AdminReasonDialogProps {
    isOpen: boolean
    title: string
    description: string
    reason: string
    minLength?: number
    confirmLabel?: string
    cancelLabel?: string
    isBusy?: boolean
    onReasonChange: (value: string) => void
    onClose: () => void
    onConfirm: () => void
}

export function AdminReasonDialog({
    isOpen,
    title,
    description,
    reason,
    minLength = 3,
    confirmLabel = txa('Onayla'),
    cancelLabel = txa('Iptal'),
    isBusy = false,
    onReasonChange,
    onClose,
    onConfirm,
}: AdminReasonDialogProps) {
    const trimmedLength = reason.trim().length
    const isInvalid = trimmedLength < minLength

    return (
        <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
            <DialogContent className="sm:max-w-[560px]">
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>{description}</DialogDescription>
                </DialogHeader>

                <div className="space-y-2">
                    <Label htmlFor="admin-reason-input">{txa('Neden')}</Label>
                    <Textarea
                        id="admin-reason-input"
                        value={reason}
                        onChange={(event) => onReasonChange(event.target.value)}
                        placeholder={txa('Gerekceyi acik ve kisa bir sekilde yazin.')}
                        rows={4}
                        maxLength={500}
                    />
                    <p className="text-xs text-muted-foreground">
                        {txa('Minimum {v1} karakter. Mevcut: {v2}', { v1: minLength, v2: trimmedLength })}
                    </p>
                </div>

                <DialogFooter>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={onClose}
                        disabled={isBusy}
                    >
                        {cancelLabel}
                    </Button>
                    <Button
                        type="button"
                        variant="destructive"
                        onClick={onConfirm}
                        disabled={isBusy || isInvalid}
                    >
                        {isBusy ? txa('Isleniyor...') : confirmLabel}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
