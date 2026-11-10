import { Progress } from '@/components/ui/progress'
import {
  trustBandLabel,
  trustConfidenceLabel,
  type AdminUserTrustView,
} from './adminUsersUtils'
import { AdminUserTrustBreakdown } from './AdminUserTrustBreakdown'
import { txa } from '@/i18n/activeLocale'

interface AdminUserTrustDetailCardProps {
  trust: AdminUserTrustView
}

export function AdminUserTrustDetailCard({ trust }: AdminUserTrustDetailCardProps) {
  const lowConfidence = trust.confidence === 'low'

  return (
    <section
      className="h-full rounded-xl border border-border bg-card p-4 shadow-sm"
      aria-labelledby="detailed-user-trust-title"
      data-testid="admin-user-detail-trust"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 id="detailed-user-trust-title" className="text-sm font-semibold text-foreground">{txa('Güven Skoru')}</h4>
          <p className="mt-1 text-xs text-muted-foreground">
            {lowConfidence ? txa('Yeni hesap veya sinyal sayısı yetersiz.') : trustBandLabel(trust.band)}
          </p>
        </div>
        <strong className="shrink-0 text-xl tabular-nums text-foreground">
          {trust.score ?? '—'} / 100
        </strong>
      </div>
      <Progress
        value={trust.score ?? 0}
        className="mt-3 h-2"
        aria-label={txa('Güven skoru {v1}', { v1: trust.score ?? 0 })}
      />
      <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{txa('Güven: {v1}', { v1: trustBandLabel(trust.band) })}</span>
        <span>{txa('Kanıt: {v1}', { v1: trustConfidenceLabel(trust.confidence) })}</span>
      </div>
      <AdminUserTrustBreakdown trust={trust} />
    </section>
  )
}
