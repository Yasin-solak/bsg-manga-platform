import { useCallback, useEffect, useRef, useState } from 'react'
import {
  getAdminDashboardSnapshot,
  type AdminDashboardPeriod,
  type AdminDashboardSnapshot,
} from '@/services/adminService'
import { txa } from '@/i18n/activeLocale'

const INITIAL_PERIOD: AdminDashboardPeriod = '30d'

const DASHBOARD_LOAD_ERROR = 'Dashboard metrikleri şu anda yüklenemedi. Lütfen tekrar deneyin.'

export function useAdminDashboardSnapshot(isActive: boolean) {
  const [snapshot, setSnapshot] = useState<AdminDashboardSnapshot | null>(null)
  const [period, setPeriod] = useState<AdminDashboardPeriod>(INITIAL_PERIOD)
  const [isLoading, setIsLoading] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const mountedRef = useRef(false)
  const activeRef = useRef(isActive)
  const periodRef = useRef<AdminDashboardPeriod>(INITIAL_PERIOD)
  const snapshotRef = useRef<AdminDashboardSnapshot | null>(null)
  const requestIdRef = useRef(0)

  useEffect(() => {
    mountedRef.current = true

    return () => {
      mountedRef.current = false
      requestIdRef.current += 1
    }
  }, [])

  useEffect(() => {
    // The ref only tracks committed React state; it is not written during render so a concurrent render
    // does not accidentally invalidate a request result.
    activeRef.current = isActive

    if (!isActive) {
      requestIdRef.current += 1
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [isActive])

  const loadSnapshot = useCallback(async (requestedPeriod: AdminDashboardPeriod) => {
    if (!activeRef.current) return

    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId
    const isInitialLoad = snapshotRef.current === null

    setError(null)
    if (isInitialLoad) {
      setIsLoading(true)
    } else {
      setIsRefreshing(true)
    }

    try {
      const nextSnapshot = await getAdminDashboardSnapshot(requestedPeriod)
      const canApply = mountedRef.current
        && activeRef.current
        && requestIdRef.current === requestId
        && periodRef.current === requestedPeriod

      if (!canApply) return

      snapshotRef.current = nextSnapshot
      setSnapshot(nextSnapshot)
    } catch {
      const canApply = mountedRef.current
        && activeRef.current
        && requestIdRef.current === requestId
        && periodRef.current === requestedPeriod

      if (canApply) setError(txa(DASHBOARD_LOAD_ERROR))
    } finally {
      const canApply = mountedRef.current
        && activeRef.current
        && requestIdRef.current === requestId
        && periodRef.current === requestedPeriod

      if (canApply) {
        setIsLoading(false)
        setIsRefreshing(false)
      }
    }
  }, [])

  useEffect(() => {
    if (!isActive) return

    void loadSnapshot(period)
  }, [isActive, loadSnapshot, period])

  const onPeriodChange = useCallback((nextPeriod: AdminDashboardPeriod) => {
    if (periodRef.current === nextPeriod) return

    requestIdRef.current += 1
    periodRef.current = nextPeriod
    setPeriod(nextPeriod)
  }, [])

  const onRefresh = useCallback(async () => {
    await loadSnapshot(periodRef.current)
  }, [loadSnapshot])

  return {
    snapshot,
    isLoading,
    isRefreshing,
    error,
    period,
    onPeriodChange,
    onRefresh,
  }
}
