import process from 'node:process'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { getAdminEnvSetupHint, loadProjectEnv } from './lib/project-env.mjs'

const SMOKE_ITEM_IDENTIFIER = 'smoke-core-pattern'
const SMOKE_ITEM_NAME = '[Smoke] Core Flow Pattern'
const SMOKE_ITEM_TYPE = 'pattern'
const SMOKE_ITEM_PRICE = 0
const SMOKE_COMMENT_PREFIX = '[smoke-core-flow]'
const SMOKE_REPORT_PREFIX = 'smoke-core-flow'
const SMOKE_USER_PREFIX = 'smkcf_'
const REQUIRED_FLAGS = ['economy.store_purchase', 'reader.comments', 'moderation.reports']

function fail(message) {
  throw new Error(message)
}

function logStep(message) {
  console.log(`\n== ${message} ==`)
}

function getErrorMessage(error) {
  if (!error) return 'Bilinmeyen hata'
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message
  }
  return String(error)
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function readSessionIdFromAccessToken(accessToken) {
  if (!accessToken) return null
  const [, payload] = accessToken.split('.')
  if (!payload) return null

  try {
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
    const decoded = JSON.parse(Buffer.from(padded, 'base64').toString('utf8'))
    return typeof decoded.session_id === 'string' && decoded.session_id.trim()
      ? decoded.session_id.trim()
      : null
  } catch {
    return null
  }
}

async function ensureFlagsReady(serviceClient) {
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
    fail(`A feature flag that must be fully on for the smoke is off or rollout<100: ${blocked.join(', ')}`)
  }
}

async function ensureSmokeStoreItem(serviceClient) {
  const { data: existing, error: existingError } = await serviceClient
    .from('store_items')
    .select('id, purchase_count')
    .eq('type', SMOKE_ITEM_TYPE)
    .eq('identifier', SMOKE_ITEM_IDENTIFIER)
    .maybeSingle()

  if (existingError) {
    fail(`Smoke store item okunamadi: ${existingError.message}`)
  }

  if (existing?.id) {
    const { error: updateError } = await serviceClient
      .from('store_items')
      .update({
        name: SMOKE_ITEM_NAME,
        description: 'Gercek auth/store/comment/report smoke testi icin ayrik test urunu.',
        price: SMOKE_ITEM_PRICE,
        currency: 'Coin',
        image_key: SMOKE_ITEM_IDENTIFIER,
        is_active: true,
        purchase_count: 0,
      })
      .eq('id', existing.id)

    if (updateError) {
      fail(`Smoke store item guncellenemedi: ${updateError.message}`)
    }

    return existing.id
  }

  const { data: inserted, error: insertError } = await serviceClient
    .from('store_items')
    .insert({
      name: SMOKE_ITEM_NAME,
      description: 'Gercek auth/store/comment/report smoke testi icin ayrik test urunu.',
      identifier: SMOKE_ITEM_IDENTIFIER,
      type: SMOKE_ITEM_TYPE,
      price: SMOKE_ITEM_PRICE,
      currency: 'Coin',
      image_key: SMOKE_ITEM_IDENTIFIER,
      custom_asset_url: null,
      is_active: true,
      purchase_count: 0,
    })
    .select('id')
    .single()

  if (insertError || !inserted?.id) {
    fail(`Smoke store item olusturulamadi: ${getErrorMessage(insertError)}`)
  }

  return inserted.id
}

async function signInAs(client, label, email, password) {
  logStep(`${label} login`)
  const signInRes = await client.auth.signInWithPassword({ email, password })
  if (signInRes.error) {
    fail(`${label} login basarisiz: ${signInRes.error.message}`)
  }

  const authUserId = signInRes.data.user?.id
  if (!authUserId) {
    fail(`${label} login sonrasi auth user id okunamadi.`)
  }

  const sessionId = readSessionIdFromAccessToken(signInRes.data.session?.access_token)
  if (!sessionId) {
    fail(`${label} login sonrasi JWT session_id okunamadi.`)
  }

  const { error: claimError } = await client.rpc('claim_active_session', {
    p_session_id: sessionId,
  })
  if (claimError) {
    fail(`${label} active session claim failed: ${claimError.message}`)
  }

  const { data: publicUser, error: publicUserError } = await client.rpc('get_my_user_identity')

  if (publicUserError) {
    fail(`${label} public profil okunamadi: ${publicUserError.message}`)
  }

  if (!publicUser?.id) {
    fail(`${label} public profil eslesmesi bulunamadi.`)
  }

  console.log(`[OK] ${label}: ${publicUser.username || email} -> ${publicUser.id}`)
  return {
    authUserId,
    publicUserId: publicUser.id,
  }
}

