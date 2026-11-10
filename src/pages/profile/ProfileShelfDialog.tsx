import type { ReactNode } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

type ProfileShelfDialogProps = {
  children: ReactNode
  description: string
  onOpenChange: (open: boolean) => void
  open: boolean
  title: string
}

export default function ProfileShelfDialog({
  children,
  description,
  onOpenChange,
  open,
  title,
}: ProfileShelfDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl rounded-[28px] border-border/70 bg-background/95 p-0 shadow-2xl">
        <DialogHeader className="border-b border-border/60 px-6 py-5">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="max-h-[70vh] overflow-y-auto px-6 py-5">
          {children}
        </div>
      </DialogContent>
    </Dialog>
  )
}
