import {
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  List,
  MoreVertical,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { Report, ReportTargetContext } from '@/services/reportService'
import { cn } from '@/lib/utils'
import { AdminEntityHoverCard } from '@/components/admin/shared/AdminEntityHoverCard'
import {
  formatReportDate,
  formatReportRelativeAge,
  getReportRisk,
  reportRiskLabel,
  reportStatusLabel,
  reportTargetLabel,
} from './reportManagementModel'
import { intlLocale, txa } from '@/i18n/activeLocale'

interface ReportQueueTableProps {
  reports: Report[]
  totalCount: number
  selectedReportId: string | null
  selectedIds: Set<string>
  contextByReportId: Record<string, ReportTargetContext | null | undefined>
  page: number
  totalPages: number
  onPageChange: (page: number) => void
  onSelectReport: (report: Report) => void
  onToggleSelected: (reportId: string) => void
  onToggleVisible: () => void
}

function statusBadgeClass(status: Report['status']) {
  if (status === 'resolved') return 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
  if (status === 'dismissed') return 'border-slate-500/20 bg-slate-500/10 text-slate-600 dark:text-slate-300'
  return 'border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300'
}

function riskBadgeClass(level: ReturnType<typeof getReportRisk>['level']) {
  if (level === 'high') return 'border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300'
  if (level === 'medium') return 'border-orange-500/25 bg-orange-500/10 text-orange-700 dark:text-orange-300'
  return 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
}

export function ReportQueueTable({
  reports,
  totalCount,
  selectedReportId,
  selectedIds,
  contextByReportId,
  page,
  totalPages,
  onPageChange,
  onSelectReport,
  onToggleSelected,
  onToggleVisible,
}: ReportQueueTableProps) {
  const allVisibleSelected = reports.length > 0 && reports.every((report) => selectedIds.has(report.id))

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm" aria-label={txa('Rapor kuyruğu')}>
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            {txa('Raporlar')} <span className="text-muted-foreground">({totalCount.toLocaleString(intlLocale())})</span>
          </h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{txa('Bir rapora tıklayarak sağdaki inceleme panelini açın.')}</p>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/20 p-1" aria-label={txa('Liste görünümü')}>
          <Button type="button" size="icon-sm" variant="secondary" className="size-8" aria-label={txa('Liste görünümü seçili')}>
            <List className="size-4" aria-hidden="true" />
          </Button>
          <Button type="button" size="icon-sm" variant="ghost" className="size-8" disabled aria-label={txa('Kart görünümü yakında')}>
            <LayoutGrid className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <Table className="min-w-[940px]">
          <TableHeader>
            <TableRow className="bg-muted/20 hover:bg-muted/20">
              <TableHead className="w-11">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={onToggleVisible}
                  aria-label={txa('Görünen raporların tümünü seç')}
                  className="size-4 rounded border-border accent-primary"
                />
              </TableHead>
              <TableHead>{txa('Rapor Nedeni')}</TableHead>
              <TableHead>{txa('Tip')}</TableHead>
              <TableHead>{txa('Durum')}</TableHead>
              <TableHead>{txa('Raporlayan')}</TableHead>
              <TableHead>{txa('Hedef')}</TableHead>
              <TableHead>{txa('Tarih')}</TableHead>
              <TableHead>{txa('Öncelik')}</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {reports.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="h-56 text-center">
                  <p className="text-sm font-medium text-foreground">{txa('Bu filtrede rapor bulunamadı')}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{txa('Filtreleri temizleyerek tüm kuyruğu görüntüleyin.')}</p>
                </TableCell>
              </TableRow>
            ) : reports.map((report) => {
              const risk = getReportRisk(report)
              const context = contextByReportId[report.id]
              const reporterName = report.reporter?.username || txa('Anonim')
              const reporterAvatar = report.reporter?.avatar_url
                || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(reporterName)}`
              const isSelected = selectedReportId === report.id

              return (
                <TableRow
                  key={report.id}
                  data-testid={`report-row-${report.id}`}
                  className={cn(
                    'cursor-pointer transition-colors',
                    isSelected
                      ? 'bg-primary/[0.055] shadow-[inset_3px_0_0_hsl(var(--primary))] hover:bg-primary/[0.075]'
                      : 'hover:bg-muted/35',
                  )}
                  onClick={() => onSelectReport(report)}
                  aria-selected={isSelected}
                >
                  <TableCell onClick={(event) => event.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(report.id)}
                      onChange={() => onToggleSelected(report.id)}
                      aria-label={txa('{v1} raporunu seç', { v1: txa(report.reason || '') })}
                      className="size-4 rounded border-border accent-primary"
                    />
                  </TableCell>
                  <TableCell>
                    <div className="max-w-[16rem]">
                      <p className="truncate text-xs font-semibold text-foreground">{txa(report.reason || '') || txa('Sebep belirtilmedi')}</p>
                      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                        {report.description || txa('Ek açıklama yok')}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="whitespace-nowrap text-[10px] font-medium">
                      {reportTargetLabel(report.target_type)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn('whitespace-nowrap text-[10px]', statusBadgeClass(report.status))}>
                      {reportStatusLabel(report.status)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <img
                        src={reporterAvatar}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="size-7 rounded-full border border-border object-cover"
                      />
                      <div className="min-w-0">
                        <p className="max-w-[7rem] truncate text-xs font-medium text-foreground">
                          <AdminEntityHoverCard kind="user" entityKey={report.reporter_id} focusable={false}>{reporterName}</AdminEntityHoverCard>
                        </p>
                        <p className="text-[10px] text-muted-foreground">{txa('Üye')}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="max-w-[8.5rem]">
                      <p className="truncate text-xs font-medium text-foreground">
                        {/* Kullanici hedefinde ya da icerigin sahibinde bilgi karti. */}
                        <AdminEntityHoverCard
                          kind="user"
                          entityKey={report.target_type === 'user' ? report.target_id : context?.ownerUsername}
                          focusable={false}
                        >
                          {context?.ownerUsername || context?.targetTitle || reportTargetLabel(report.target_type)}
                        </AdminEntityHoverCard>
                      </p>
                      {/* Eskiden kimligin ilk 8 karakteri ("72000000") yaziyordu; konum daha anlamli. */}
                      <p className="truncate text-[10px] text-muted-foreground" title={context?.locationPath}>
                        {context?.locationPath || reportTargetLabel(report.target_type)}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <p className="whitespace-nowrap text-xs font-medium text-foreground">{formatReportRelativeAge(report.created_at)}</p>
                    <p className="whitespace-nowrap text-[10px] text-muted-foreground">{formatReportDate(report.created_at)}</p>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn('whitespace-nowrap text-[10px]', riskBadgeClass(risk.level))}>
                      <span className="mr-1 size-1.5 rounded-full bg-current" aria-hidden="true" />
                      {reportRiskLabel(risk.level)}
                    </Badge>
                  </TableCell>
                  <TableCell onClick={(event) => event.stopPropagation()}>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      className="size-9"
                      aria-label={txa('{v1} raporunu incele', { v1: txa(report.reason || '') })}
                      onClick={() => onSelectReport(report)}
                    >
                      <MoreVertical className="size-4" aria-hidden="true" />
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col gap-3 border-t border-border px-4 py-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <span>{txa('Sayfa başına 10 · Toplam {v1} rapor', { v1: totalCount.toLocaleString(intlLocale()) })}</span>
        <div className="flex items-center gap-2">
          <span className="tabular-nums">{page} / {Math.max(1, totalPages)}</span>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            className="size-9"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            aria-label={txa('Önceki sayfa')}
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            className="size-9"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            aria-label={txa('Sonraki sayfa')}
          >
            <ChevronRight className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </div>
    </section>
  )
}
