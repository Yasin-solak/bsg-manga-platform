import { useCallback, useEffect, useState } from 'react'

import {
  READER_PREFERENCES_STORAGE_KEY,
  mergeReaderPreferences,
  readStoredReaderPreferences,
  writeStoredReaderPreferences,
  type ReaderPreferences,
} from '@/services/readerPreferencesService'

export function useReaderPreferences() {
  const [preferences, setPreferences] = useState<ReaderPreferences>(() => readStoredReaderPreferences())

  const updatePreferences = useCallback((patch: Partial<ReaderPreferences>) => {
    setPreferences((current) => {
      const next = mergeReaderPreferences(current, patch)
      return writeStoredReaderPreferences(next)
    })
  }, [])

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key && event.key !== READER_PREFERENCES_STORAGE_KEY) return
      setPreferences(readStoredReaderPreferences())
    }

    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [])

  return {
    preferences,
    updatePreferences,
  }
}
