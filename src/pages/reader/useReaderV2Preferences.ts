/**
 * React binding of Reader v2 preferences.
 *
 * Kept thin: rules/validation are in the pure model (readerV2Preferences), here is
 * only state + persistence + cross-tab sync.
 */

import { useCallback, useEffect, useState } from 'react'
import {
  READER_V2_PREFERENCES_STORAGE_KEY,
  mergeReaderV2Preferences,
  readStoredReaderV2Preferences,
  sanitizeReaderV2Preferences,
  writeStoredReaderV2Preferences,
  type ReaderV2Preferences,
} from '@/pages/reader/readerV2Preferences'

export function useReaderV2Preferences() {
  const [preferences, setPreferences] = useState<ReaderV2Preferences>(() => readStoredReaderV2Preferences())

  const updatePreferences = useCallback((patch: Partial<ReaderV2Preferences>) => {
    setPreferences((current) => writeStoredReaderV2Preferences(mergeReaderV2Preferences(current, patch)))
  }, [])

  // If the same user changes a setting in another tab, the reader should not lag behind.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== READER_V2_PREFERENCES_STORAGE_KEY) return
      try {
        setPreferences(sanitizeReaderV2Preferences(event.newValue ? JSON.parse(event.newValue) : null))
      } catch {
        // Bozuk deger geldiyse mevcut tercihlerle devam.
      }
    }
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [])

  return { preferences, updatePreferences }
}