async function waitForPublicUser(serviceClient, authUserId) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const { data, error } = await serviceClient
      .from('users')
      .select('id, username')
      .eq('auth_user_id', authUserId)
      .maybeSingle()

    if (error) {
      fail(`Smoke public user okunamadi: ${error.message}`)
    }

    if (data?.id) {
      return data
    }

    await sleep(250)
  }

  fail('Smoke public user profili olusmadi.')
}

async function createEphemeralSmokeActor(serviceClient) {
  const suffix = randomUUID().replace(/-/g, '').slice(0, 12)
  const username = `${SMOKE_USER_PREFIX}${suffix}`.slice(0, 24)
  const email = `${username}@mangazone.dev`
  const password = `Smoke!${suffix}Aa1`

  logStep('Ephemeral smoke kullanicisi olusturma')
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
  console.log(`[OK] Smoke user ready: ${publicUser.username} -> ${publicUser.id}`)

  return {
    email,
    password,
    authUserId: created.user.id,
    publicUserId: publicUser.id,
  }
}

async function cleanupStaleArtifacts(serviceClient) {
  const { error: deleteReportsError } = await serviceClient
    .from('reports')
    .delete()
    .ilike('description', `${SMOKE_REPORT_PREFIX}:%`)

  if (deleteReportsError) {
    fail(`Stale smoke raporlari silinemedi: ${deleteReportsError.message}`)
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
      const { error: deleteUserRowError } = await serviceClient
        .from('users')
        .delete()
        .eq('id', user.id)

      if (deleteUserRowError) {
        fail(`Stale smoke public user silinemedi: ${deleteUserRowError.message}`)
      }
    }

    if (user?.auth_user_id) {
      const { error: deleteAuthError } = await serviceClient.auth.admin.deleteUser(user.auth_user_id)
      if (deleteAuthError) {
        fail(`Stale smoke auth user silinemedi: ${deleteAuthError.message}`)
      }
    }
  }
}

