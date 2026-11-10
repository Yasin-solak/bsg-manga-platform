import { randomUUID } from 'node:crypto'
import process from 'node:process'
import { createClient } from '@supabase/supabase-js'

const SMOKE_USER_PREFIX = 'smkbcr_'
const SMOKE_COMMENT_PREFIX = '[smoke-browser-comment-report]'
const SMOKE_REPORT_PREFIX = 'smoke-browser-comment-report:'
const REQUIRED_FLAGS = ['reader.comments', 'moderation.reports']
const DEFAULT_MANGA_ID = '70000000-0000-0000-0000-000000000001'

interface SmokeActor {
  email: string
  password: string
  authUserId: string
  publicUserId: string
}

export interface MangaCommentReportSmokeContext {
  mangaId: string
  userAEmail: string
  userAPassword: string
  userBEmail: string
  userBPassword: string
  commentText: string
  reportDescription: string
  assertCommentCreated: () => Promise<string>
  assertReportCreated: (commentId: string) => Promise<void>
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

async function waitForAssertion(check: () => Promise<boolean>, errorMessage: string) {
  for (let attempt = 0; attempt < 16; attempt += 1) {
    if (await check()) return
    await sleep(250)
  }

  fail(errorMessage)
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
    fail(`A flag that must be on for the comment/report browser E2E is off: ${blocked.join(', ')}`)
  }
}

async function createEphemeralSmokeActor(serviceClient: ReturnType<typeof createClient>) {
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

async function cleanupStaleArtifacts(serviceClient: ReturnType<typeof createClient>) {
  const { error: deleteReportsError } = await serviceClient
    .from('reports')
    .delete()
    .ilike('description', `${SMOKE_REPORT_PREFIX}%`)

  if (deleteReportsError) {
    fail(`Stale smoke raporlari silinemedi: ${deleteReportsError.message}`)
  }

  const { error: deleteCommentsError } = await serviceClient
    .from('manga_comments')
    .delete()
    .ilike('content', `${SMOKE_COMMENT_PREFIX}%`)

  if (deleteCommentsError) {
    fail(`Stale smoke comments could not be deleted: ${deleteCommentsError.message}`)
  }

  const { data: staleUsers, error: staleUsersError } = await serviceClient
    .from('users')
    .select('id, auth_user_id')
    .ilike('username', `${SMOKE_USER_PREFIX}%`)

  if (staleUsersError) {
    fail(`Stale smoke users could not be read: ${staleUsersError.message}`)
  }

  for (const user of staleUsers || []) {
    if (user?.id) {
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

export async function prepareMangaCommentReportBrowserSmoke(): Promise<MangaCommentReportSmokeContext> {
  const envModule = await import('../../scripts/lib/project-env.mjs')
  envModule.loadProjectEnv({ cwd: process.cwd(), includeAdmin: true })

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    fail(
      'Comment/report browser E2E icin VITE_SUPABASE_URL/SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY gerekli. '
      + envModule.getAdminEnvSetupHint(),
    )
  }

  const mangaId = process.env.AUTH_SMOKE_MANGA_ID || DEFAULT_MANGA_ID
  const runId = new Date().toISOString()
  const commentText = `${SMOKE_COMMENT_PREFIX} ${runId}`
  const reportDescription = `${SMOKE_REPORT_PREFIX}${runId}`

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  let actorA: SmokeActor | null = null
  let actorB: SmokeActor | null = null

  const cleanup = async () => {
    const publicUserIds = [actorA?.publicUserId, actorB?.publicUserId].filter(Boolean) as string[]
    const authUserIds = [actorA?.authUserId, actorB?.authUserId].filter(Boolean) as string[]

    if (publicUserIds.length > 0) {
      const { error } = await serviceClient
        .from('reports')
        .delete()
        .in('reporter_id', publicUserIds)
      if (error) {
        console.error(`[WARN] Comment/report smoke raporlari temizlenemedi: ${error.message}`)
      }
    } else {
      const { error } = await serviceClient
        .from('reports')
        .delete()
        .ilike('description', `${SMOKE_REPORT_PREFIX}%`)
      if (error) {
        console.error(`[WARN] Comment/report smoke wildcard rapor cleanup basarisiz: ${error.message}`)
      }
    }

    if (publicUserIds.length > 0) {
      const { error } = await serviceClient
        .from('manga_comments')
        .delete()
        .in('user_id', publicUserIds)
        .ilike('content', `${SMOKE_COMMENT_PREFIX}%`)
      if (error) {
        console.error(`[WARN] Comment/report smoke comments could not be cleaned: ${error.message}`)
      }
    } else {
      const { error } = await serviceClient
        .from('manga_comments')
        .delete()
        .ilike('content', `${SMOKE_COMMENT_PREFIX}%`)
      if (error) {
        console.error(`[WARN] Comment/report smoke wildcard comment cleanup failed: ${error.message}`)
      }
    }

    for (const userId of publicUserIds) {
      const { error } = await serviceClient.from('users').delete().eq('id', userId)
      if (error) {
        console.error(`[WARN] Comment/report smoke public user temizlenemedi: ${error.message}`)
      }
    }

    for (const authUserId of authUserIds) {
      const { error } = await serviceClient.auth.admin.deleteUser(authUserId)
      if (error && !isIgnorableAuthDeleteError(error)) {
        console.error(`[WARN] Comment/report smoke auth user temizlenemedi: ${error.message}`)
      }
    }
  }

  try {
    await ensureFlagsReady(serviceClient)
    await cleanupStaleArtifacts(serviceClient)

    actorA = await createEphemeralSmokeActor(serviceClient)
    actorB = await createEphemeralSmokeActor(serviceClient)

    return {
      mangaId,
      userAEmail: actorA.email,
      userAPassword: actorA.password,
      userBEmail: actorB.email,
      userBPassword: actorB.password,
      commentText,
      reportDescription,
      assertCommentCreated: async () => {
        let commentId = ''

        await waitForAssertion(async () => {
          const { data, error } = await serviceClient
            .from('manga_comments')
            .select('id')
            .eq('manga_id', mangaId)
            .eq('user_id', actorA?.publicUserId || '')
            .eq('content', commentText)
            .maybeSingle()

          if (error) {
            fail(`Smoke comment verification could not be read: ${error.message}`)
          }

          if (!data?.id) return false
          commentId = data.id
          return true
        }, 'Browser comment E2E sonunda yorum kaydi bulunamadi.')

        return commentId
      },
      assertReportCreated: async (commentId: string) => {
        await waitForAssertion(async () => {
          const { data, error } = await serviceClient
            .from('reports')
            .select('id')
            .eq('reporter_id', actorB?.publicUserId || '')
            .eq('target_id', commentId)
            .eq('target_type', 'manga_comment')
            .eq('description', reportDescription)
            .maybeSingle()

          if (error) {
            fail(`Smoke report verification could not be read: ${error.message}`)
          }

          return Boolean(data?.id)
        }, 'Browser comment E2E sonunda rapor kaydi bulunamadi.')
      },
      cleanup,
    }
  } catch (error) {
    await cleanup()
    fail(getErrorMessage(error))
  }
}
