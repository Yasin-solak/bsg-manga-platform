import { createClient } from '@supabase/supabase-js'

/**
 * Signs in with an account AND claims the active session to satisfy the app's
 * single-active-session guard. Without this step current_public_user_id() returns null
 * and all authenticated checks block trivially (for the wrong reason).
 *
 * Returns: { client, session, sessionId }; the client is now in a real authenticated context.
 */
export async function signInAndClaimActiveSession(url, anonKey, creds) {
  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await client.auth.signInWithPassword(creds)
  if (error) throw new Error(`Sign-in error (${creds.email}): ${error.message}`)

  const accessToken = data.session.access_token
  const payload = JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64').toString())
  const sessionId = payload.session_id
  if (!sessionId) throw new Error('No session_id in the JWT; the active session cannot be claimed.')

  const claim = await client.rpc('claim_active_session', { p_session_id: sessionId })
  if (claim.error) throw new Error(`claim_active_session error: ${claim.error.message}`)

  // Verification: is there a real authenticated context now?
  const identity = await client.rpc('get_my_user_identity')
  if (identity.error) throw new Error(`Active session could not be set: ${identity.error.message}`)

  return { client, session: data.session, sessionId, identity: identity.data }
}
