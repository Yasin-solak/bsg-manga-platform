import type { MetricType } from 'web-vitals'

export type PerformanceSample = { key: string; code: 'lcp' | 'inp' | 'cls' | 'fcp' | 'ttfb'; value: number }
let booted = false, retired = false
let receiver: ((sample: PerformanceSample) => void) | null = null
export function cleanPerformanceMetric(metric: Pick<MetricType, 'name' | 'value' | 'id'>): PerformanceSample | null {
  const code = metric.name.toLowerCase()
  if (!['lcp', 'inp', 'cls', 'fcp', 'ttfb'].includes(code) || !Number.isFinite(metric.value) || metric.value < 0) return null
  return { key: metric.id, code: code as PerformanceSample['code'], value: code === 'cls' ? Math.min(10, Math.round(metric.value * 1000) / 1000) : Math.min(120000, Math.round(metric.value / 10) * 10) }
}
export function startPerformanceMeasurements(callback: (sample: PerformanceSample) => void) {
  if (retired) return () => {}
  receiver = callback
  if (!booted) {
    booted = true
    void import('web-vitals').then(({ onLCP, onINP, onCLS, onFCP, onTTFB }) => {
      if (!receiver || retired) return
      const report = (metric: MetricType) => { const sample = cleanPerformanceMetric(metric); if (sample) receiver?.(sample) }
      const options = { reportAllChanges: true, reportSoftNavs: false }
      onLCP(report, options); onINP(report, options); onCLS(report, options); onFCP(report, options); onTTFB(report, options)
    }).catch(() => { booted = false })
  }
  // The library's document-lifetime observers do not reconnect. After permission is withdrawn
  // we take no more measurements from this document; the unpermitted period stays out of the report.
  return () => { receiver = null; retired = true }
}
