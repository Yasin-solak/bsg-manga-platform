import { getRuntimeFeatureFlags, type RuntimeFeatureFlagKey } from './featureFlagService'
import { createScopedLogger } from './logger'
import { withAbortSignal, withServiceTimeout } from './apiResilience'
import { supabase } from './supabase'
import { toUserFacingErrorMessage } from './userFacingError'
import { txa, getActiveLocale } from '@/i18n/activeLocale'
import { localizeHref } from '@/i18n/localizedRoutes'

/**
 * Social sign-in providers.
 *
 * The prototype has "Continue with X" buttons on the Welcome and Sign-in screens.
 * Provider setup (enabling the provider in Supabase + defining an app in Google Cloud /
 * Discord Developer) is NOT CODE WORK; the button does not work until
 * it is done.
 *
 * **So buttons depend on a flag.** Showing a non-working button is worse than
 * not showing it: the user taps, nothing happens and they
 * assume the fault is theirs. With the flag off the button is NOT drawn at all;
 * once the provider is set up the flag opens and the button appears by itself.
 *
 * Default is OFF: no record in the flag table means the provider is
 * not set up.
 *
 * NO Apple, by product decision: Discord instead (the community is already there).
 */

const oauthLogger = createScopedLogger('oauthProviders')

export type OAuthProviderId = 'google' | 'discord'

export interface OAuthProviderDefinition {
  id: OAuthProviderId
  label: string
  flagKey: RuntimeFeatureFlagKey
}

export const OAUTH_PROVIDERS: OAuthProviderDefinition[] = [
  { id: 'google', get label() { return txa('Google ile devam et') }, flagKey: 'auth.oauth_google' },
  { id: 'discord', get label() { return txa('Discord ile devam et') }, flagKey: 'auth.oauth_discord' },
]

/** Only INSTALLED providers. Returns an empty array if none is installed. */
export async function listEnabledOAuthProviders(): Promise<OAuthProviderDefinition[]> {
  try {
    const flags = await getRuntimeFeatureFlags(
      OAUTH_PROVIDERS.map((provider) => provider.flagKey),
      false,
    )
    return OAUTH_PROVIDERS.filter((provider) => flags[provider.flagKey] === true)
  } catch (error) {
    oauthLogger.warn({
      event: 'oauth-provider-flags',
      message: 'Sosyal giris saglayicilari okunamadi.',
      error,
    })
    /*
     * Second line of defense. The main protection is the `=== true` filter above:
     * getRuntimeFeatureFlags swallows errors and returns an EMPTY map,
     * so no provider passes when flags cannot be read either. To reach here
     * the function itself has to throw.
     */
    return []
  }
}

export async function signInWithOAuthProvider(provider: OAuthProviderId): Promise<void> {
  // Timeout wrapper: if the provider redirect cannot start, the
  // user should not stare at a button "waiting" forever.
  const { error } = await withServiceTimeout(
    (signal) => withAbortSignal(
      supabase.auth.signInWithOAuth({
        provider,
        options: {
          // On provider return the user comes back to the app; Layout already handles the
          // onboarding redirect.
          redirectTo: `${window.location.origin}${localizeHref('/', getActiveLocale())}`,
        },
      }),
      signal,
    ),
    { label: 'Sosyal giris baslatma' },
  )

  if (error) {
    oauthLogger.error({
      event: 'oauth-sign-in',
      message: toUserFacingErrorMessage(error, 'Sosyal giris baslatilamadi.'),
      context: { provider },
      error,
    })
    throw error
  }
}
