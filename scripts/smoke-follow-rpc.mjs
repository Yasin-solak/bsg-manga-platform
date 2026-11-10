import process from 'node:process'
import { createClient } from '@supabase/supabase-js'
import { loadProjectEnv } from './lib/project-env.mjs'

function fail(message) {
  throw new Error(message)
}

function logStep(message) {
  console.log(`\n== ${message} ==`)
}

async function main() {
  const cwd = process.cwd()
  loadProjectEnv({ cwd })

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
  if (!supabaseUrl || !anonKey) {
    fail('Eksik degisken: VITE_SUPABASE_URL (veya SUPABASE_URL) ve VITE_SUPABASE_ANON_KEY gerekli.')
  }

  const email = process.env.AUTH_SMOKE_EMAIL_A || 'aylin@mangazone.dev'
  const password =
    process.env.AUTH_SMOKE_PASSWORD_A
    || process.env.AUTH_SEED_PASSWORD_AYLIN
    || process.env.AUTH_SEED_DEFAULT_PASSWORD
    || 'Demo12345!'

  const configuredUserPublicId = process.env.AUTH_SMOKE_USER_PUBLIC_ID || '22222222-2222-2222-2222-222222222222'
  const targetPublicId = process.env.AUTH_SMOKE_TARGET_PUBLIC_ID || '33333333-3333-3333-3333-333333333333'
  const mangaId = process.env.AUTH_SMOKE_MANGA_ID || '70000000-0000-0000-0000-000000000001'
  const fansubId = process.env.AUTH_SMOKE_FANSUB_ID || 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1'

  const supabase = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  logStep('Login')
  const signInRes = await supabase.auth.signInWithPassword({ email, password })
  if (signInRes.error) fail(`Login basarisiz: ${signInRes.error.message}`)
  console.log(`[OK] Login: ${email}`)
  const authUserId = signInRes.data.user?.id
  if (!authUserId) fail('Login sonrasi auth user id okunamadi.')

  const { data: currentPublicUser, error: currentPublicUserError } = await supabase
    .from('users')
    .select('id')
    .eq('auth_user_id', authUserId)
    .maybeSingle()

  if (currentPublicUserError) {
    fail(`Mevcut public user okunamadi: ${currentPublicUserError.message}`)
  }

  const userPublicId = currentPublicUser?.id || configuredUserPublicId
  console.log(`[OK] Public user id: ${userPublicId}`)

  const runRpc = async (fn, args) => {
    const { data, error } = await supabase.rpc(fn, args)
    if (error) {
      fail(`${fn} error: ${error.message} (${error.code || 'no-code'})`)
    }
    return data
  }

  logStep('Temizlik (idempotent unfollow)')
  const cleanup = await runRpc('unfollow_user', { p_following_id: targetPublicId })
  console.log('[OK] cleanup:', cleanup)

  logStep('follow_user ilk cagri')
  const followFirst = await runRpc('follow_user', { p_following_id: targetPublicId })
  if (!followFirst?.success) fail('follow_user returned success=false on the first call.')
  console.log('[OK] follow first:', followFirst)

  logStep('follow_user ikinci cagri (idempotent)')
  const followSecond = await runRpc('follow_user', { p_following_id: targetPublicId })
  if (!followSecond?.already_following) {
    fail('follow_user expected already_following=true on the second call.')
  }
  console.log('[OK] follow second:', followSecond)

  logStep('RLS: baskasi adina direct insert engeli')
  const { error: directInsertError } = await supabase
    .from('user_follows')
    .insert({ follower_id: targetPublicId, following_id: userPublicId })

  if (!directInsertError) {
    fail('RLS ihlali: direct insert beklenmedik sekilde basarili oldu.')
  }
  console.log(`[OK] direct insert engellendi: ${directInsertError.code || 'no-code'} | ${directInsertError.message}`)

  logStep('Self follow engeli')
  const { error: selfFollowError } = await supabase.rpc('follow_user', { p_following_id: userPublicId })
  if (!selfFollowError) {
    fail('Self follow beklenmedik sekilde basarili oldu.')
  }
  console.log(`[OK] self follow engellendi: ${selfFollowError.code || 'no-code'} | ${selfFollowError.message}`)

  logStep('unfollow_user dogrulamasi')
  const unfollowFirst = await runRpc('unfollow_user', { p_following_id: targetPublicId })
  if (!unfollowFirst?.deleted) fail('unfollow_user ilk cagrida deleted=true bekleniyordu.')
  console.log('[OK] unfollow first:', unfollowFirst)

  const unfollowSecond = await runRpc('unfollow_user', { p_following_id: targetPublicId })
  if (unfollowSecond?.deleted) fail('unfollow_user expected deleted=false on the second call.')
  console.log('[OK] unfollow second:', unfollowSecond)

  logStep('Temizlik (idempotent unfollow_manga)')
  const mangaCleanup = await runRpc('unfollow_manga', { p_manga_id: mangaId })
  console.log('[OK] manga cleanup:', mangaCleanup)

  logStep('follow_manga ilk cagri')
  const followMangaFirst = await runRpc('follow_manga', { p_manga_id: mangaId })
  if (!followMangaFirst?.success) fail('follow_manga returned success=false on the first call.')
  console.log('[OK] follow_manga first:', followMangaFirst)

  logStep('follow_manga ikinci cagri (idempotent)')
  const followMangaSecond = await runRpc('follow_manga', { p_manga_id: mangaId })
  if (!followMangaSecond?.already_following) {
    fail('follow_manga expected already_following=true on the second call.')
  }
  console.log('[OK] follow_manga second:', followMangaSecond)

  logStep('unfollow_manga dogrulamasi')
  const unfollowMangaFirst = await runRpc('unfollow_manga', { p_manga_id: mangaId })
  if (!unfollowMangaFirst?.deleted) fail('unfollow_manga ilk cagrida deleted=true bekleniyordu.')
  console.log('[OK] unfollow_manga first:', unfollowMangaFirst)

  const unfollowMangaSecond = await runRpc('unfollow_manga', { p_manga_id: mangaId })
  if (unfollowMangaSecond?.deleted) fail('unfollow_manga expected deleted=false on the second call.')
  console.log('[OK] unfollow_manga second:', unfollowMangaSecond)

  logStep('Temizlik (idempotent unfollow_fansub)')
  const fansubCleanup = await runRpc('unfollow_fansub', { p_fansub_id: fansubId })
  console.log('[OK] fansub cleanup:', fansubCleanup)

  logStep('follow_fansub ilk cagri')
  const followFansubFirst = await runRpc('follow_fansub', { p_fansub_id: fansubId })
  if (!followFansubFirst?.success) fail('follow_fansub returned success=false on the first call.')
  console.log('[OK] follow_fansub first:', followFansubFirst)

  logStep('follow_fansub ikinci cagri (idempotent)')
  const followFansubSecond = await runRpc('follow_fansub', { p_fansub_id: fansubId })
  if (!followFansubSecond?.already_following) {
    fail('follow_fansub expected already_following=true on the second call.')
  }
  console.log('[OK] follow_fansub second:', followFansubSecond)

  logStep('unfollow_fansub dogrulamasi')
  const unfollowFansubFirst = await runRpc('unfollow_fansub', { p_fansub_id: fansubId })
  if (!unfollowFansubFirst?.deleted) fail('unfollow_fansub ilk cagrida deleted=true bekleniyordu.')
  console.log('[OK] unfollow_fansub first:', unfollowFansubFirst)

  const unfollowFansubSecond = await runRpc('unfollow_fansub', { p_fansub_id: fansubId })
  if (unfollowFansubSecond?.deleted) fail('unfollow_fansub expected deleted=false on the second call.')
  console.log('[OK] unfollow_fansub second:', unfollowFansubSecond)

  await supabase.auth.signOut()
  console.log('\n[OK] User + Manga + Fansub follow RPC smoke test tamamlandi.')
}

main().catch((err) => {
  console.error('\nSmoke test error:')
  console.error(err.message || err)
  process.exit(1)
})
