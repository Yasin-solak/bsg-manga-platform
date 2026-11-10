import React, { useEffect, useState } from 'react'
import ReportSheet from './ReportSheet'
import { REPORT_REASONS } from './reportReasons'
import { useIsMobileViewport } from '@/hooks/useIsMobileViewport'
import { createReport, type ReportTargetType } from '@/services/reportService'
import { toast } from '@/services/toastService'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { txa } from '@/i18n/activeLocale'

interface ReportModalProps {
    isOpen: boolean
    onClose: () => void
    targetId: string
    targetType: ReportTargetType
}



function modalTitleForTarget(targetType: ReportTargetType) {
    if (targetType === 'user') return txa('Kullanıcıyı Raporla')
    if (targetType === 'manga') return txa('Mangayı Raporla')
    if (targetType === 'chapter') return txa('Bölümü Raporla')
    return txa('Yorumu Raporla')
}

export const ReportModal: React.FC<ReportModalProps> = ({ isOpen, onClose, targetId, targetType }) => {
    const [reason, setReason] = useState(REPORT_REASONS[0])
    const [description, setDescription] = useState('')
    const [loading, setLoading] = useState(false)
    const isMobile = useIsMobileViewport()

    useEffect(() => {
        if (isOpen) return
        setReason(REPORT_REASONS[0])
        setDescription('')
        setLoading(false)
    }, [isOpen])

    const handleClose = () => {
        if (loading) return
        onClose()
    }

    const submitReport = async () => {
        setLoading(true)
        try {
            await createReport(targetId, targetType, reason, description)
            toast.success(txa('Raporunuz iletildi. Teşekkürler!'))
            handleClose()
        } catch (error) {
            console.error('[ReportModal] createReport', error)
            const message = error instanceof Error && error.message
                ? error.message
                : txa('Rapor gönderilemedi.')
            toast.error(message)
        } finally {
            setLoading(false)
        }
    }

    /*
     * BOTTOM SHEET ON MOBILE, a dialog on wide screens. It shares the same structure with the ⋯ menu;
     * on phones a centered box + the OS's own
     * `<select>` surface took the flow to a third layer.
     */
    if (isMobile) {
        return (
            <ReportSheet
                open={isOpen}
                onOpenChange={(open) => { if (!open) handleClose() }}
                title={modalTitleForTarget(targetType)}
                reason={reason}
                onReasonChange={setReason}
                description={description}
                onDescriptionChange={setDescription}
                loading={loading}
                onSubmit={() => { void submitReport() }}
            />
        )
    }

    return (
        <Dialog
            open={isOpen}
            onOpenChange={(open) => {
                if (!open) handleClose()
            }}
        >
            <DialogContent className="max-h-[92vh] p-0 sm:max-w-2xl">
                <DialogHeader className="border-b px-6 py-4">
                    <DialogTitle>{modalTitleForTarget(targetType)}</DialogTitle>
                </DialogHeader>
                <ScrollArea className="max-h-[72vh] px-6 py-4">
                    <form
                        onSubmit={(event) => { event.preventDefault(); void submitReport() }}
                        className="flex flex-col gap-4"
                    >
                        <div className="space-y-2">
                            <Label htmlFor="report-reason-select">{txa('Sebep')}</Label>
                            <select
                                id="report-reason-select"
                                value={reason}
                                onChange={(event) => setReason(event.target.value)}
                                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-70"
                                disabled={loading}
                            >
                                {REPORT_REASONS.map((option) => (
                                    <option key={option} value={option}>{option}</option>
                                ))}
                            </select>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="report-description-textarea">{txa('Açıklama (Opsiyonel)')}</Label>
                            <textarea
                                id="report-description-textarea"
                                value={description}
                                onChange={(event) => setDescription(event.target.value)}
                                className="min-h-[110px] w-full resize-y rounded-lg border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-70"
                                rows={4}
                                placeholder={txa('Daha fazla detay ekleyin...')}
                                disabled={loading}
                            />
                        </div>

                        <div className="flex justify-end gap-3 pt-1">
                            <Button type="button" variant="outline" onClick={handleClose} disabled={loading}>
                                {txa('İptal')}
                            </Button>
                            <Button type="submit" disabled={loading}>
                                {loading ? txa('Gönderiliyor...') : txa('Raporla')}
                            </Button>
                        </div>
                    </form>
                </ScrollArea>
            </DialogContent>
        </Dialog>
    )
}
