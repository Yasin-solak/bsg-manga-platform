import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

interface ModalProps {
    isOpen: boolean
    onClose: () => void
    title?: string
    children: React.ReactNode
    size?: 'small' | 'medium' | 'large'
}

const sizeClasses: Record<string, string> = {
    small: 'sm:max-w-md',
    medium: 'sm:max-w-lg',
    large: 'sm:max-w-3xl',
}

/**
 * Modal component: a wrapper over the shadcn/ui Dialog
 * Keeps existing API compatibility (isOpen, onClose, title, size)
 */
function Modal({ isOpen, onClose, title, children, size = 'medium' }: ModalProps) {
    return (
        <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
            <DialogContent className={cn('gap-0 p-0', sizeClasses[size])}>
                {title && (
                    <DialogHeader className="border-b border-border px-6 py-4">
                        <DialogTitle>{title}</DialogTitle>
                    </DialogHeader>
                )}
                <ScrollArea className="max-h-[80vh]">
                    <div className="px-6 py-4">{children}</div>
                </ScrollArea>
            </DialogContent>
        </Dialog>
    )
}

export default Modal
