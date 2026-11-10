import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { intlLocale, txa } from '@/i18n/activeLocale'

/**
 * StudioCharts: dependency-free, light SVG chart primitives for the Fansub Studio.
 *
 * Why our own primitives: the project has no chart library and studio surfaces
 * want dense data display. These use app theme tokens (chart-1..5,
 * primary, muted), support light/dark and work with real data.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Yatay bar listesi (ornek: manga performansi)
// ─────────────────────────────────────────────────────────────────────────────
export type StudioBarItem = {
  id: string
  label: string
  value: number
  /** Secondary label written on the right (e.g. "12 chapters"). */
  sub?: string
  /** Bar dolgu rengi sinifi (orn. "bg-chart-1"). */
  colorClass?: string
}

export function StudioBarList({
  items,
  valueFormatter,
  emptyLabel = txa('Veri yok.'),
  className,
}: {
  items: StudioBarItem[]
  valueFormatter?: (value: number) => string
  emptyLabel?: string
  className?: string
}) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>
  }

  const max = Math.max(1, ...items.map((item) => item.value))
  const fmt = valueFormatter ?? ((value: number) => value.toLocaleString(intlLocale()))

  return (
    <div className={cn('space-y-3', className)}>
      {items.map((item) => (
        <div key={item.id}>
          <div className="mb-1 flex items-center justify-between gap-3 text-xs">
            <span className="truncate text-foreground">{item.label}</span>
            <span className="shrink-0 font-medium tabular-nums text-muted-foreground">
              {fmt(item.value)}
              {item.sub ? <span className="text-muted-foreground/70"> · {item.sub}</span> : null}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted/40">
            <div
              className={cn('h-full rounded-full', item.colorClass || 'bg-primary')}
              style={{ width: `${Math.max(3, Math.round((item.value / max) * 100))}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Donut (e.g. status distribution)
// ─────────────────────────────────────────────────────────────────────────────
export type StudioDonutSegment = {
  label: string
  value: number
  /** stroke rengi sinifi (orn. "text-chart-2"). */
  colorClass: string
}

export function StudioDonut({
  segments,
  size = 128,
  thickness = 14,
  centerValue,
  centerLabel,
}: {
  segments: StudioDonutSegment[]
  size?: number
  thickness?: number
  centerValue?: ReactNode
  centerLabel?: string
}) {
  const total = Math.max(0, segments.reduce((sum, seg) => sum + Math.max(0, seg.value), 0))
  const radius = (size - thickness) / 2
  const circumference = 2 * Math.PI * radius
  let offset = 0

  return (
    <div className="flex flex-wrap items-center gap-5">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              strokeWidth={thickness}
              className="stroke-muted/40"
            />
            {total > 0
              ? segments.map((seg) => {
                  const fraction = Math.max(0, seg.value) / total
                  const dash = fraction * circumference
                  const node = (
                    <circle
                      key={seg.label}
                      cx={size / 2}
                      cy={size / 2}
                      r={radius}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={thickness}
                      className={seg.colorClass}
                      strokeDasharray={`${dash} ${circumference - dash}`}
                      strokeDashoffset={-offset}
                    />
                  )
                  offset += dash
                  return node
                })
              : null}
          </g>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          {centerValue != null ? (
            <span className="text-xl font-semibold tabular-nums text-foreground">{centerValue}</span>
          ) : null}
          {centerLabel ? <span className="text-[11px] text-muted-foreground">{centerLabel}</span> : null}
        </div>
      </div>

      <div className="min-w-0 flex-1 space-y-1.5">
        {segments.map((seg) => (
          <div key={seg.label} className="flex items-center justify-between gap-3 text-xs">
            <span className="inline-flex min-w-0 items-center gap-2">
              <span className={cn('size-2.5 shrink-0 rounded-full bg-current', seg.colorClass)} />
              <span className="truncate text-muted-foreground">{seg.label}</span>
            </span>
            <span className="shrink-0 font-medium tabular-nums text-foreground">
              {seg.value.toLocaleString(intlLocale())}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Alan / sparkline grafigi (zaman serisi)
// ─────────────────────────────────────────────────────────────────────────────
export function StudioAreaChart({
  data,
  height = 72,
  colorClass = 'text-primary',
  className,
}: {
  data: number[]
  height?: number
  colorClass?: string
  className?: string
}) {
  if (data.length < 2) {
    return (
      <div
        className={cn('flex items-center justify-center rounded-lg bg-muted/20 text-[11px] text-muted-foreground', className)}
        style={{ height }}
      >
        {txa('Yeterli veri yok')}
      </div>
    )
  }

  const width = 100
  const max = Math.max(...data)
  const min = Math.min(...data)
  const range = max - min || 1
  const points = data.map((value, index) => {
    const x = (index / (data.length - 1)) * width
    const y = height - ((value - min) / range) * (height - 8) - 4
    return [x, y] as const
  })
  const line = points.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ')
  const area = `0,${height} ${line} ${width},${height}`

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={cn('w-full', colorClass, className)}
      style={{ height }}
      aria-hidden="true"
    >
      <polygon points={area} fill="currentColor" opacity={0.12} />
      <polyline
        points={line}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Metrik karti (deger + opsiyonel yardimci + opsiyonel sparkline)
// ─────────────────────────────────────────────────────────────────────────────
export function StudioMetricCard({
  label,
  value,
  helper,
  icon,
  series,
  seriesColorClass = 'text-primary',
}: {
  label: string
  value: ReactNode
  helper?: ReactNode
  icon?: ReactNode
  series?: number[]
  seriesColorClass?: string
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-muted/20 px-4 py-3">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <p className="text-[11px] font-medium uppercase tracking-wide">{label}</p>
      </div>
      <p className="mt-1.5 text-2xl font-semibold tabular-nums text-foreground">{value}</p>
      {helper ? <div className="mt-0.5 text-[11px] text-muted-foreground">{helper}</div> : null}
      {series && series.length >= 2 ? (
        <div className="mt-2">
          <StudioAreaChart data={series} height={32} colorClass={seriesColorClass} />
        </div>
      ) : null}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Daily bar chart: with sparse daily counts (most days 0) an area chart draws sharp
// triangles; bars show each day separately and readably.
// ─────────────────────────────────────────────────────────────────────────────
export function StudioDailyBars({
  data,
  labels,
  height = 120,
  barClassName = 'bg-primary',
  valueFormatter,
  className,
}: {
  data: number[]
  /** Her cubugun ipucu etiketi (orn. "12 Eki"). */
  labels?: string[]
  height?: number
  barClassName?: string
  valueFormatter?: (value: number) => string
  className?: string
}) {
  const max = Math.max(1, ...data)
  const fmt = valueFormatter ?? ((value: number) => value.toLocaleString(intlLocale()))
  return (
    <div className={cn('flex items-end gap-[3px]', className)} style={{ height }} role="img" aria-label={txa('Günlük dağılım')}>
      {data.map((value, index) => (
        <span
          key={index}
          title={`${labels?.[index] ? `${labels[index]}: ` : ''}${fmt(value)}`}
          className={cn('min-w-0 flex-1 rounded-t-[3px] transition-opacity hover:opacity-80', value > 0 ? barClassName : 'bg-foreground/[0.06]')}
          style={{ height: value > 0 ? `${Math.max(4, (value / max) * 100)}%` : 2 }}
        />
      ))}
    </div>
  )
}
