import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  FileWarning,
  History,
  ShieldCheck,
  UserRoundCog,
} from 'lucide-react'
import { AdminSurface } from '@/components/admin/shared/AdminSurface'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { listAdminFansubAuditEvents, type AdminFansubAuditEvent } from '@/services/adminService'
import { dateTimeText, errText } from './fansubManagementUtils'
import { intlLocale, txa } from '@/i18n/activeLocale'

interface AdminFansubModerationTabProps {
  fansubId: string
  pendingReviewCount: number
  refreshKey?: number
}

export function AdminFansubModerationTab({
  fansubId,
  pendingReviewCount,
  refreshKey = 0,
}: AdminFansubModerationTabProps) {
  const [events, setEvents] = useState<AdminFansubAuditEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadEvents = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setEvents(await listAdminFansubAuditEvents(fansubId, 30))
    } catch (loadError) {
      setEvents([])
      setError(errText(loadError, txa('Moderasyon geçmişi yüklenemedi.')))
    } finally {
      setLoading(false)
    }
  }, [fansubId])

  useEffect(() => {
    void loadEvents()
  }, [loadEvents, refreshKey])

  const summary = useMemo(() => {
    const membership = events.filter((event) => event.action.includes('member')).length
    const admin = events.filter((event) => !event.action.includes('member')).length
    return { membership, admin }
  }, [events])

  return (
    <div className="grid gap-3 xl:grid-cols-[16rem_minmax(0,1fr)]" data-testid="admin-fansub-moderation-tab">
      <div className="space-y-3">
        <AdminSurface className="p-4">
          <h3 className="text-sm font-semibold text-foreground">{txa('Moderasyon Özeti')}</h3>
          <div className="mt-3 grid gap-2">
            <SummaryRow icon={FileWarning} label={txa('Açık inceleme')} value={pendingReviewCount} />
            <SummaryRow icon={UserRoundCog} label={txa('Üyelik işlemi')} value={summary.membership} />
            <SummaryRow icon={History} label={txa('Diğer yönetim işlemi')} value={summary.admin} />
          </div>
        </AdminSurface>

        <AdminSurface className="border-primary/25 bg-primary/[0.04] p-4">
          <div className="flex items-center gap-2 text-primary">
            <ShieldCheck className="size-4" aria-hidden="true" />
            <h3 className="text-sm font-semibold">{txa('Mevcut risk durumu')}</h3>
          </div>
          <strong className="mt-4 block text-lg text-foreground">
            {pendingReviewCount > 0 ? txa('{v1} açık inceleme', { v1: pendingReviewCount }) : txa('Aktif inceleme yok')}
          </strong>
        </AdminSurface>
      </div>

      <AdminSurface className="overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">{txa('Denetlenebilir Olay Akışı')}</h3>
            <p className="text-xs text-muted-foreground">{txa('Aktör ve zaman bilgileri sunucu kayıtlarından gelir.')}</p>
          </div>
          <Button type="button" variant="outline" className="min-h-10" disabled={loading} onClick={() => void loadEvents()}>
            {txa('Yenile')}
          </Button>
        </div>

        {loading ? (
          <p className="px-4 py-12 text-center text-sm text-muted-foreground">{txa('Moderasyon geçmişi yükleniyor...')}</p>
        ) : error ? (
          <div className="flex flex-col items-center px-4 py-12 text-center">
            <AlertCircle className="size-6 text-destructive" aria-hidden="true" />
            <p className="mt-2 text-sm text-muted-foreground">{error}</p>
          </div>
        ) : events.length === 0 ? (
          <p className="px-4 py-12 text-center text-sm text-muted-foreground">{txa('Kayıtlı yönetim olayı bulunmuyor.')}</p>
        ) : (
          <div className="divide-y divide-border p-3">
            {events.map((event) => (
              <article key={event.id} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <CheckCircle2 className="size-4" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h4 className="text-sm font-semibold text-foreground">{event.summary}</h4>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {txa('Aktör:')} {event.actor ? `@${event.actor.username}` : txa('Sistem')}
                      </p>
                    </div>
                    <Badge variant="outline" className="shrink-0">{event.resourceType || 'fansub'}</Badge>
                  </div>
                  <time className="mt-2 block text-[11px] text-muted-foreground">{dateTimeText(event.createdAt)}</time>
                </div>
              </article>
            ))}
          </div>
        )}
      </AdminSurface>
    </div>
  )
}

function SummaryRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof History
  label: string
  value: number
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-muted/20 px-3 py-3">
      <span className="inline-flex items-center gap-2 text-xs text-muted-foreground"><Icon className="size-4 text-primary" aria-hidden="true" /> {label}</span>
      <strong className="tabular-nums text-foreground">{value.toLocaleString(intlLocale())}</strong>
    </div>
  )
}
