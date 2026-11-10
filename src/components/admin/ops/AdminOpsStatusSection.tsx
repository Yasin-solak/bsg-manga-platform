import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from '@/i18n/router'
import { ArrowRight } from 'lucide-react'
import { OPEN_SECURITY_FINDINGS, SECURITY_AUDIT_DATE } from '@/lib/securityFindings'
import { computeSecurityScore } from '@/lib/securityScore'
import { listAdminAuditLogs, type AdminAuditLogItem } from '@/services/adminOpsService'
import { getAdminSecurityOverview, listAdminSecurityAlerts } from '@/services/adminSecurityService'
import { getAdminUserOverview } from '@/services/adminUserService'
import { AdminSurface } from '@/components/admin/shared/AdminSurface'
import { AdminOpsStatCard } from './AdminOpsStatCard'
import { AdminOpsMaintenanceCard } from './AdminOpsMaintenanceCard'
import { Badge } from '@/components/ui/badge'
import { toast } from '@/services/toastService'
import { cn } from '@/lib/utils'
import type { OpsTab } from './adminOpsUtils'
import { intlLocale, txa } from '@/i18n/activeLocale'

/**
 * Operations > Status.
 *
 * **What is shown: only things with REAL DATA BEHIND THEM.** The first design had
 * boxes like "system load 38%" and "system status: healthy"; neither had a source.
 * A fake green badge undermines the operations panel's only job,
 * trust: it would still glow green the day things really broke. So
 * nothing unmeasurable was put here.
 *
 * The security score is not a BADGE but a DOOR to a list: below the number there is always
 * what each lost point maps to.
 */

function formatDateTime(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString(intlLocale())
}

interface AdminOpsStatusSectionProps {
  /** Sekmeler arasi gecis; kutular ilgili sekmeye goturur. */
  onOpenTab?: (tab: OpsTab) => void
}

