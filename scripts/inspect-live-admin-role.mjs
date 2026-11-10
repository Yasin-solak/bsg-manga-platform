import process from 'node:process'
import { createClient } from '@supabase/supabase-js'
import { loadProjectEnv } from './lib/project-env.mjs'

function fail(message) {
  throw new Error(message)
}

function logSection(title, payload) {
  console.log(`\n== ${title} ==`)
  console.log(JSON.stringify(payload, null, 2))
}

function normalizeRpcRow(data) {
  if (Array.isArray(data)) {
    return data[0] ?? null
  }
  return data ?? null
}

async function main() {
  loadProjectEnv({ cwd: process.cwd() })

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
  const email = process.env.LIVE_AUDIT_EMAIL?.trim()
  const password = process.env.LIVE_AUDIT_PASSWORD ?? ''

  if (!supabaseUrl || !anonKey) {
    fail('Supabase env degerleri eksik.')
  }

  if (!email || !password) {
    fail('LIVE_AUDIT_EMAIL ve LIVE_AUDIT_PASSWORD gerekli.')
  }

  const supabase = createClient(supabaseUrl, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  const signInResult = await supabase.auth.signInWithPassword({ email, password })
  if (signInResult.error) {
    fail(`Login basarisiz: ${signInResult.error.message}`)
  }

  const authUser = signInResult.data.user
  if (!authUser?.id) {
    fail('Login sonrasi auth user id okunamadi.')
  }

  logSection('auth user', {
    id: authUser.id,
    email: authUser.email ?? null,
    app_metadata: authUser.app_metadata ?? null,
    user_metadata: authUser.user_metadata ?? null,
  })

  const ownUserRowResult = await supabase
    .from('users')
    .select('id, auth_user_id, username, role, is_active, is_banned, active_session_id')
    .eq('auth_user_id', authUser.id)
    .maybeSingle()

  logSection('users row', {
    data: ownUserRowResult.data ?? null,
    error: ownUserRowResult.error
      ? {
          code: ownUserRowResult.error.code,
          message: ownUserRowResult.error.message,
          details: ownUserRowResult.error.details,
        }
      : null,
  })

  const getAuthUserProfileResult = await supabase.rpc('get_auth_user_profile', {
    p_auth_user_id: authUser.id,
  })

  logSection('get_auth_user_profile', {
    data: normalizeRpcRow(getAuthUserProfileResult.data),
    error: getAuthUserProfileResult.error
      ? {
          code: getAuthUserProfileResult.error.code,
          message: getAuthUserProfileResult.error.message,
          details: getAuthUserProfileResult.error.details,
        }
      : null,
  })

  const getMyIdentityResult = await supabase.rpc('get_my_user_identity')
  logSection('get_my_user_identity', {
    data: normalizeRpcRow(getMyIdentityResult.data),
    error: getMyIdentityResult.error
      ? {
          code: getMyIdentityResult.error.code,
          message: getMyIdentityResult.error.message,
          details: getMyIdentityResult.error.details,
        }
      : null,
  })

  const currentPublicUserIdResult = await supabase.rpc('current_public_user_id')
  logSection('current_public_user_id', {
    data: normalizeRpcRow(currentPublicUserIdResult.data),
    error: currentPublicUserIdResult.error
      ? {
          code: currentPublicUserIdResult.error.code,
          message: currentPublicUserIdResult.error.message,
          details: currentPublicUserIdResult.error.details,
        }
      : null,
  })

  const currentAppRoleResult = await supabase.rpc('current_app_role')
  logSection('current_app_role', {
    data: normalizeRpcRow(currentAppRoleResult.data),
    error: currentAppRoleResult.error
      ? {
          code: currentAppRoleResult.error.code,
          message: currentAppRoleResult.error.message,
          details: currentAppRoleResult.error.details,
        }
      : null,
  })

  await supabase.auth.signOut().catch(() => undefined)
}

main().catch((error) => {
  console.error('\n[FAIL] inspect-live-admin-role')
  console.error(error?.message || error)
  process.exit(1)
})
