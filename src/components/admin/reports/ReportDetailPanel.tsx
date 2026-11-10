import { useEffect, useMemo, useState } from 'react'
import { Link } from '@/i18n/router'
import {
  CheckCircle2,
  CircleDot,
  ExternalLink,
  FileSearch,
  History,
  MessageSquareText,
  Send,
  ShieldAlert,
  UserRound,
  X,
} from 'lucide-react'
import {
  addReportModerationNote,
  getReportDetails,
  getReportModerationHistory,
  type Report,
  type ReportModerationEvent,
  type ReportTargetContext,
} from '@/services/reportService'
import { AdminSurface } from '@/components/admin/shared/AdminSurface'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/services/toastService'
import { cn } from '@/lib/utils'
import {
  formatReportDate,
  formatReportRelativeAge,
  getReportRisk,
  reportRiskLabel,
  reportStatusLabel,
  reportTargetLabel,
} from './reportManagementModel'
import { txa } from '@/i18n/activeLocale'

interface ReportDetailPanelProps {
  report: Report | null
  className?: string
  reporterReportCount: number
  reporterConfirmedCount: number
  isBusy: boolean
  onClose: () => void
  onResolve: (report: Report) => Promise<void>
  onDismiss: (report: Report) => Promise<void>
  onOpenDetail: (report: Report) => void
  onContextLoaded?: (reportId: string, context: ReportTargetContext | null) => void
}

function toErrorText(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) return error.message
  return fallback
}

function historyLabel(event: ReportModerationEvent) {
  if (event.action === 'report.note.add') return txa('İç not eklendi')
  if (event.action === 'report.status.resolved') return txa('Rapor çözüldü')
  if (event.action === 'report.status.dismissed') return txa('Rapor yoksayıldı')
  if (event.action === 'report.status.reopen') return txa('Rapor yeniden açıldı')
  return event.summary || txa('Moderasyon işlemi')
}

