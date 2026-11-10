import {
  CheckCircle2,
  Clock3,
  MinusCircle,
  ShieldAlert,
  Siren,
} from 'lucide-react'
import type { Report, ReportStatus } from '@/services/reportService'
import { StudioAreaChart } from '@/components/fansub/StudioCharts'
import { cn } from '@/lib/utils'
import {
  buildStatusSparkline,
  type ReportManagementStats,
  type ReportRiskLevel,
} from './reportManagementModel'
import { intlLocale, txa } from '@/i18n/activeLocale'

interface ReportStatCardsProps {
  reports: Report[]
  stats: ReportManagementStats
  activeStatus: 'all' | ReportStatus
  activeRisk: 'all' | ReportRiskLevel
  onStatusChange: (status: 'all' | ReportStatus) => void
  onRiskChange: (risk: 'all' | ReportRiskLevel) => void
}

const CARD_TONES = {
  all: {
    icon: Siren,
    iconClass: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-300',
    chartClass: 'text-indigo-500',
  },
  pending: {
    icon: Clock3,
    iconClass: 'bg-primary/10 text-primary',
    chartClass: 'text-primary',
  },
  resolved: {
    icon: CheckCircle2,
    iconClass: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300',
    chartClass: 'text-emerald-500',
  },
  dismissed: {
    icon: MinusCircle,
    iconClass: 'bg-slate-500/10 text-slate-600 dark:text-slate-300',
    chartClass: 'text-slate-500',
  },
  high: {
    icon: ShieldAlert,
    iconClass: 'bg-red-500/10 text-red-600 dark:text-red-300',
    chartClass: 'text-red-500',
  },
} as const

export function ReportStatCards({
  reports,
  stats,
  activeStatus,
  activeRisk,
  onStatusChange,
  onRiskChange,
}: ReportStatCardsProps) {
  const cards = [
    {
      id: 'all',
      label: txa('Tümü'),
      value: stats.total,
      helper: txa('Tüm zamanlar'),
      series: buildStatusSparkline(reports),
      active: activeStatus === 'all' && activeRisk === 'all',
      onClick: () => {
        onStatusChange('all')
        onRiskChange('all')
      },
    },
    {
      id: 'pending',
      label: txa('Beklemede'),
      value: stats.pending,
      helper: txa('İncelemeyi bekliyor'),
      series: buildStatusSparkline(reports, 'pending'),
      active: activeStatus === 'pending' && activeRisk === 'all',
      onClick: () => {
        onStatusChange('pending')
        onRiskChange('all')
      },
    },
    {
      id: 'resolved',
      label: txa('Çözüldü'),
      value: stats.resolved,
      helper: txa('Tamamlandı'),
      series: buildStatusSparkline(reports, 'resolved'),
      active: activeStatus === 'resolved' && activeRisk === 'all',
      onClick: () => {
        onStatusChange('resolved')
        onRiskChange('all')
      },
    },
    {
      id: 'dismissed',
      label: txa('Yoksayıldı'),
      value: stats.dismissed,
      helper: txa('Rapor dışı bırakıldı'),
      series: buildStatusSparkline(reports, 'dismissed'),
      active: activeStatus === 'dismissed' && activeRisk === 'all',
      onClick: () => {
        onStatusChange('dismissed')
        onRiskChange('all')
      },
    },
    {
      id: 'high',
      label: txa('Yüksek risk'),
      value: stats.highRisk,
      helper: txa('Öncelikli inceleme'),
      series: buildStatusSparkline(reports, undefined, 'high'),
      active: activeRisk === 'high',
      onClick: () => {
        onStatusChange('all')
        onRiskChange('high')
      },
    },
  ] as const

  // Tek kart icinde serit (bes iri kart yerine); hucre tiklaninca filtre uygulanir.
  return (
    <section className="overflow-hidden rounded-[20px] border border-border/70 bg-card/60" aria-label={txa('Rapor özetleri')}>
      <div className="-mb-px -mr-px grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 [&>*]:border-b [&>*]:border-r [&>*]:border-border/60">
        {cards.map((card) => {
          const tone = CARD_TONES[card.id]
          const Icon = tone.icon
          return (
            <button
              key={card.id}
              type="button"
              className={cn(
                'relative flex min-w-0 items-center gap-3 px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                card.active ? 'bg-primary/[0.07]' : 'hover:bg-muted/40',
              )}
              aria-pressed={card.active}
              onClick={card.onClick}
            >
              <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-xl', tone.iconClass)}>
                <Icon className="size-[18px]" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[11.5px] font-semibold text-muted-foreground">{card.label}</span>
                <span className="block text-[20px] font-black leading-tight tabular-nums text-foreground">{card.value.toLocaleString(intlLocale())}</span>
                <span className="block truncate text-[11px] text-muted-foreground">{card.helper}</span>
              </span>
              <StudioAreaChart data={card.series} height={26} colorClass={tone.chartClass} className="hidden w-[64px] shrink-0 2xl:block" />
              <span
                className={cn('pointer-events-none absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-primary transition-transform', card.active ? 'scale-x-100' : 'scale-x-0')}
                aria-hidden="true"
              />
            </button>
          )
        })}
      </div>
    </section>
  )
}
