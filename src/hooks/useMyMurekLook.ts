import { useEffect, useState } from 'react'
import {
  DEFAULT_MUREK_LOOK,
  clearMyMurekLook,
  getCachedMyMurekLook,
  loadMyMurekLook,
  subscribeMyMurekLook,
  type MurekLook,
} from '@/services/murekService'

/** The Mürek equipped by the signed-in user; the default purple Mürek when signed out. */
export function useMyMurekLook(userId: string | null | undefined): MurekLook {
  const [look, setLook] = useState<MurekLook>(() => getCachedMyMurekLook() ?? DEFAULT_MUREK_LOOK)
  useEffect(() => {
    const unsubscribe = subscribeMyMurekLook(setLook)
    if (!userId) {
      clearMyMurekLook()
      setLook(DEFAULT_MUREK_LOOK)
    } else {
      const cached = getCachedMyMurekLook()
      if (cached) setLook(cached)
      else void loadMyMurekLook()
    }
    return unsubscribe
  }, [userId])
  return userId ? look : DEFAULT_MUREK_LOOK
}