export function ReportDetailPanel({
  report,
  className,
  reporterReportCount,
  reporterConfirmedCount,
  isBusy,
  onClose,
  onResolve,
  onDismiss,
  onOpenDetail,
  onContextLoaded,
}: ReportDetailPanelProps) {
  const [context, setContext] = useState<ReportTargetContext | null>(null)
  const [history, setHistory] = useState<ReportModerationEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [noteDraft, setNoteDraft] = useState('')
  const [noteSaving, setNoteSaving] = useState(false)

  useEffect(() => {
    if (!report) {
      setContext(null)
      setHistory([])
      return
    }

    let cancelled = false
    setLoading(true)
    setContext(null)
    setHistory([])
    setNoteDraft('')

    void Promise.all([
      getReportDetails(report),
      getReportModerationHistory(report.id).catch(() => [] as ReportModerationEvent[]),
    ]).then(([details, events]) => {
      if (cancelled) return
      const nextContext = details.context || null
      setContext(nextContext)
      setHistory(events)
      onContextLoaded?.(report.id, nextContext)
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [onContextLoaded, report])

  const timeline = useMemo(() => {
    if (!report) return []
    const base: ReportModerationEvent[] = [{
      id: `${report.id}:created`,
      action: 'report.created',
      summary: txa('Rapor inceleme kuyruğuna alındı.'),
      actorUsername: report.reporter?.username || txa('Kullanıcı'),
      createdAt: report.created_at,
    }]
    if (report.resolved_at && !history.some((event) => event.action === `report.status.${report.status}`)) {
      base.unshift({
        id: `${report.id}:closed`,
        action: `report.status.${report.status}`,
        summary: report.status === 'resolved' ? txa('Rapor çözüldü.') : txa('Rapor yoksayıldı.'),
        actorUsername: txa('Moderasyon'),
        createdAt: report.resolved_at,
      })
    }
    return [...history, ...base].sort(
      (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
    )
  }, [history, report])

  if (!report) {
    return (
      <AdminSurface className={cn('flex min-h-[520px] flex-col items-center justify-center p-8 text-center', className)}>
        <FileSearch className="size-9 text-muted-foreground/35" aria-hidden="true" />
        <h2 className="mt-3 text-sm font-semibold text-foreground">{txa('Rapor seçilmedi')}</h2>
        <p className="mt-1 max-w-[28ch] text-xs leading-5 text-muted-foreground">
          {txa('Hedef içeriği ve moderasyon işlemlerini görmek için listeden bir rapor seçin.')}
        </p>
      </AdminSurface>
    )
  }

  const risk = getReportRisk(report)
  const reporterName = report.reporter?.username || txa('Anonim')
  const reporterAvatar = report.reporter?.avatar_url
    || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(reporterName)}`
  const targetOwnerName = context?.ownerUsername || context?.targetTitle || reportTargetLabel(report.target_type)
  const targetAvatar = context?.ownerAvatarUrl
    || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(targetOwnerName)}`
  const reportId = report.id

  async function handleAddNote() {
    const note = noteDraft.trim()
    if (note.length < 3) {
      toast.warning(txa('İç not en az 3 karakter olmalı.'))
      return
    }

    setNoteSaving(true)
    try {
      await addReportModerationNote(reportId, note)
      const events = await getReportModerationHistory(reportId)
      setHistory(events)
      setNoteDraft('')
      toast.success(txa('Moderasyon notu kaydedildi.'))
    } catch (error) {
      toast.error(toErrorText(error, txa('Moderasyon notu kaydedilemedi.')))
    } finally {
      setNoteSaving(false)
    }
  }

  return (
    <AdminSurface
      className={cn('flex max-h-[calc(100dvh-7rem)] flex-col overflow-hidden', className)}
      data-testid="admin-selected-report-panel"
    >
      <div className="flex items-start justify-between border-b border-border px-4 py-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-foreground">{txa('Rapor Detayı')}</h2>
            <Badge
              variant="outline"
              className={cn(
                'text-[10px]',
                risk.level === 'high'
                  ? 'border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300'
                  : risk.level === 'medium'
                    ? 'border-orange-500/25 bg-orange-500/10 text-orange-700 dark:text-orange-300'
                    : 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
              )}
            >
              {reportRiskLabel(risk.level)} Risk · {risk.score}
            </Badge>
          </div>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">#{report.id.slice(0, 8)}</p>
        </div>
        <Button type="button" size="icon-sm" variant="ghost" className="size-9" onClick={onClose} aria-label={txa('Rapor detayını kapat')}>
          <X className="size-4" aria-hidden="true" />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <section className="border-b border-border p-3" aria-labelledby="report-summary-heading">
          <div className="flex items-center justify-between gap-3">
            <Badge variant="outline" className="border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300">
              {reportStatusLabel(report.status)}
            </Badge>
            <div className="text-right">
              <p className="text-xs font-medium text-foreground">{formatReportRelativeAge(report.created_at)}</p>
              <p className="text-[10px] text-muted-foreground">{formatReportDate(report.created_at)}</p>
            </div>
          </div>

          <h3 id="report-summary-heading" className="mt-3 text-xs font-semibold text-foreground">{txa('Rapor Özeti')}</h3>
          <dl className="mt-2 space-y-2 text-xs">
            <div className="flex items-start justify-between gap-4">
              <dt className="text-muted-foreground">{txa('Rapor Nedeni')}</dt>
              <dd className="max-w-[60%] text-right font-medium text-foreground">{txa(report.reason || '') || txa('Belirtilmedi')}</dd>
            </div>
            <div className="flex items-start justify-between gap-4">
              <dt className="text-muted-foreground">{txa('Tip')}</dt>
              <dd className="max-w-[60%] text-right font-medium text-foreground">{reportTargetLabel(report.target_type)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{txa('Açıklama')}</dt>
              <dd className="mt-1 rounded-lg border border-border bg-muted/20 p-2.5 text-xs leading-5 text-foreground">
                {report.description || txa('Ek açıklama girilmemiş.')}
              </dd>
            </div>
          </dl>
        </section>

        <section className="border-b border-border p-3" aria-labelledby="report-target-heading">
          <div className="flex items-center justify-between gap-3">
            <h3 id="report-target-heading" className="text-xs font-semibold text-foreground">{txa('Hedef İçerik')}</h3>
            {context?.publicUrl ? (
              <Button type="button" variant="outline" size="sm" className="h-8 text-xs" asChild>
                <Link to={context.publicUrl} target="_blank" rel="noreferrer">
                  {txa('Hedefe Git')}
                  <ExternalLink className="size-3.5" aria-hidden="true" />
                </Link>
              </Button>
            ) : null}
          </div>

          {loading ? (
            <div className="mt-3 h-28 animate-pulse rounded-lg bg-muted/40 motion-reduce:animate-none" aria-label={txa('Hedef içerik yükleniyor')} />
          ) : (
            <div className="mt-2">
              <div className="flex items-center gap-3">
                <img
                  src={targetAvatar}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="size-9 rounded-full border border-border object-cover"
                />
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-foreground">{targetOwnerName}</p>
                  <p className="truncate text-[10px] text-muted-foreground">{context?.locationPath || reportTargetLabel(report.target_type)}</p>
                </div>
              </div>
              <blockquote className="mt-2 rounded-lg border border-border bg-muted/20 p-2.5 text-xs leading-5 text-foreground">
                {context?.targetPreview || txa('Hedef içerik önizlemesi bulunamadı.')}
              </blockquote>
            </div>
          )}
        </section>

        <section className="border-b border-border p-3" aria-labelledby="reporter-heading">
          <h3 id="reporter-heading" className="text-xs font-semibold text-foreground">{txa('Raporlayan')}</h3>
          <div className="mt-2 flex items-center gap-3">
            <img
              src={reporterAvatar}
              alt=""
              loading="lazy"
              decoding="async"
              className="size-10 rounded-full border border-border object-cover"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-foreground">{reporterName}</p>
              <p className="text-[10px] text-muted-foreground">{txa('Üye')}</p>
            </div>
            {report.reporter?.username ? (
              <Button type="button" variant="outline" size="sm" className="h-8 text-xs" asChild>
                <Link to={`/profil/${encodeURIComponent(report.reporter.username)}`} target="_blank" rel="noreferrer">
                  {txa('İncele')}
                  <UserRound className="size-3.5" aria-hidden="true" />
                </Link>
              </Button>
            ) : null}
          </div>
          <dl className="mt-2 grid grid-cols-2 divide-x divide-border rounded-lg border border-border bg-muted/15">
            <div className="px-3 py-2">
              <dt className="text-[10px] text-muted-foreground">{txa('Rapor sayısı')}</dt>
              <dd className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">{reporterReportCount}</dd>
            </div>
            <div className="px-3 py-2">
              <dt className="text-[10px] text-muted-foreground">{txa('Doğrulanan')}</dt>
              <dd className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">{reporterConfirmedCount}</dd>
            </div>
          </dl>
        </section>

        <section className="border-b border-border p-3" aria-labelledby="history-heading">
          <div className="flex items-center gap-2">
            <History className="size-4 text-primary" aria-hidden="true" />
            <h3 id="history-heading" className="text-xs font-semibold text-foreground">{txa('Geçmiş')}</h3>
          </div>
          <ol className="mt-2 space-y-2">
            {timeline.slice(0, 6).map((event, index) => (
              <li key={event.id} className="grid grid-cols-[auto_1fr] gap-2.5">
                <span className="relative mt-0.5 flex size-5 items-center justify-center rounded-full bg-primary/10 text-primary">
                  {event.action === 'report.note.add'
                    ? <MessageSquareText className="size-3" aria-hidden="true" />
                    : event.action.includes('resolved')
                      ? <CheckCircle2 className="size-3" aria-hidden="true" />
                      : <CircleDot className="size-3" aria-hidden="true" />}
                  {index < timeline.slice(0, 6).length - 1 ? (
                    <span className="absolute left-1/2 top-5 h-6 w-px -translate-x-1/2 bg-border" aria-hidden="true" />
                  ) : null}
                </span>
                <div className="min-w-0">
                  <p className="text-[11px] font-medium text-foreground">{historyLabel(event)}</p>
                  {event.note ? <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{event.note}</p> : null}
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    {event.actorUsername || txa('Sistem')} · {formatReportDate(event.createdAt)}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="p-3" aria-labelledby="notes-heading">
          <div className="flex items-center gap-2">
            <MessageSquareText className="size-4 text-primary" aria-hidden="true" />
            <h3 id="notes-heading" className="text-xs font-semibold text-foreground">{txa('İç Not')}</h3>
          </div>
          <Textarea
            value={noteDraft}
            onChange={(event) => setNoteDraft(event.target.value.slice(0, 500))}
            placeholder={txa('Yalnızca moderatörlerin görebileceği bir not ekleyin...')}
            className="mt-2 min-h-20 resize-none text-xs"
            aria-label={txa('Moderasyon notu')}
          />
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="text-[10px] tabular-nums text-muted-foreground">{noteDraft.length} / 500</span>
            <Button
              type="button"
              size="sm"
              className="h-8"
              disabled={noteSaving || noteDraft.trim().length < 3}
              onClick={() => void handleAddNote()}
            >
              <Send className="size-3.5" aria-hidden="true" />
              {txa('Notu Kaydet')}
            </Button>
          </div>
        </section>
      </div>

      <div className="grid grid-cols-[1fr_1fr_1fr] gap-2 border-t border-border bg-card p-3">
        <Button
          type="button"
          variant="outline"
          className="min-h-10 px-2 text-xs"
          disabled={isBusy}
          onClick={() => onOpenDetail(report)}
        >
          <FileSearch className="size-4" aria-hidden="true" />
          {txa('Detay')}
        </Button>
        <Button
          type="button"
          className="min-h-10 px-2 text-xs"
          disabled={isBusy || report.status !== 'pending'}
          onClick={() => void onResolve(report)}
        >
          <CheckCircle2 className="size-4" aria-hidden="true" />
          {txa('Çöz')}
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="min-h-10 px-2 text-xs"
          disabled={isBusy || report.status !== 'pending'}
          onClick={() => void onDismiss(report)}
        >
          <ShieldAlert className="size-4" aria-hidden="true" />
          {txa('Yoksay')}
        </Button>
      </div>
    </AdminSurface>
  )
}
