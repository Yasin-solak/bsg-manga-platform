import type { Dispatch, SetStateAction } from 'react'
import { listReports, type Report } from '@/services/reportService'
import { toast } from '@/services/toastService'
import { toErrorMessage } from './adminPageUtils'
import { txa } from '@/i18n/activeLocale'

interface UseAdminReportHandlersParams {
    isReportsFeatureEnabled: boolean
    setReports: Dispatch<SetStateAction<Report[]>>
}

export function useAdminReportHandlers({
    isReportsFeatureEnabled,
    setReports,
}: UseAdminReportHandlersParams) {
    async function refreshReports() {
        if (!isReportsFeatureEnabled) {
            setReports([])
            return
        }
        try {
            const data = await listReports()
            setReports(data)
        } catch (error) {
            console.error('[AdminPage] refreshReports error', error)
            toast.error(toErrorMessage(error, txa('Raporlar yenilenemedi.')))
        }
    }

    return {
        refreshReports,
    }
}
