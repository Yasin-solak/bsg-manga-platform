import { useEffect, useRef, useState } from 'react'
import {
  getMyNotificationPreferences,
  NOTIFICATION_PREFERENCE_KEYS,
  updateMyNotificationPreferences,
  type NotificationPreferenceKey,
  type NotificationPreferences,
} from '@/services/notificationService'
import { toast } from '@/services/toastService'
import { txa } from '@/i18n/activeLocale'

export function useNotificationSettingsState() {
  const [saved, setSaved] = useState<NotificationPreferences | null>(null)
  const [draft, setDraft] = useState<NotificationPreferences | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const [reloadVersion, setReloadVersion] = useState(0)
  const alive = useRef(true)
  const saveInFlight = useRef(false)

  useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])

  useEffect(() => {
    let current = true
    setLoading(true)
    setLoadError(false)
    void getMyNotificationPreferences().then((preferences) => {
      if (!current) return
      setSaved(preferences)
      setDraft(preferences)
    }).catch(() => {
      if (current) setLoadError(true)
    }).finally(() => {
      if (current) setLoading(false)
    })
    return () => { current = false }
  }, [reloadVersion])

  const hasChanges = Boolean(saved && draft
    && NOTIFICATION_PREFERENCE_KEYS.some((key) => draft[key] !== saved[key]))

  function change(key: NotificationPreferenceKey, value: boolean) {
    if (saveInFlight.current || loading) return
    setDraft((previous) => previous ? { ...previous, [key]: value } : previous)
    setSaveError(false)
  }

  function discard() {
    if (saveInFlight.current) return
    setDraft(saved)
    setSaveError(false)
  }

  async function save() {
    if (!draft || !hasChanges || loading || saveInFlight.current) return
    saveInFlight.current = true
    setSaving(true)
    setSaveError(false)
    try {
      const preferences = await updateMyNotificationPreferences(draft)
      if (!alive.current) return
      setSaved(preferences)
      setDraft(preferences)
      toast.success(txa('Bildirim ayarların kaydedildi.'))
    } catch {
      if (!alive.current) return
      // On a failed request the last server record and the user's draft are kept.
      setSaveError(true)
      toast.error(txa('Bildirim ayarların kaydedilemedi. Tekrar dene.'))
    } finally {
      saveInFlight.current = false
      if (alive.current) setSaving(false)
    }
  }

  return {
    draft, loading, saving, loadError, saveError, hasChanges,
    change, discard, save,
    retry: () => setReloadVersion((previous) => previous + 1),
  }
}
