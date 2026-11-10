import type { Dispatch, SetStateAction } from 'react'
import { approveFansubRequest, rejectFansubRequest } from '@/services/fansubService'
import { approveChapter, approveManga, rejectChapter, rejectManga } from '@/services/mangaService'
import { approveContentRevision, rejectContentRevision } from '@/services/contentRevisionService'
import { toast } from '@/services/toastService'
import type { PendingItem } from '@components/admin/AdminPendingSection'
import { toErrorMessage } from './adminPageUtils'
import { txa } from '@/i18n/activeLocale'

interface UseAdminPendingHandlersParams {
    setPendingItems: Dispatch<SetStateAction<PendingItem[]>>
}

/** Types requiring a rejection reason (sent to the author / applicant). */
export function pendingRejectNeedsReason(item: PendingItem) {
    return item.type === 'fansub_request'
}

/**
 * Pending approval decisions. On success the row leaves the queue and true returns
 * (the review desk moves to the next request); errors show in a toast.
 */
export function useAdminPendingHandlers({
    setPendingItems,
}: UseAdminPendingHandlersParams) {
    async function handleApprove(item: PendingItem): Promise<boolean> {
        try {
            // Live content revision: the new version goes live, the previous one is archived.
            if (item.revisionId) await approveContentRevision(item.revisionId)
            else if (item.type === 'manga') await approveManga(item.id)
            else if (item.type === 'chapter') await approveChapter(item.id)
            if (item.type === 'fansub_request') await approveFansubRequest(item.id)

            setPendingItems((previous) => previous.filter((entry) => entry.id !== item.id))
            toast.success(txa('"{v1}" onaylandı.', { v1: item.title }))
            return true
        } catch (error) {
            console.error('[AdminPage] handleApprove error', error)
            toast.error(toErrorMessage(error, txa('Onay işlemi başarısız.')))
            return false
        }
    }

    async function handleReject(item: PendingItem, manualReason?: string): Promise<boolean> {
        const reason = (manualReason || '').trim()
        if (pendingRejectNeedsReason(item) && reason.length < 3) {
            toast.warning(txa('Reddetme nedeni en az 3 karakter olmalı.'))
            return false
        }

        try {
            // If a live content revision is rejected the content is NOT DELETED; the old version continues as is.
            if (item.revisionId) await rejectContentRevision(item.revisionId, reason)
            else if (item.type === 'manga') await rejectManga(item.id)
            else if (item.type === 'chapter') await rejectChapter(item.id)
            if (item.type === 'fansub_request') await rejectFansubRequest(item.id, reason)

            setPendingItems((previous) => previous.filter((entry) => entry.id !== item.id))
            toast.info(txa('"{v1}" reddedildi.', { v1: item.title }))
            return true
        } catch (error) {
            console.error('[AdminPage] handleReject error', error)
            toast.error(toErrorMessage(error, txa('Reddetme işlemi başarısız.')))
            return false
        }
    }

    return {
        handleApprove,
        handleReject,
    }
}
