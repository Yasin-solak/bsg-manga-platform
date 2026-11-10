import { useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { collectTechnicalReport, routeCategory, type DiagnosticCode } from '@/services/diagnosticsTypes'
import { readDiagnosticConsent, diagnosticCollectionEnabled, sendDiagnosticEvent, sendDiagnosticMetric } from '@/services/diagnosticsService'
import { startPerformanceMeasurements, type PerformanceSample } from '@/services/diagnosticPerformance'
import { setDiagnosticListener } from '@/services/diagnosticSignal'

export function DiagnosticsRuntime() {
  const { currentUser } = useAuth()
  const userId = currentUser?.id
  useEffect(() => {
    if (!userId) return
    let disposed = false, generation = 0, stop: (() => void) | undefined
    const session = crypto.randomUUID(), seen = new Set<string>(), sampled = Math.random() < 0.1
    let count = 0, minute: number[] = []
    const halt = () => { generation++; stop?.(); stop = undefined }
    const refresh = async () => {
      const check = ++generation
      let allowed = false
      try { allowed = await readDiagnosticConsent() && await diagnosticCollectionEnabled() } catch { /* İzin doğrulanamazsa toplama durur. */ }
      if (disposed || check !== generation) return
      if (!allowed) { halt(); return }
      if (stop) return
      let stopped = false
      const metrics = new Map<string, { id: string; sample: PerformanceSample; dirty: boolean }>()
      const pageRoute = routeCategory(location.pathname)
      const emit = (code: DiagnosticCode, duration: number | null = null) => {
        if (stopped || disposed || !navigator.onLine || count >= 50) return
        const route = routeCategory(location.pathname), key = `${code}:${route}`, now = Date.now()
        minute = minute.filter(t => now - t < 60000)
        if (seen.has(key) || minute.length >= 10) return
        seen.add(key); minute.push(now); count++
        void sendDiagnosticEvent({ id: crypto.randomUUID(), session_id: session, code, route, duration_ms: duration, technical: collectTechnicalReport() }).catch(() => {})
      }
      const flushMetrics = () => {
        if (stopped || disposed || !navigator.onLine) return
        for (const row of metrics.values()) {
          if (!row.dirty) continue
          row.dirty = false
          void sendDiagnosticMetric(row.id, session, row.sample, pageRoute, collectTechnicalReport()).catch(() => {})
        }
      }
      const onError = (e: Event) => emit(e.target instanceof HTMLImageElement || e.target instanceof HTMLVideoElement ? 'media_error' : 'ui_error')
      const onPromise = () => emit('promise_error')
      window.addEventListener('error', onError, true); window.addEventListener('unhandledrejection', onPromise)
      setDiagnosticListener(code => emit(code))
      const stopPerformance = sampled ? startPerformanceMeasurements(sample => {
        if (stopped || disposed) return
        const key = `${sample.key}:${sample.code}`, existing = metrics.get(key)
        if (!existing && metrics.size >= 15) return
        metrics.set(key, { id: existing?.id || crypto.randomUUID(), sample, dirty: true })
      }) : undefined
      const metricTimer = window.setInterval(flushMetrics, 30000)
      const onHidden = () => { if (document.visibilityState === 'hidden') flushMetrics() }
      document.addEventListener('visibilitychange', onHidden)
      stop = () => { stopped = true; stopPerformance?.(); metrics.clear(); window.clearInterval(metricTimer); document.removeEventListener('visibilitychange', onHidden); window.removeEventListener('error', onError, true); window.removeEventListener('unhandledrejection', onPromise); setDiagnosticListener(null) }
    }
    void refresh()
    const timer = window.setInterval(() => void refresh(), 60000)
    const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('bsg-diagnostics-preference') : null
    if (channel) channel.onmessage = () => { halt(); void refresh() }
    window.addEventListener('diagnostics-stop', halt); window.addEventListener('diagnostics-preference', refresh); window.addEventListener('focus', refresh)
    return () => { disposed = true; halt(); window.clearInterval(timer); channel?.close(); window.removeEventListener('diagnostics-stop', halt); window.removeEventListener('diagnostics-preference', refresh); window.removeEventListener('focus', refresh) }
  }, [userId])
  return null
}
