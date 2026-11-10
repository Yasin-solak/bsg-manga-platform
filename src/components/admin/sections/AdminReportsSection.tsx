import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CheckCircle2,
  ChevronDown,
  RefreshCw,
  ShieldX,
} from 'lucide-react'
import type {
  Report,
  ReportStatus,
  ReportTargetContext,
} from '@/services/reportService'
import {
  getReportDetails,
  updateReportStatus,
} from '@/services/reportService'
import { AdminSectionHeader } from '@/components/admin/shared/AdminSectionHeader'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { ReportReviewModal } from '@/components/common/ReportReviewModal/ReportReviewModal'
import { confirmDialog } from '@/services/confirmService'
import { toast } from '@/services/toastService'
import { ReportDetailPanel } from '@/components/admin/reports/ReportDetailPanel'
import { ReportFilters } from '@/components/admin/reports/ReportFilters'
import { ReportInsights } from '@/components/admin/reports/ReportInsights'
import { ReportQueueTable } from '@/components/admin/reports/ReportQueueTable'
import { ReportStatCards } from '@/components/admin/reports/ReportStatCards'
import {
  DEFAULT_REPORT_FILTERS,
  filterAndSortReports,
  getReportManagementStats,
  type ReportFiltersState,
} from '@/components/admin/reports/reportManagementModel'
import { txa } from '@/i18n/activeLocale'

interface ReportStats {
  pending: number
  resolved: number
  dismissed: number
}

interface AdminReportsSectionProps {
  reportStatusFilter: 'all' | ReportStatus
  onReportStatusFilterChange: (value: 'all' | ReportStatus) => void
  reportStats: ReportStats
  reports: Report[]
  onRefreshReports: () => Promise<void>
}

const PAGE_SIZE = 10

function toErrorText(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) return error.message
  return fallback
}

