import { withServiceTimeout } from '@/services/apiResilience'
import { getCurrentAccessToken } from '@/services/authService/shared'
import { supabase } from '@/services/supabase'

/**
 * Access key for translation studio endpoints. The session summary verifies the user over the network
 * (4 s limit); in a long scan one slow response was failing the page with "auth snapshot timeout".
 * If the summary is unavailable the local session key is used; the server still verifies.
 */
export async function studioAccessToken(): Promise<string | null> {
  try {
    const token = await getCurrentAccessToken()
    if (token) return token
  } catch {
    // Yerel oturuma dus.
  }
  const { data } = await withServiceTimeout(() => supabase.auth.getSession(), {
    label: 'Studyo oturum anahtari', timeoutMs: 4_000,
  })
  return data.session?.access_token ?? null
}
