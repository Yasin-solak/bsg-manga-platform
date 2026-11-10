import { useCallback, useEffect, useState } from 'react'
import { getMyFansubPermissions, type FansubPermission } from '@/services/fansubRolesService'

const EMPTY: ReadonlySet<FansubPermission> = new Set()

/**
 * The signed-in user's permissions in a fansub (admin and site admin: all).
 * Returns an empty set if loading fails: the UI grants nothing, and the DB rejects anyway.
 */
export function useFansubPermissions(fansubId: string | null | undefined, enabled = true) {
  const [permissions, setPermissions] = useState<ReadonlySet<FansubPermission>>(EMPTY)
  const [loading, setLoading] = useState(Boolean(fansubId && enabled))
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    if (!fansubId || !enabled) {
      setPermissions(EMPTY)
      setLoading(false)
      return undefined
    }
    let alive = true
    setLoading(true)
    getMyFansubPermissions(fansubId)
      .then((next) => { if (alive) setPermissions(next) })
      .catch(() => { if (alive) setPermissions(EMPTY) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [enabled, fansubId, nonce])

  const reload = useCallback(() => setNonce((value) => value + 1), [])
  return { permissions, loading, reload }
}
