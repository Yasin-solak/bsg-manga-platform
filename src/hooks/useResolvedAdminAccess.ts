import { useEffect, useState } from 'react'
import type { CurrentUser } from '@/contexts/AuthContext'
import { createScopedLogger } from '@/services/logger'
import { supabase } from '@/services/supabase'
import { clearCurrentUserIdentityCache, getCurrentUserIdentity } from '@/services/userService/selfIdentity'

const resolvedAdminAccessLogger = createScopedLogger('resolvedAdminAccess')

// Session-lived resolution cache: admin resolution runs once per user,
// so guard/sidebar remounts do not hit the network again. The key is the user
// id, so different sign-ins cannot mix (a role change requires a new session).
const adminResolutionCache = new Map<string, boolean>()

type UseResolvedAdminAccessArgs = Pick<CurrentUser, 'id' | 'role'> | null

function normalizeCurrentAppRolePayload(value: unknown) {
  const payload = Array.isArray(value) ? value[0] : value
  const role = typeof payload === 'string'
    ? payload
    : (payload && typeof payload === 'object' && 'current_app_role' in payload && typeof payload.current_app_role === 'string')
      ? payload.current_app_role
      : null

  return role === 'admin' || role === 'moderator' || role === 'user' ? role : null
}

async function resolveCurrentAppRole() {
  const { data, error } = await supabase.rpc('current_app_role')
  if (error) throw error
  return normalizeCurrentAppRolePayload(data)
}

async function waitMs(delayMs: number) {
  await new Promise((resolve) => setTimeout(resolve, delayMs))
}

export function useResolvedAdminAccess(currentUser: UseResolvedAdminAccessArgs) {
  const cachedResolution = currentUser?.id ? adminResolutionCache.get(currentUser.id) : undefined
  const [resolvedIsAdmin, setResolvedIsAdmin] = useState(
    currentUser?.role === 'admin' || cachedResolution === true,
  )
  const [resolvingAdminAccess, setResolvingAdminAccess] = useState(
    Boolean(currentUser?.id && currentUser.role !== 'admin' && cachedResolution === undefined),
  )

  useEffect(() => {
    let cancelled = false

    if (!currentUser?.id) {
      setResolvedIsAdmin(false)
      setResolvingAdminAccess(false)
      return
    }

    if (currentUser.role === 'admin') {
      setResolvedIsAdmin(true)
      setResolvingAdminAccess(false)
      return
    }

    const cached = adminResolutionCache.get(currentUser.id)
    if (cached !== undefined) {
      setResolvedIsAdmin(cached)
      setResolvingAdminAccess(false)
      return
    }

    setResolvedIsAdmin(false)
    setResolvingAdminAccess(true)

    // Not: Admin rol hydration'i gecikirse sidebar/guard yanlis negatif uretmesin.
    void (async () => {
      try {
        const resolveOnce = async () => {
          const identity = await getCurrentUserIdentity()
          if (identity?.id === currentUser.id && identity.role === 'admin') {
            return { isAdmin: true, definitive: true }
          }

          const appRole = await resolveCurrentAppRole()
          // 'user'/'moderator' are DEFINITE answers; only null (anon/not yet restored
          // session) counts as uncertain and earns the second pass.
          return { isAdmin: appRole === 'admin', definitive: appRole !== null }
        }

        let result = await resolveOnce()
        if (!result.isAdmin && !result.definitive) {
          // During a hard reload, self identity and current_app_role can briefly return
          // anon/missing in the first round. The narrow second pass runs only in this uncertain
          // state, so a regular user with a definite 'user' answer (e.g. a
          // fansub admin) does not pay a penalty of 260ms + 2 extra requests.
          await waitMs(260)
          clearCurrentUserIdentityCache()
          result = await resolveOnce()
        }

        if (cancelled) return
        adminResolutionCache.set(currentUser.id, result.isAdmin)
        setResolvedIsAdmin(result.isAdmin)
        setResolvingAdminAccess(false)
      } catch (error) {
        if (cancelled) return
        resolvedAdminAccessLogger.warn('admin role fallback resolve edilemedi.', error)
        setResolvedIsAdmin(false)
        setResolvingAdminAccess(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [currentUser?.id, currentUser?.role])

  return {
    isAdminResolved: resolvedIsAdmin,
    resolvingAdminAccess,
  }
}
