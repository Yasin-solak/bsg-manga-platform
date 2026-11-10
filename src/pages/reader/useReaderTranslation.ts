import { useCallback, useEffect, useRef, useState } from 'react'
import {
  getReaderOverlay, READER_LANGUAGES, requestReaderTranslation, type ReaderOverlay,
} from '@/services/translationReaderService'
import { txa } from '@/i18n/activeLocale'

/*
 * Reader language (Translation Studio V3). Turkish is inside chapter images; picking another language
 * shows clean base + that language's text. Missing texts are generated piece by piece;
 * the layer refreshes after each round, ready ones show at once and
 * missing areas temporarily keep the team's Turkish text.
 */

const STORAGE_KEY = 'reader-language:v3'
const supported = new Set<string>(READER_LANGUAGES.map((entry) => entry.code))

function initialLanguage() {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    if (saved && supported.has(saved)) return saved
  } catch {
    // Depolama kapaliysa TR ile devam edilir.
  }
  return 'tr'
}

export type ReaderTranslationStatus = 'idle' | 'unavailable' | 'loading' | 'ready' | 'pending' | 'error'

export function useReaderTranslation(chapterId: string | null | undefined) {
  const [language, setLanguage] = useState(initialLanguage)
  const [available, setAvailable] = useState(false)
  const [overlay, setOverlay] = useState<ReaderOverlay | null>(null)
  const [status, setStatus] = useState<ReaderTranslationStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  const attempted = useRef(new Set<string>())

  const selectLanguage = useCallback((next: string) => {
    if (!supported.has(next)) return
    setLanguage(next)
    try { window.localStorage.setItem(STORAGE_KEY, next) } catch { /* Okuma yine calisir. */ }
  }, [])

  const retry = useCallback(() => {
    if (chapterId) attempted.current.delete(`${chapterId}:${language}`)
    setError(null)
    setRevision((value) => value + 1)
  }, [chapterId, language])

  // Does the chapter have a V3 publication? (the language picker shows only then)
  useEffect(() => {
    setAvailable(false)
    if (!chapterId) return undefined
    const controller = new AbortController()
    getReaderOverlay(chapterId, 'tr', controller.signal)
      .then((result) => { if (!controller.signal.aborted) setAvailable(Boolean(result)) })
      .catch(() => { if (!controller.signal.aborted) setAvailable(false) })
    return () => controller.abort()
  }, [chapterId])

  useEffect(() => {
    setOverlay(null)
    setError(null)
    if (!chapterId || !available) { setStatus(available ? 'idle' : 'unavailable'); return undefined }
    if (language === 'tr') { setStatus('ready'); return undefined }
    const controller = new AbortController()
    setStatus('loading')
    void (async () => {
      try {
        let current = await getReaderOverlay(chapterId, language, controller.signal)
        if (controller.signal.aborted) return
        if (!current) { setStatus('unavailable'); return }
        setOverlay(current)
        const key = `${chapterId}:${language}`
        if (current.missing_count === 0 || attempted.current.has(key)) {
          setStatus(current.missing_count === 0 ? 'ready' : 'pending')
          return
        }
        attempted.current.add(key)
        setStatus('pending')
        for (let round = 0; round < 25 && current && current.missing_count > 0; round += 1) {
          const result = await requestReaderTranslation(chapterId, language, controller.signal)
          if (controller.signal.aborted) return
          current = await getReaderOverlay(chapterId, language, controller.signal)
          if (controller.signal.aborted || !current) return
          setOverlay(current)
          if (!result.translated) break
        }
        setStatus(current && current.missing_count === 0 ? 'ready' : 'pending')
      } catch (reason) {
        if (controller.signal.aborted) return
        setError(reason instanceof Error ? reason.message : txa('Çeviri hazırlanamadı.'))
        setStatus('error')
      }
    })()
    return () => controller.abort()
  }, [available, chapterId, language, revision])

  const showOverlay = available && language !== 'tr' && overlay !== null && overlay.language === language
  return { language, selectLanguage, available, overlay: showOverlay ? overlay : null, status, error, retry }
}

export type ReaderTranslationState = ReturnType<typeof useReaderTranslation>
