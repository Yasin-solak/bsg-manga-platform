import { useMemo } from 'react'
import type { Report, ReportStatus } from '@/services/reportService'

interface UseAdminComputedStateParams {
    reports: Report[]
    reportStatusFilter: 'all' | ReportStatus
}

export function useAdminComputedState({
    reports,
    reportStatusFilter,
}: UseAdminComputedStateParams) {
    const reportStats = useMemo(() => {
        return reports.reduce(
            (acc, report) => {
                if (report.status === 'resolved') acc.resolved += 1
                else if (report.status === 'dismissed') acc.dismissed += 1
                else acc.pending += 1
                return acc
            },
            { pending: 0, resolved: 0, dismissed: 0 },
        )
    }, [reports])

    const filteredReports = useMemo(() => {
        if (reportStatusFilter === 'all') return reports
        return reports.filter((report) => report.status === reportStatusFilter)
    }, [reports, reportStatusFilter])

    return {
        reportStats,
        filteredReports,
    }
}
