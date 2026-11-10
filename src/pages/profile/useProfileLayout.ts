import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/services/supabase'
import { toast } from '@/services/toastService'
import { createScopedLogger } from '@/services/logger'
import { DEFAULT_PROFILE_LAYOUT, normalizeProfileLayout, type ProfileLayout } from './profileLayout'
import { txa } from '@/i18n/activeLocale'

const logger = createScopedLogger('profile.layout')

type LayoutRow = { slot_left: string, slot_right: string, tabs: string[] }

/**
 * Profile showcase layout: the visited user's record is read (default if none).
 * If the owner changes it, it reflects instantly and saves; rolled back on error.
 */
export function useProfileLayout(userId: string | undefined, canEdit: boolean) {
  const [layout, setLayout] = useState<ProfileLayout>(DEFAULT_PROFILE_LAYOUT)
  const savedRef = useRef<ProfileLayout>(DEFAULT_PROFILE_LAYOUT)

  useEffect(() => {
    if (!userId) return undefined
    let cancelled = false
    void (async () => {
      const { data, error } = await supabase
        .from('user_profile_layouts')
        .select('slot_left, slot_right, tabs')
        .eq('user_id', userId)
        .maybeSingle()
      if (cancelled) return
      if (error) {
        logger.warn('profil duzeni okunamadi', { error })
        return
      }
      const row = data as LayoutRow | null
      const next = row ? normalizeProfileLayout({ slotLeft: row.slot_left, slotRight: row.slot_right, tabs: row.tabs }) : DEFAULT_PROFILE_LAYOUT
      savedRef.current = next
      setLayout(next)
    })()
    return () => { cancelled = true }
  }, [userId])

  const update = useCallback(async (next: ProfileLayout) => {
    if (!canEdit) return
    const normalized = normalizeProfileLayout(next)
    const previous = savedRef.current
    setLayout(normalized)
    const { error } = await supabase.rpc('set_my_profile_layout', {
      p_slot_left: normalized.slotLeft,
      p_slot_right: normalized.slotRight,
      p_tabs: normalized.tabs,
    })
    if (error) {
      logger.warn('profil duzeni kaydedilemedi', { error })
      setLayout(previous)
      toast.error(txa('Profil düzeni kaydedilemedi.'))
      return
    }
    savedRef.current = normalized
  }, [canEdit])

  return { layout, update }
}