async function main() {
  const cwd = process.cwd()
  loadProjectEnv({ cwd, includeAdmin: true })

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    fail(
      'Eksik degisken: VITE_SUPABASE_URL/SUPABASE_URL, VITE_SUPABASE_ANON_KEY/SUPABASE_ANON_KEY ve SUPABASE_SERVICE_ROLE_KEY gerekli. ' +
      getAdminEnvSetupHint(),
    )
  }

  const userBEmail = process.env.AUTH_SMOKE_EMAIL_B || 'kenan@mangazone.dev'
  const userBPassword =
    process.env.AUTH_SMOKE_PASSWORD_B
    || process.env.AUTH_SEED_PASSWORD_KENAN
    || process.env.AUTH_SEED_DEFAULT_PASSWORD
    || 'Demo12345!'

  const mangaId = process.env.AUTH_SMOKE_MANGA_ID || '70000000-0000-0000-0000-000000000001'
  const runId = new Date().toISOString()
  const commentBody = `${SMOKE_COMMENT_PREFIX} ${runId}`
  const reportDescription = `${SMOKE_REPORT_PREFIX}:${runId}`

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const authClientA = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const authClientB = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  let smokeActor = null
  let smokeStoreItemId = null
  let commentId = null
  let reportId = null

  try {
    logStep('Feature flag kontrolu')
    await ensureFlagsReady(serviceClient)
    console.log(`[OK] Flaglar hazir: ${REQUIRED_FLAGS.join(', ')}`)

    logStep('Smoke zemin temizligi')
    await cleanupStaleArtifacts(serviceClient)
    smokeStoreItemId = await ensureSmokeStoreItem(serviceClient)
    console.log(`[OK] Smoke store item hazir: ${smokeStoreItemId}`)

    smokeActor = await createEphemeralSmokeActor(serviceClient)
    const actorA = await signInAs(authClientA, 'Kullanici A', smokeActor.email, smokeActor.password)
    const actorB = await signInAs(authClientB, 'Kullanici B', userBEmail, userBPassword)

    if (actorA.publicUserId === actorB.publicUserId) {
      fail('The smoke needs two different public users.')
    }

    logStep('Gercek store satin alma')
    const { data: purchaseResult, error: purchaseError } = await authClientA.rpc('purchase_store_item', {
      p_item_id: smokeStoreItemId,
    })

    if (purchaseError || !purchaseResult) {
      fail(`Store satin alma basarisiz: ${getErrorMessage(purchaseError)}`)
    }

    if (purchaseResult.item_identifier !== SMOKE_ITEM_IDENTIFIER) {
      fail('The store purchase result did not match the expected smoke item identifier.')
    }
    if (Number(purchaseResult.stones) !== 0) {
      fail('The balance changed unexpectedly after a zero-price smoke store product.')
    }
    console.log('[OK] Store purchase verified')

    logStep('Gercek yorum olusturma')
    const { data: insertedComment, error: commentError } = await authClientA
      .from('manga_comments')
      .insert({
        manga_id: mangaId,
        user_id: actorA.publicUserId,
        chapter_id: null,
        parent_id: null,
        content: commentBody,
        likes: 0,
        dislikes: 0,
      })
      .select('id, user_id, content, is_active')
      .single()

    if (commentError || !insertedComment?.id) {
      fail(`Manga comment could not be created: ${getErrorMessage(commentError)}`)
    }

    commentId = insertedComment.id
    console.log(`[OK] Comment created: ${commentId}`)

    logStep('Gercek rapor olusturma')
    const { error: reportError } = await authClientB
      .from('reports')
      .insert({
        reporter_id: actorB.publicUserId,
        target_id: commentId,
        target_type: 'manga_comment',
        reason: 'Smoke test raporu',
        description: reportDescription,
        status: 'pending',
      })

    if (reportError) {
      fail(`Rapor olusturulamadi: ${getErrorMessage(reportError)}`)
    }

    const { data: adminVisibleReport, error: adminReportError } = await serviceClient
      .from('reports')
      .select('id, reporter_id, target_id, target_type, status')
      .eq('reporter_id', actorB.publicUserId)
      .eq('target_id', commentId)
      .eq('target_type', 'manga_comment')
      .maybeSingle()

    if (adminReportError) {
      fail(`Admin report verification failed: ${adminReportError.message}`)
    }
    if (!adminVisibleReport?.id || adminVisibleReport.target_id !== commentId || adminVisibleReport.status !== 'pending') {
      fail('The report did not show as expected on the admin side.')
    }

    reportId = adminVisibleReport.id

    console.log('[OK] Store + comment + report smoke zinciri tamamlandi.')
  } finally {
    logStep('Cleanup')

    if (reportId) {
      const { error } = await serviceClient.from('reports').delete().eq('id', reportId)
      if (error) {
        console.error(`[WARN] Smoke raporu temizlenemedi: ${error.message}`)
      }
    } else {
      const { error } = await serviceClient.from('reports').delete().ilike('description', `${SMOKE_REPORT_PREFIX}:%`)
      if (error) {
        console.error(`[WARN] Smoke raporu wildcard cleanup basarisiz: ${error.message}`)
      }
    }

    if (smokeActor?.publicUserId) {
      const { error } = await serviceClient.from('users').delete().eq('id', smokeActor.publicUserId)
      if (error) {
        console.error(`[WARN] Smoke public user temizlenemedi: ${error.message}`)
      }
    }

    if (smokeActor?.authUserId) {
      const { error } = await serviceClient.auth.admin.deleteUser(smokeActor.authUserId)
      if (error) {
        console.error(`[WARN] Smoke auth user temizlenemedi: ${error.message}`)
      }
    }

    if (smokeStoreItemId) {
      const { error } = await serviceClient
        .from('store_items')
        .update({ purchase_count: 0, is_active: false })
        .eq('id', smokeStoreItemId)

      if (error) {
        console.error(`[WARN] Smoke item purchase_count sifirlanamadi: ${error.message}`)
      }
    }

    await authClientA.auth.signOut()
    await authClientB.auth.signOut()
  }
}

main().catch((error) => {
  console.error('\nSmoke test error:')
  console.error(getErrorMessage(error))
  process.exit(1)
})
