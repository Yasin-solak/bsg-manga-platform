import { createScopedLogger } from '../logger'
import { withAbortSignal, withServiceTimeout } from '../apiResilience'
import { supabase } from '../supabase'
import type { AppUser } from './types'

const authRuntimeLogger = createScopedLogger('authService/runtime')

type DbAccountRuntimeRow = {
  id: string
  frame_type?: string | null
  active_badge_id?: string | null
  active_profile_effect_id?: string | null
}

export type AppUserAccountRuntime = {
  id: string
  frameType: string | null
  activeBadgeId: string | null
  activeProfileEffectId: string | null
}

function normalizeRpcRow<T>(data: unknown): T | null {
  if (!data) return null
  if (Array.isArray(data)) return (data[0] ?? null) as T | null
  return data as T
}

export async function getMyAccountRuntimeSnapshot(): Promise<AppUserAccountRuntime | null> {
  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase.rpc('get_my_account_runtime_snapshot'),
      signal,
    ),
    { label: 'authService.getMyAccountRuntimeSnapshot' },
  )

  if (error) {
    throw error
  }

  const payload = normalizeRpcRow<DbAccountRuntimeRow>(data)
  if (!payload?.id) return null

  return {
    id: payload.id,
    frameType: typeof payload.frame_type === 'string' ? payload.frame_type : 'default',
    activeBadgeId: typeof payload.active_badge_id === 'string' ? payload.active_badge_id : null,
    activeProfileEffectId: typeof payload.active_profile_effect_id === 'string' ? payload.active_profile_effect_id : null,
  }
}

export function applyAccountRuntimeToAppUser(
  appUser: AppUser,
  runtime: AppUserAccountRuntime | null,
): AppUser {
  if (!runtime || runtime.id !== appUser.id) {
    return appUser
  }

  return {
    ...appUser,
    frameType: runtime.frameType,
    activeBadgeId: runtime.activeBadgeId,
    activeProfileEffectId: runtime.activeProfileEffectId,
  }
}

export async function hydrateAppUserAccountRuntime(appUser: AppUser): Promise<AppUser> {
  try {
    const runtime = await getMyAccountRuntimeSnapshot()
    return applyAccountRuntimeToAppUser(appUser, runtime)
  } catch (error) {
    authRuntimeLogger.warn('getMyAccountRuntimeSnapshot failed; mevcut kullanici runtime alanlari korunuyor.', error)
    return appUser
  }
}
