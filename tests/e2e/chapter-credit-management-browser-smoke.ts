import { randomUUID } from 'node:crypto'
import process from 'node:process'
import { createClient } from '@supabase/supabase-js'

const SMOKE_USER_PREFIX = 'smkccm_'
const TARGET_FANSUB_ID = process.env.AUTH_SMOKE_FANSUB_ID || 'b33e2830-8cb6-4fe3-9467-9795ef28b109'
const REQUIRED_FLAGS = ['boost.system']

type SmokeActor = {
  email: string
  password: string
  authUserId: string
  publicUserId: string
}

export type ChapterCreditManagementSmokeContext = {
  fansubId: string
  email: string
  password: string
  cleanup: () => Promise<void>
}

function fail(message: string): never {
  throw new Error(message)
}

function getErrorMessage(error: unknown) {
  if (!error) return 'Bilinmeyen hata'
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message
  }
  return String(error)
}

function isIgnorableAuthDeleteError(error: unknown) {
  return getErrorMessage(error).toLowerCase().includes('user not found')
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

async function waitForPublicUser(serviceClient: ReturnType<typeof createClient>, authUserId: string) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const { data, error } = await serviceClient
      .from('users')
      .select('id, username')
      .eq('auth_user_id', authUserId)
      .maybeSingle()

    if (error) {
      fail(`Smoke public user okunamadi: ${error.message}`)
    }

    if (data?.id) return data
    await sleep(250)
  }

  fail('Smoke public user profili olusmadi.')
}

async function ensureFlagsReady(serviceClient: ReturnType<typeof createClient>) {
  const { data, error } = await serviceClient
    .from('feature_flags')
    .select('key, is_enabled, rollout_percent')
    .in('key', REQUIRED_FLAGS)

  if (error) {
    fail(`Feature flag kontrolu basarisiz: ${error.message}`)
  }

  const byKey = new Map((data || []).map((row) => [row.key, row]))
  const missing = REQUIRED_FLAGS.filter((key) => !byKey.has(key))
  if (missing.length > 0) {
    fail(`Eksik feature flag kaydi: ${missing.join(', ')}`)
  }

  const blocked = REQUIRED_FLAGS.filter((key) => {
    const row = byKey.get(key)
    return row?.is_enabled !== true || Number(row?.rollout_percent || 0) < 100
  })

  if (blocked.length > 0) {
    fail(`A flag that must be on for the chapter credit management smoke is off: ${blocked.join(', ')}`)
  }
}

async function createEphemeralSmokeActor(serviceClient: ReturnType<typeof createClient>): Promise<SmokeActor> {
  const suffix = randomUUID().replace(/-/g, '').slice(0, 12)
  const username = `${SMOKE_USER_PREFIX}${suffix}`.slice(0, 24)
  const email = `${username}@mangazone.dev`
  const password = `Smoke!${suffix}Aa1`

  const { data: created, error: createError } = await serviceClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username },
    app_metadata: { role: 'user' },
  })

  if (createError || !created.user?.id) {
    fail(`Smoke auth user could not be created: ${getErrorMessage(createError)}`)
  }

  const publicUser = await waitForPublicUser(serviceClient, created.user.id)

  return {
    email,
    password,
    authUserId: created.user.id,
    publicUserId: publicUser.id,
  }
}

async function ensureFansubStaffMembership(
  serviceClient: ReturnType<typeof createClient>,
  fansubId: string,
  publicUserId: string,
) {
  // Tek admin kuralini bozmayalim; /fansub/:id/yonet rotasi moderatoru da kabul ediyor.
  const { error } = await serviceClient
    .from('fansub_members')
    .upsert(
      {
        fansub_id: fansubId,
        user_id: publicUserId,
        role: 'moderator',
      },
      { onConflict: 'fansub_id,user_id' },
    )

  if (error) {
    fail(`Smoke fansub staff uyeligi olusturulamadi: ${error.message}`)
  }
}

async function cleanupStaleArtifacts(serviceClient: ReturnType<typeof createClient>) {
  const { data: staleUsers, error: staleUsersError } = await serviceClient
    .from('users')
    .select('id, auth_user_id')
    .ilike('username', `${SMOKE_USER_PREFIX}%`)

  if (staleUsersError) {
    fail(`Stale smoke users could not be read: ${staleUsersError.message}`)
  }

  for (const user of staleUsers || []) {
    if (user?.id) {
      await serviceClient.from('fansub_member_history').delete().eq('user_id', user.id)
      await serviceClient.from('fansub_members').delete().eq('user_id', user.id)

      const { error: deletePublicUserError } = await serviceClient
        .from('users')
        .delete()
        .eq('id', user.id)

      if (deletePublicUserError) {
        fail(`Stale smoke public user silinemedi: ${deletePublicUserError.message}`)
      }
    }

    if (user?.auth_user_id) {
      const { error: deleteAuthError } = await serviceClient.auth.admin.deleteUser(user.auth_user_id)
      if (deleteAuthError && !isIgnorableAuthDeleteError(deleteAuthError)) {
        fail(`Stale smoke auth user silinemedi: ${deleteAuthError.message}`)
      }
    }
  }
}

export async function prepareChapterCreditManagementBrowserSmoke(): Promise<ChapterCreditManagementSmokeContext> {
  const envModule = await import('../../scripts/lib/project-env.mjs')
  envModule.loadProjectEnv({ cwd: process.cwd(), includeAdmin: true })

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    fail(
      'Chapter credit management browser smoke icin VITE_SUPABASE_URL/SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY gerekli. '
      + envModule.getAdminEnvSetupHint(),
    )
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  let actor: SmokeActor | null = null

  const cleanup = async () => {
    if (actor?.publicUserId) {
      await serviceClient.from('fansub_member_history').delete().eq('user_id', actor.publicUserId)
      await serviceClient.from('fansub_members').delete().eq('user_id', actor.publicUserId)

      const { error: deletePublicUserError } = await serviceClient
        .from('users')
        .delete()
        .eq('id', actor.publicUserId)

      if (deletePublicUserError) {
        console.error(`[WARN] Chapter credit management smoke public user temizlenemedi: ${deletePublicUserError.message}`)
      }
    }

    if (actor?.authUserId) {
      const { error: deleteAuthError } = await serviceClient.auth.admin.deleteUser(actor.authUserId)
      if (deleteAuthError && !isIgnorableAuthDeleteError(deleteAuthError)) {
        console.error(`[WARN] Chapter credit management smoke auth user temizlenemedi: ${deleteAuthError.message}`)
      }
    }
  }

  try {
    await ensureFlagsReady(serviceClient)
    await cleanupStaleArtifacts(serviceClient)

    actor = await createEphemeralSmokeActor(serviceClient)
    await ensureFansubStaffMembership(serviceClient, TARGET_FANSUB_ID, actor.publicUserId)

    return {
      fansubId: TARGET_FANSUB_ID,
      email: actor.email,
      password: actor.password,
      cleanup,
    }
  } catch (error) {
    await cleanup()
    fail(getErrorMessage(error))
  }
}
