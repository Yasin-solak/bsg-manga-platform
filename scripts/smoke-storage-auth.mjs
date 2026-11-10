import process from 'node:process'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { getAdminEnvSetupHint, loadProjectEnv } from './lib/project-env.mjs'

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

async function waitForPublicUser(serviceClient, authUserId) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
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

function buildTinyPngFile() {
  const pngBytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Z6ioAAAAASUVORK5CYII=',
    'base64',
  )
  const blob = new Blob([pngBytes], { type: 'image/png' })
  return new File([blob], 'smoke-avatar.png', { type: 'image/png' })
}

async function signInAsSmokeActor(authClient, email, password) {
  const signInRes = await authClient.auth.signInWithPassword({ email, password })
  if (signInRes.error) {
    fail(`Smoke login basarisiz: ${signInRes.error.message}`)
  }

  const sessionId = readSessionIdFromAccessToken(signInRes.data.session?.access_token)
  if (!sessionId) {
    fail('Smoke login sonrasi JWT session_id okunamadi.')
  }

  const { error: claimError } = await authClient.rpc('claim_active_session', {
    p_session_id: sessionId,
  })
  if (claimError) {
    fail(`Smoke active session claim failed: ${claimError.message}`)
  }
}

async function createPendingCommunityPost(serviceClient, authorId, suffix) {
  const { data, error } = await serviceClient
    .from('community_posts')
    .insert({
      author_id: authorId,
      category: 'genel',
      title: `[smoke-storage-auth] ${suffix}`,
      body: 'storage auth smoke',
      related_manga_id: null,
      mentioned_manga_ids: [],
      chapter_number: null,
      related_fansub_id: null,
      related_fansub_ids: [],
      mentioned_user_ids: [],
      tags: ['smoke'],
      frame_type: 'default',
      primary_color: null,
      secondary_color: null,
      announcement_category: null,
      announcement_text_color: null,
      announcement_text_animation: null,
      announcement_action_label: null,
      announcement_action_url: null,
      is_verified: false,
      status: 'pending',
      approved_at: null,
      approved_by: null,
      rejected_at: null,
      reject_reason: null,
      is_active: true,
    })
    .select('id')
    .single()

  if (error || !data?.id) {
    fail(`Pending community post olusturulamadi: ${getErrorMessage(error)}`)
  }

  return data.id
}

async function main() {
  const cwd = process.cwd()
  loadProjectEnv({ cwd, includeAdmin: true })

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    fail(
      'Eksik degisken: VITE_SUPABASE_URL/SUPABASE_URL, VITE_SUPABASE_ANON_KEY/SUPABASE_ANON_KEY ve SUPABASE_SERVICE_ROLE_KEY gerekli. '
      + getAdminEnvSetupHint(),
    )
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const suffix = randomUUID().replace(/-/g, '').slice(0, 10)
  const username = `smsauth_${suffix}`.slice(0, 24)
  const email = `${username}@mangazone.dev`
  const password = `Smoke!${suffix}Aa1`
  const uploadFile = buildTinyPngFile()

  let authUserId = null
  let publicUserId = null
  let communityPostId = null
  const avatarPaths = []
  const storeAssetPaths = []

  try {
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

    authUserId = created.user.id
    const publicUser = await waitForPublicUser(serviceClient, authUserId)
    publicUserId = publicUser.id
    console.log(`[OK] Smoke user ready: auth=${authUserId} public=${publicUserId}`)

    logStep('Gercek login + session claim')
    await signInAsSmokeActor(authClient, email, password)
    console.log('[OK] claim_active_session gecti')

    logStep('Avatar upload auth uid yolu')
    const avatarAuthPath = `user-avatars/${authUserId}/${Date.now()}-auth.png`
    const avatarAuthUpload = await authClient.storage.from('avatars').upload(avatarAuthPath, uploadFile, {
      upsert: false,
      cacheControl: '3600',
    })
    if (avatarAuthUpload.error) {
      fail(`Avatar auth uid upload basarisiz: ${avatarAuthUpload.error.message}`)
    }
    avatarPaths.push(avatarAuthPath)
    console.log(`[OK] ${avatarAuthPath}`)

    logStep('Avatar upload public user yolu')
    const avatarPublicPath = `user-avatars/${publicUserId}/${Date.now()}-public.png`
    const avatarPublicUpload = await authClient.storage.from('avatars').upload(avatarPublicPath, uploadFile, {
      upsert: false,
      cacheControl: '3600',
    })
    if (avatarPublicUpload.error) {
      fail(`Avatar public user upload basarisiz: ${avatarPublicUpload.error.message}`)
    }
    avatarPaths.push(avatarPublicPath)
    console.log(`[OK] ${avatarPublicPath}`)

    logStep('Pending community post image upload')
    communityPostId = await createPendingCommunityPost(serviceClient, publicUserId, suffix)
    const communityImagePath = `community/posts/${communityPostId}/slot-01/${Date.now()}-image.png`
    const communityImageUpload = await authClient.storage.from('store-assets').upload(communityImagePath, uploadFile, {
      upsert: false,
      cacheControl: '3600',
    })
    if (communityImageUpload.error) {
      fail(`Community image upload basarisiz: ${communityImageUpload.error.message}`)
    }
    storeAssetPaths.push(communityImagePath)
    console.log(`[OK] ${communityImagePath}`)

    console.log('\n[OK] Avatar + community storage auth smoke zinciri tamamlandi.')
  } finally {
    logStep('Cleanup')

    if (avatarPaths.length > 0) {
      const { error } = await serviceClient.storage.from('avatars').remove(avatarPaths)
      if (error) {
        console.error(`[WARN] Avatar cleanup basarisiz: ${error.message}`)
      }
    }

    if (storeAssetPaths.length > 0) {
      const { error } = await serviceClient.storage.from('store-assets').remove(storeAssetPaths)
      if (error) {
        console.error(`[WARN] Community image cleanup basarisiz: ${error.message}`)
      }
    }

    if (communityPostId) {
      const { error } = await serviceClient.from('community_posts').delete().eq('id', communityPostId)
      if (error) {
        console.error(`[WARN] Community post cleanup basarisiz: ${error.message}`)
      }
    }

    if (publicUserId) {
      const { error } = await serviceClient.from('users').delete().eq('id', publicUserId)
      if (error) {
        console.error(`[WARN] Smoke public user cleanup basarisiz: ${error.message}`)
      }
    }

    if (authUserId) {
      const { error } = await serviceClient.auth.admin.deleteUser(authUserId)
      if (error) {
        console.error(`[WARN] Smoke auth user cleanup basarisiz: ${error.message}`)
      }
    }

    await authClient.auth.signOut().catch(() => undefined)
  }
}

main().catch((error) => {
  console.error('\nSmoke test error:')
  console.error(getErrorMessage(error))
  process.exit(1)
})
