import { useCallback, useEffect, useRef, useState } from 'react'
import { txa } from '@/i18n/activeLocale'

/** Simple data loader: reloads when the key changes; reload refreshes without clearing data. */
export function useShopQuery<T>(key: string | null, loader: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(Boolean(key))
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const loaderRef = useRef(loader)
  loaderRef.current = loader

  useEffect(() => {
    if (!key) {
      setLoading(false)
      return undefined
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    loaderRef.current()
      .then((value) => { if (!cancelled) setData(value) })
      .catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : txa('Yüklenemedi.')) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [key, tick])

  const reload = useCallback(() => setTick((value) => value + 1), [])
  return { data, loading, error, reload, setData }
}
