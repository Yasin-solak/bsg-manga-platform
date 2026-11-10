import { withAbortSignal, withServiceTimeout } from '../apiResilience'
import { createScopedLogger } from '../logger'
import { createRequestContext, toRequestContextLogContext } from '../requestContext'
import { supabase } from '../supabase'
import { toUserFacingErrorMessage } from '../userFacingError'
import { getCurrentUserIdentity } from './selfIdentity'
import type { PrivacyVisibility, UserPrivacySettings, UserProfileViewAccess } from './types'

const PRIVACY_VISIBILITY_VALUES: PrivacyVisibility[] = ['public', 'followers', 'private']

const userPrivacyLogger = createScopedLogger('userService/privacy')

type PrivacySettingsRow = {
  profile_visibility: PrivacyVisibility | null
  stats_visibility: PrivacyVisibility | null
  social_links_visibility: PrivacyVisibility | null
  activity_visibility: PrivacyVisibility | null
}

type ProfileViewAccessRow = {
  is_owner: boolean
  viewer_is_follower: boolean
  profile_visible: boolean
  stats_visible: boolean
  social_links_visible: boolean
  activity_visible: boolean
  profile_visibility: PrivacyVisibility | null
  stats_visibility: PrivacyVisibility | null
  social_links_visibility: PrivacyVisibility | null
  activity_visibility: PrivacyVisibility | null
}

function isMissingPrivacyInfrastructureError(error: unknown) {
  if (!error || typeof error !== 'object') return false
  const typed = error as { code?: string; message?: string; details?: string; hint?: string }
  const text = [typed.message, typed.details, typed.hint].filter(Boolean).join(' ').toLowerCase()
  return (
    typed.code === 'PGRST202'
    || typed.code === '42703'
    || typed.code === '42883'
    || typed.code === '42P01'
    || text.includes('profile_visibility')
    || text.includes('stats_visibility')
    || text.includes('social_links_visibility')
    || text.includes('activity_visibility')
    || text.includes('update_my_profile_privacy_settings')
    || text.includes('get_profile_view_access')
  )
}

function buildPrivacyMigrationError() {
  return new Error('Bu ozellik icin 20260301235901_profile_privacy_phase2.sql migration dosyasini calistirin.')
}

function normalizePrivacyVisibility(value: unknown): PrivacyVisibility {
  return PRIVACY_VISIBILITY_VALUES.includes(value as PrivacyVisibility)
    ? (value as PrivacyVisibility)
    : 'public'
}

function mapPrivacySettings(row: PrivacySettingsRow | null | undefined): UserPrivacySettings {
  return {
    profileVisibility: normalizePrivacyVisibility(row?.profile_visibility),
    statsVisibility: normalizePrivacyVisibility(row?.stats_visibility),
    socialLinksVisibility: normalizePrivacyVisibility(row?.social_links_visibility),
    activityVisibility: normalizePrivacyVisibility(row?.activity_visibility),
  }
}

export async function getMyPrivacySettings(): Promise<UserPrivacySettings> {
  const requestContext = createRequestContext('userService/privacy', 'getMyPrivacySettings')
  try {
    const identity = await getCurrentUserIdentity({ required: true })
    return mapPrivacySettings({
      profile_visibility: identity?.profile_visibility ?? null,
      stats_visibility: identity?.stats_visibility ?? null,
      social_links_visibility: identity?.social_links_visibility ?? null,
      activity_visibility: identity?.activity_visibility ?? null,
    })
  } catch (error) {
    if (isMissingPrivacyInfrastructureError(error)) throw buildPrivacyMigrationError()
    userPrivacyLogger.error({
      event: requestContext.event,
      message: toUserFacingErrorMessage(error, 'Gizlilik ayarlari yuklenemedi.'),
      context: toRequestContextLogContext(requestContext),
      error,
    })
    throw error
  }
}

export async function updateMyPrivacySettings(settings: UserPrivacySettings): Promise<UserPrivacySettings> {
  const requestContext = createRequestContext('userService/privacy', 'updateMyPrivacySettings')
  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase.rpc('update_my_profile_privacy_settings', {
        p_profile_visibility: settings.profileVisibility,
        p_stats_visibility: settings.statsVisibility,
        p_social_links_visibility: settings.socialLinksVisibility,
        p_activity_visibility: settings.activityVisibility,
      }),
      signal,
    ),
    { label: 'userService.updateMyPrivacySettings' },
  )

  if (error) {
    if (isMissingPrivacyInfrastructureError(error)) throw buildPrivacyMigrationError()
    userPrivacyLogger.error({
      event: requestContext.event,
      message: toUserFacingErrorMessage(error, 'Gizlilik ayarlari guncellenemedi.'),
      context: toRequestContextLogContext(requestContext),
      error,
    })
    throw error
  }

  const payload = (data || {}) as Partial<PrivacySettingsRow>
  return mapPrivacySettings({
    profile_visibility: payload.profile_visibility ?? null,
    stats_visibility: payload.stats_visibility ?? null,
    social_links_visibility: payload.social_links_visibility ?? null,
    activity_visibility: payload.activity_visibility ?? null,
  })
}

export async function getProfileViewAccess(targetUserId: string): Promise<UserProfileViewAccess> {
  const requestContext = createRequestContext('userService/privacy', 'getProfileViewAccess', { targetUserId })
  const { data, error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase.rpc('get_profile_view_access', {
        p_target_user_id: targetUserId,
      }),
      signal,
    ),
    { label: 'userService.getProfileViewAccess' },
  )

  if (error) {
    if (isMissingPrivacyInfrastructureError(error)) throw buildPrivacyMigrationError()
    userPrivacyLogger.error({
      event: requestContext.event,
      message: toUserFacingErrorMessage(error, 'Profil gorunurluk erisimi yuklenemedi.'),
      context: toRequestContextLogContext(requestContext),
      error,
    })
    throw error
  }

  const payload = ((Array.isArray(data) ? data[0] : data) || {}) as Partial<ProfileViewAccessRow>
  const settings = mapPrivacySettings({
    profile_visibility: payload.profile_visibility ?? null,
    stats_visibility: payload.stats_visibility ?? null,
    social_links_visibility: payload.social_links_visibility ?? null,
    activity_visibility: payload.activity_visibility ?? null,
  })

  return {
    ...settings,
    isOwner: payload.is_owner === true,
    viewerIsFollower: payload.viewer_is_follower === true,
    profileVisible: payload.profile_visible === true,
    statsVisible: payload.stats_visible === true,
    socialLinksVisible: payload.social_links_visible === true,
    activityVisible: payload.activity_visible === true,
  }
}