function AdminOpsStatusSection({ onOpenTab }: AdminOpsStatusSectionProps) {
  const navigate = useNavigate()
  const [copied, setCopied] = useState(false)
  const [onlineNow, setOnlineNow] = useState<number | null>(null)
  const [criticalAlerts, setCriticalAlerts] = useState(0)
  const [highAlerts, setHighAlerts] = useState(0)
  const [criticalEvents, setCriticalEvents] = useState<number | null>(null)
  const [activity, setActivity] = useState<AdminAuditLogItem[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    // Each box loads ON ITS OWN: if one blows up the others must stay visible.
    // The whole operations panel cannot depend on one error.
    const [overview, alerts, users, logs] = await Promise.allSettled([
      getAdminSecurityOverview(24),
      listAdminSecurityAlerts({ status: 'open' }),
      getAdminUserOverview(),
      listAdminAuditLogs({ limit: 8 }),
    ])

    if (overview.status === 'fulfilled') setCriticalEvents(overview.value.criticalEvents)
    if (alerts.status === 'fulfilled') {
      setCriticalAlerts(alerts.value.filter((alert) => alert.severity === 'critical').length)
      setHighAlerts(alerts.value.filter((alert) => alert.severity === 'high').length)
    }
    if (users.status === 'fulfilled') setOnlineNow(users.value.onlineNow ?? null)
    if (logs.status === 'fulfilled') setActivity(logs.value.slice(0, 8))
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  /** The version id helps in bug reports; typing it by hand is error prone. */
  const copyVersion = async () => {
    try {
      await navigator.clipboard.writeText(__APP_COMMIT__)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error(txa('Panoya kopyalanamadi.'))
    }
  }

  const score = computeSecurityScore({
    openFindings: OPEN_SECURITY_FINDINGS,
    openCriticalAlerts: criticalAlerts,
    openHighAlerts: highAlerts,
  })

  return (
    <section className="space-y-4" data-testid="admin-ops-status">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <AdminOpsStatCard
          label={txa('Calisan surum')}
          value={__APP_COMMIT__}
          mono
          hint={`Derleme: ${formatDateTime(__APP_BUILT_AT__)}`}
          action={{ label: copied ? txa('Kopyalandi') : txa('Kopyala'), run: () => { void copyVersion() } }}
        />
        <AdminOpsStatCard
          label={txa('Cevrimici')}
          value={onlineNow === null ? '—' : onlineNow.toLocaleString(intlLocale())}
          hint={txa('Şu an aktif kullanıcı')}
          tone={onlineNow ? 'success' : 'default'}
          action={{ label: txa('Kullanıcılar'), run: () => navigate('/admin/kullanicilar') }}
        />
        <AdminOpsStatCard
          label={txa('Açık alarm')}
          value={loading ? '—' : `${criticalAlerts + highAlerts}`}
          hint={txa('{v1} kritik, {v2} yuksek', { v1: criticalAlerts, v2: highAlerts })}
          tone={criticalAlerts > 0 ? 'danger' : highAlerts > 0 ? 'warn' : 'default'}
          action={{ label: txa('Alarmlar'), run: () => onOpenTab?.('security') }}
        />
        <AdminOpsStatCard
          label={txa('Güvenlik skoru')}
          // The score alone says nothing; "/ 100" gives the scale.
          value={`${score.score} / 100`}
          hint={loading ? txa('Hesaplaniyor...') : txa('{v1} kritik olay · son 24 saat', { v1: criticalEvents ?? 0 })}
          tone={score.band === 'iyi' ? 'success' : score.band === 'dikkat' ? 'warn' : 'danger'}
          action={{ label: txa('Güvenlik'), run: () => onOpenTab?.('security') }}
        />
      </div>

      <AdminOpsMaintenanceCard />

      <div className="grid gap-4 xl:grid-cols-[22rem_minmax(0,1fr)]">
        <AdminSurface className="space-y-3 p-4" data-testid="admin-ops-security-score">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="m-0 font-heading text-sm text-foreground">{txa('Güvenlik skoru')}</h3>
            <span
              className={cn(
                'text-3xl font-bold tabular-nums',
                score.band === 'iyi' && 'text-emerald-600 dark:text-emerald-400',
                score.band === 'dikkat' && 'text-amber-600 dark:text-amber-400',
                score.band === 'kotu' && 'text-destructive',
              )}
            >
              {score.score}
            </span>
          </div>

          {/* Rakamin altinda HER ZAMAN kirilim, ve her satirda NE YAPILACAGI:
              skor tek basina yon gostermez. Durus bulgusunda cozum metni,
              alarm satirinda alarmlara giden kapi. */}
          {score.lines.length === 0 ? (
            <p className="m-0 text-[11px] leading-4 text-muted-foreground">
              {txa('Acik bulgu yok. Kabul edilmis bulgular puan dusurmez.')}
            </p>
          ) : (
            <ul className="m-0 list-none space-y-2 p-0">
              {score.lines.map((line) => {
                const finding = OPEN_SECURITY_FINDINGS.find((item) => item.label === line.label)
                return (
                  <li key={line.label} className="rounded-lg border border-border bg-card p-2">
                    <div className="flex items-start justify-between gap-2 text-[11px]">
                      <span className="font-semibold text-foreground">{line.label}</span>
                      <span className="shrink-0 tabular-nums text-destructive">-{line.penalty}</span>
                    </div>
                    {finding ? (
                      <p className="m-0 mt-1 text-[10px] leading-4 text-muted-foreground">{finding.action}</p>
                    ) : (
                      <button
                        type="button"
                        className="mt-1 inline-flex items-center gap-0.5 text-[10px] font-semibold text-primary"
                        onClick={() => onOpenTab?.('security')}
                      >
                        {txa('Alarmlari ac')}
                        <ArrowRight className="size-3" aria-hidden="true" />
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}

          <p className="m-0 border-t border-border pt-2 text-[10px] leading-4 text-muted-foreground">
            {txa('Durus bulgulari')}{' '}<strong>{SECURITY_AUDIT_DATE}</strong>{' '}{txa('denetiminden; canli degil. Kabul edilmis bulgular')}{' '}<code>docs/reports/security-accepted-findings.json</code>{' '}{txa('icinde.')}
          </p>
        </AdminSurface>

        <AdminSurface className="space-y-3 p-4" data-testid="admin-ops-activity">
          <div className="flex items-center justify-between gap-2">
            <h3 className="m-0 font-heading text-sm text-foreground">{txa('Son hareketler')}</h3>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="rounded-lg tabular-nums">{activity.length}</Badge>
              <button
                type="button"
                className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-primary"
                onClick={() => onOpenTab?.('audit_logs')}
              >
                {txa('Tumu')}
                <ArrowRight className="size-3" aria-hidden="true" />
              </button>
            </div>
          </div>

          {loading ? (
            <p className="m-0 text-[11px] text-muted-foreground">{txa('Yükleniyor…')}</p>
          ) : activity.length === 0 ? (
            <p className="m-0 text-[11px] text-muted-foreground">{txa('Kayıt yok.')}</p>
          ) : (
            <ul className="m-0 list-none space-y-2 p-0">
              {activity.map((item) => (
                <li key={item.id} className="flex items-start justify-between gap-3 text-[11px]">
                  <span className="min-w-0">
                    <span className="font-semibold text-foreground">{item.action}</span>
                    {item.resourceType ? (
                      <span className="ml-1 text-muted-foreground">· {item.resourceType}</span>
                    ) : null}
                  </span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {formatDateTime(item.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </AdminSurface>
      </div>
    </section>
  )
}

export default AdminOpsStatusSection
