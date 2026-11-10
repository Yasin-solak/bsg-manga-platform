import { useId, useMemo, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { cn } from '@/lib/utils'
import { formatMetricValue, formatNumberTr } from './dashboardFormatters'
import type { DashboardChartSeries, DashboardMetricView } from './dashboardTypes'
import { txa } from '@/i18n/activeLocale'

const WIDTH = 640
const HEIGHT = 184
const PADDING = { top: 18, right: 16, bottom: 34, left: 46 }
const PLOT_WIDTH = WIDTH - PADDING.left - PADDING.right
const PLOT_HEIGHT = HEIGHT - PADDING.top - PADDING.bottom

function seriesClass(tone: DashboardChartSeries['tone']) {
  if (tone === 'secondary') return 'text-chart-2'
  if (tone === 'muted') return 'text-muted-foreground'
  return 'text-primary'
}

function niceMaximum(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 10
  const magnitude = 10 ** Math.floor(Math.log10(value))
  return Math.ceil(value / magnitude) * magnitude
}

function pointValue(series: DashboardChartSeries, index: number) {
  return series.points[index]?.value ?? null
}

interface DashboardTrendChartProps {
  title: string
  series: DashboardChartSeries[]
  format: DashboardMetricView['format']
}

export function DashboardTrendChart({ title, series, format }: DashboardTrendChartProps) {
  const descriptionId = useId()
  const tableId = useId()
  const [visibleIds, setVisibleIds] = useState(() => new Set(series.map((item) => item.id)))
  const [requestedIndex, setRequestedIndex] = useState(() => (
    Math.max(0, ...series.map((item) => item.points.length - 1))
  ))

  const visibleSeries = useMemo(
    () => series.filter((item) => visibleIds.has(item.id)),
    [series, visibleIds],
  )
  const pointCount = Math.max(0, ...visibleSeries.map((item) => item.points.length))
  const activeIndex = pointCount === 0 ? 0 : Math.min(requestedIndex, pointCount - 1)
  const allValues = visibleSeries.flatMap((item) => item.points.map((point) => point.value))
  const yMaximum = format === 'score' || format === 'percent'
    ? 100
    : niceMaximum(Math.max(0, ...allValues))

  const xFor = (index: number) => (
    pointCount <= 1
      ? PADDING.left + (PLOT_WIDTH / 2)
      : PADDING.left + ((index / (pointCount - 1)) * PLOT_WIDTH)
  )
  const yFor = (value: number) => (
    PADDING.top + PLOT_HEIGHT - ((Math.max(0, Math.min(yMaximum, value)) / yMaximum) * PLOT_HEIGHT)
  )

  const axisSource = visibleSeries.reduce<DashboardChartSeries | null>((longest, item) => (
    !longest || item.points.length > longest.points.length ? item : longest
  ), null)
  const labelStep = pointCount <= 7 ? 1 : Math.ceil((pointCount - 1) / 6)
  const labelIndices = Array.from({ length: pointCount }, (_, index) => index)
    .filter((index) => index % labelStep === 0 || index === pointCount - 1)

  const activeLabel = axisSource?.points[activeIndex]?.label || txa('Nokta {v1}', { v1: activeIndex + 1 })
  const activeSummary = visibleSeries
    .map((item) => {
      const value = pointValue(item, activeIndex)
      return value == null ? null : `${item.label}: ${formatMetricValue(value, format)}`
    })
    .filter(Boolean)
    .join(', ')

  function toggleSeries(id: string) {
    setVisibleIds((current) => {
      if (current.has(id) && current.size === 1) return current
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (pointCount <= 1) return
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      setRequestedIndex((current) => Math.max(0, Math.min(current, pointCount - 1) - 1))
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      setRequestedIndex((current) => Math.min(pointCount - 1, Math.min(current, pointCount - 1) + 1))
    } else if (event.key === 'Home') {
      event.preventDefault()
      setRequestedIndex(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      setRequestedIndex(pointCount - 1)
    }
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (pointCount <= 1) return
    const bounds = event.currentTarget.getBoundingClientRect()
    const plotStart = bounds.left + ((PADDING.left / WIDTH) * bounds.width)
    const plotWidth = (PLOT_WIDTH / WIDTH) * bounds.width
    const ratio = Math.max(0, Math.min(1, (event.clientX - plotStart) / plotWidth))
    setRequestedIndex(Math.round(ratio * (pointCount - 1)))
  }

  if (series.length === 0 || pointCount === 0) {
    return (
      <div
        className="flex h-[184px] items-center justify-center rounded-lg border border-dashed border-border bg-muted/15 px-6 text-center"
        data-testid="dashboard-trend-chart"
      >
        <div>
          <p className="text-sm font-medium text-foreground">{txa('Dönemsel seri henüz hazır değil')}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {txa('Metrik değeri gösteriliyor; grafik için tarihsel veri bekleniyor.')}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div
        className="rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
        tabIndex={0}
        role="group"
        aria-label={txa('{v1} grafiği. Veri noktaları arasında sol ve sağ ok tuşlarıyla gezinin.', { v1: title })}
        aria-describedby={`${descriptionId} ${tableId}`}
        onKeyDown={handleKeyDown}
        data-testid="dashboard-trend-chart"
      >
        <p id={descriptionId} className="sr-only">
          {txa('{v1} zaman noktası ve {v2} görünür seri bulunuyor.', { v1: pointCount, v2: visibleSeries.length })}
        </p>

        <div className="relative" onPointerMove={handlePointerMove}>
          <div className="pointer-events-none absolute right-2 top-1 z-10 rounded-md border border-border bg-background/95 px-2.5 py-1.5 shadow-sm backdrop-blur-sm">
            <p className="text-[10px] font-medium text-foreground">{activeLabel}</p>
            <p className="mt-0.5 max-w-[220px] truncate text-[9px] text-muted-foreground">{activeSummary}</p>
          </div>

          <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-[184px] w-full" aria-hidden="true">
            {[0, 0.5, 1].map((ratio) => {
              const value = yMaximum * (1 - ratio)
              const y = PADDING.top + (PLOT_HEIGHT * ratio)
              return (
                <g key={ratio}>
                  <line
                    x1={PADDING.left}
                    x2={WIDTH - PADDING.right}
                    y1={y}
                    y2={y}
                    className="stroke-border"
                    strokeDasharray={ratio === 1 ? undefined : '3 4'}
                  />
                  <text x={PADDING.left - 8} y={y + 3} textAnchor="end" className="fill-muted-foreground text-[9px]">
                    {format === 'score' || format === 'percent' ? Math.round(value) : formatNumberTr(value)}
                  </text>
                </g>
              )
            })}

            {visibleSeries.map((item, seriesIndex) => {
              const points = item.points.map((point, index) => `${xFor(index)},${yFor(point.value)}`).join(' ')
              const area = seriesIndex === 0 && item.points.length > 1
                ? `${xFor(0)},${PADDING.top + PLOT_HEIGHT} ${points} ${xFor(item.points.length - 1)},${PADDING.top + PLOT_HEIGHT}`
                : null
              return (
                <g key={item.id} className={seriesClass(item.tone)}>
                  {area ? <polygon points={area} fill="currentColor" opacity="0.1" /> : null}
                  <polyline
                    points={points}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={seriesIndex === 0 ? 2.25 : 1.7}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                    className="transition-opacity duration-200 motion-reduce:transition-none"
                  />
                  {item.points[activeIndex] ? (
                    <circle
                      cx={xFor(activeIndex)}
                      cy={yFor(item.points[activeIndex].value)}
                      r={seriesIndex === 0 ? 4 : 3.25}
                      fill="currentColor"
                      className="stroke-card"
                      strokeWidth="2"
                      vectorEffect="non-scaling-stroke"
                    />
                  ) : null}
                </g>
              )
            })}

            <line
              x1={xFor(activeIndex)}
              x2={xFor(activeIndex)}
              y1={PADDING.top}
              y2={PADDING.top + PLOT_HEIGHT}
              className="stroke-primary/30"
              strokeDasharray="3 4"
            />

            {labelIndices.map((index) => (
              <text
                key={index}
                x={xFor(index)}
                y={HEIGHT - 10}
                textAnchor={index === 0 ? 'start' : index === pointCount - 1 ? 'end' : 'middle'}
                className="fill-muted-foreground text-[9px]"
              >
                {axisSource?.points[index]?.label || ''}
              </text>
            ))}
          </svg>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap justify-center gap-4" aria-label={txa('Grafik serileri')}>
        {series.map((item) => {
          const visible = visibleIds.has(item.id)
          return (
            <button
              key={item.id}
              type="button"
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                visible ? 'text-foreground' : 'text-muted-foreground opacity-55',
              )}
              aria-pressed={visible}
              data-testid={`dashboard-chart-series-${item.id}`}
              onClick={() => toggleSeries(item.id)}
            >
              <span className={cn('h-0.5 w-3 rounded-full bg-current', seriesClass(item.tone))} aria-hidden="true" />
              {item.label}
            </button>
          )
        })}
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {activeLabel}. {activeSummary}
      </p>

      {/* sr-only TABLONUN kendisine verilmez: tablo height:1px'i yok sayar, 30 satirlik
          gizli tablo sayfayi ~700px uzatip yapiskan admin kenar cubugunu yukari itiyordu. */}
      <div className="sr-only">
      <table id={tableId}>
        <caption>{txa('{v1} erişilebilir veri tablosu', { v1: title })}</caption>
        <thead>
          <tr>
            <th>{txa('Tarih')}</th>
            {visibleSeries.map((item) => <th key={item.id}>{item.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: pointCount }, (_, index) => (
            <tr key={index}>
              <th>{axisSource?.points[index]?.label || txa('Nokta {v1}', { v1: index + 1 })}</th>
              {visibleSeries.map((item) => (
                <td key={item.id}>
                  {pointValue(item, index) == null ? txa('Veri yok') : formatMetricValue(pointValue(item, index) as number, format)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  )
}