export function AdminReportsSection({
  reportStatusFilter,
  onReportStatusFilterChange,
  reports,
  onRefreshReports,
}: AdminReportsSectionProps) {
  const [filters, setFilters] = useState<ReportFiltersState>({
    ...DEFAULT_REPORT_FILTERS,
    status: reportStatusFilter,
  })
  const [page, setPage] = useState(1)
  const [selectedReport, setSelectedReport] = useState<Report | null>(null)
  const [detailModalReport, setDetailModalReport] = useState<Report | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [contextByReportId, setContextByReportId] = useState<Record<string, ReportTargetContext | null>>({})
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)

  const stats = useMemo(() => getReportManagementStats(reports), [reports])
  const filteredReports = useMemo(() => filterAndSortReports(reports, filters), [filters, reports])
  const totalPages = Math.max(1, Math.ceil(filteredReports.length / PAGE_SIZE))
  const pageReports = useMemo(
    () => filteredReports.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filteredReports, page],
  )

  useEffect(() => {
    if (reportStatusFilter === filters.status) return
    setFilters((current) => ({ ...current, status: reportStatusFilter }))
    setPage(1)
  }, [filters.status, reportStatusFilter])

  useEffect(() => {
    if (page <= totalPages) return
    setPage(totalPages)
  }, [page, totalPages])

  useEffect(() => {
    if (filteredReports.length === 0) {
      setSelectedReport(null)
      return
    }

    setSelectedReport((current) => {
      if (!current) return filteredReports[0]
      return filteredReports.find((report) => report.id === current.id) || filteredReports[0]
    })
  }, [filteredReports])

  useEffect(() => {
    let cancelled = false
    const unresolved = pageReports.filter((report) => !(report.id in contextByReportId))
    if (unresolved.length === 0) return

    void Promise.all(unresolved.map(async (report) => {
      try {
        const details = await getReportDetails(report)
        return [report.id, details.context || null] as const
      } catch {
        // Even if one target is deleted or unreachable, the rest of the queue list works.
        return [report.id, null] as const
      }
    })).then((entries) => {
      if (cancelled) return
      setContextByReportId((current) => {
        const next = { ...current }
        entries.forEach(([reportId, context]) => {
          next[reportId] = context
        })
        return next
      })
    })

    return () => {
      cancelled = true
    }
  }, [contextByReportId, pageReports])

  const handleContextLoaded = useCallback((reportId: string, context: ReportTargetContext | null) => {
    setContextByReportId((current) => (
      current[reportId] === context ? current : { ...current, [reportId]: context }
    ))
  }, [])

  function handleFiltersChange(nextFilters: ReportFiltersState) {
    setFilters(nextFilters)
    setPage(1)
    if (nextFilters.status !== reportStatusFilter) {
      onReportStatusFilterChange(nextFilters.status)
    }
  }

  function handleResetFilters() {
    const nextFilters: ReportFiltersState = {
      ...DEFAULT_REPORT_FILTERS,
      status: 'all',
    }
    handleFiltersChange(nextFilters)
  }

  function handleSelectReport(report: Report) {
    setSelectedReport(report)
    if (typeof window !== 'undefined' && !window.matchMedia('(min-width: 1480px)').matches) {
      setMobilePanelOpen(true)
    }
  }

  function handleToggleSelected(reportId: string) {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(reportId)) next.delete(reportId)
      else next.add(reportId)
      return next
    })
  }

  function handleToggleVisible() {
    setSelectedIds((current) => {
      const allSelected = pageReports.length > 0 && pageReports.every((report) => current.has(report.id))
      const next = new Set(current)
      pageReports.forEach((report) => {
        if (allSelected) next.delete(report.id)
        else next.add(report.id)
      })
      return next
    })
  }

  async function handleRefresh() {
    setRefreshing(true)
    try {
      await onRefreshReports()
      toast.success(txa('Rapor kuyruğu yenilendi.'))
    } catch (error) {
      toast.error(toErrorText(error, txa('Raporlar yenilenemedi.')))
    } finally {
      setRefreshing(false)
    }
  }

  async function handleResolve(report: Report) {
    setActionLoading(true)
    try {
      await updateReportStatus(report.id, 'resolved')
      await onRefreshReports()
      toast.success(txa('Rapor çözüldü olarak işaretlendi.'))
    } catch (error) {
      toast.error(toErrorText(error, txa('Rapor çözülemedi.')))
    } finally {
      setActionLoading(false)
    }
  }

  async function handleDismiss(report: Report) {
    const confirmed = await confirmDialog({
      title: txa('Raporu Yoksay'),
      message: txa('Bu raporu moderasyon kuyruğundan çıkarmak istiyor musunuz?'),
      confirmText: txa('Yoksay'),
      cancelText: txa('Vazgeç'),
      variant: 'warning',
    })
    if (!confirmed) return

    setActionLoading(true)
    try {
      await updateReportStatus(report.id, 'dismissed')
      await onRefreshReports()
      toast.info(txa('Rapor yoksayıldı.'))
    } catch (error) {
      toast.error(toErrorText(error, txa('Rapor yoksayılamadı.')))
    } finally {
      setActionLoading(false)
    }
  }

  async function handleBulkStatus(status: Extract<ReportStatus, 'resolved' | 'dismissed'>) {
    const targets = reports.filter((report) => selectedIds.has(report.id) && report.status === 'pending')
    if (targets.length === 0) {
      toast.warning(txa('İşlem için en az bir bekleyen rapor seçin.'))
      return
    }

    const confirmed = await confirmDialog({
      title: status === 'resolved' ? txa('Raporları Çöz') : txa('Raporları Yoksay'),
      message: txa('{v1} rapor toplu olarak {v2} durumuna alınacak.', { v1: targets.length, v2: status === 'resolved' ? txa('çözüldü') : txa('yoksayıldı') }),
      confirmText: status === 'resolved' ? txa('Çöz') : txa('Yoksay'),
      cancelText: txa('Vazgeç'),
      variant: status === 'resolved' ? 'info' : 'warning',
    })
    if (!confirmed) return

    setActionLoading(true)
    try {
      await Promise.all(targets.map((report) => updateReportStatus(report.id, status)))
      setSelectedIds(new Set())
      await onRefreshReports()
      toast.success(txa('{v1} rapor güncellendi.', { v1: targets.length }))
    } catch (error) {
      toast.error(toErrorText(error, txa('Toplu işlem tamamlanamadı.')))
    } finally {
      setActionLoading(false)
    }
  }

  const reporterReportCount = selectedReport
    ? reports.filter((report) => report.reporter_id === selectedReport.reporter_id).length
    : 0
  const reporterConfirmedCount = selectedReport
    ? reports.filter((report) => report.reporter_id === selectedReport.reporter_id && report.status === 'resolved').length
    : 0

  const detailPanel = (
    <ReportDetailPanel
      report={selectedReport}
      reporterReportCount={reporterReportCount}
      reporterConfirmedCount={reporterConfirmedCount}
      isBusy={actionLoading}
      onClose={() => {
        setSelectedReport(null)
        setMobilePanelOpen(false)
      }}
      onResolve={handleResolve}
      onDismiss={handleDismiss}
      onOpenDetail={setDetailModalReport}
      onContextLoaded={handleContextLoaded}
    />
  )

  return (
    <section className="space-y-4" data-testid="admin-reports-section">
      <AdminSectionHeader
        title={txa('Raporlar')}
        description={txa('Kural ihlali ve şikâyet kuyruğu: riskliyi ve en eskiyi önce incele, kararını gerekçesiyle ver.')}
        actions={(
          <>
            <Button
              type="button"
              variant="outline"
              className="h-9 rounded-full"
              disabled={refreshing}
              onClick={() => void handleRefresh()}
            >
              <RefreshCw className={refreshing ? 'size-4 animate-spin motion-reduce:animate-none' : 'size-4'} aria-hidden="true" />
              {txa('Yenile')}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" className="h-9 rounded-full" disabled={actionLoading}>
                  {txa('Toplu işlemler')}
                  {selectedIds.size > 0 ? <span className="rounded bg-primary-foreground/15 px-1.5 text-[10px]">{selectedIds.size}</span> : null}
                  <ChevronDown className="size-4" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem onSelect={() => void handleBulkStatus('resolved')}>
                  <CheckCircle2 className="size-4" aria-hidden="true" />
                  {txa('Seçilenleri Çöz')}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void handleBulkStatus('dismissed')}>
                  <ShieldX className="size-4" aria-hidden="true" />
                  {txa('Seçilenleri Yoksay')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
      />

      <div className="grid min-w-0 gap-4 min-[1480px]:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-4">
          <ReportStatCards
            reports={reports}
            stats={stats}
            activeStatus={filters.status}
            activeRisk={filters.risk}
            onStatusChange={(status) => handleFiltersChange({ ...filters, status })}
            onRiskChange={(risk) => handleFiltersChange({ ...filters, risk })}
          />

          <ReportFilters
            filters={filters}
            resultCount={filteredReports.length}
            onChange={handleFiltersChange}
            onReset={handleResetFilters}
          />

          <ReportQueueTable
            reports={pageReports}
            totalCount={filteredReports.length}
            selectedReportId={selectedReport?.id || null}
            selectedIds={selectedIds}
            contextByReportId={contextByReportId}
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
            onSelectReport={handleSelectReport}
            onToggleSelected={handleToggleSelected}
            onToggleVisible={handleToggleVisible}
          />

          <ReportInsights reports={reports} />
        </div>

        <aside
          className="hidden self-start min-[1480px]:sticky min-[1480px]:top-4 min-[1480px]:block"
          aria-label={txa('Seçili rapor detayları')}
        >
          {detailPanel}
        </aside>
      </div>

      <Sheet open={mobilePanelOpen && Boolean(selectedReport)} onOpenChange={setMobilePanelOpen}>
        <SheetContent
          side="right"
          showCloseButton={false}
          className="h-dvh w-[min(96vw,420px)] max-w-none overflow-hidden p-0 min-[1480px]:hidden"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>{txa('Seçili Rapor')}</SheetTitle>
            <SheetDescription>{txa('Rapor ayrıntıları ve moderasyon işlemleri.')}</SheetDescription>
          </SheetHeader>
          <ReportDetailPanel
            report={selectedReport}
            reporterReportCount={reporterReportCount}
            reporterConfirmedCount={reporterConfirmedCount}
            isBusy={actionLoading}
            className="h-full min-h-full max-h-none rounded-none border-0 shadow-none"
            onClose={() => setMobilePanelOpen(false)}
            onResolve={handleResolve}
            onDismiss={handleDismiss}
            onOpenDetail={(report) => {
              setMobilePanelOpen(false)
              setDetailModalReport(report)
            }}
            onContextLoaded={handleContextLoaded}
          />
        </SheetContent>
      </Sheet>

      <ReportReviewModal
        isOpen={Boolean(detailModalReport)}
        onClose={() => setDetailModalReport(null)}
        report={detailModalReport}
        onStatusChange={() => {
          void onRefreshReports()
        }}
      />
    </section>
  )
}
