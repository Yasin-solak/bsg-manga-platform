import process from 'node:process'
import { createClient } from '@supabase/supabase-js'
import { getAdminEnvSetupHint, loadProjectEnv } from './lib/project-env.mjs'

const TARGET_USERS = [
  {
    publicUserId: '11111111-1111-1111-1111-111111111111',
    email: 'admin@mangazone.dev',
    passwordEnv: 'AUTH_SEED_PASSWORD_ADMIN',
  },
  {
    publicUserId: '22222222-2222-2222-2222-222222222222',
    email: 'aylin@mangazone.dev',
    passwordEnv: 'AUTH_SEED_PASSWORD_AYLIN',
  },
  {
    publicUserId: '33333333-3333-3333-3333-333333333333',
    email: 'kenan@mangazone.dev',
    passwordEnv: 'AUTH_SEED_PASSWORD_KENAN',
  },
  {
    publicUserId: '44444444-4444-4444-4444-444444444444',
    email: 'sena@mangazone.dev',
    passwordEnv: 'AUTH_SEED_PASSWORD_SENA',
  },
]

async function listAllAuthUsers(supabase) {
  const users = []
  let page = 1
  const perPage = 200

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage })
    if (error) throw error

    const batch = data?.users ?? []
    users.push(...batch)
    if (batch.length < perPage) break
    page += 1
  }

  return users
}

async function findPublicUserByAuthId(supabase, authUserId) {
  const { data, error } = await supabase
    .from('users')
    .select('id, auth_user_id, username, role, is_active')
    .eq('auth_user_id', authUserId)
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return data ?? null
}

function boolFromEnv(value) {
  if (!value) return false
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase())
}

function logHeader(message) {
  console.log(`\n=== ${message} ===`)
}

async function main() {
  const cwd = process.cwd()
  loadProjectEnv({ cwd, includeAdmin: true })

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    console.error(`Eksik degisken: SUPABASE_URL (veya VITE_SUPABASE_URL) ve SUPABASE_SERVICE_ROLE_KEY gerekli. ${getAdminEnvSetupHint()}`)
    process.exit(1)
  }

  const defaultPassword = process.env.AUTH_SEED_DEFAULT_PASSWORD || 'Demo12345!'
  const dryRun = boolFromEnv(process.env.AUTH_SEED_DRY_RUN)

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  logHeader('Public users yukleniyor')
  const targetIds = TARGET_USERS.map((u) => u.publicUserId)
  const { data: publicUsers, error: publicUsersError } = await supabase
    .from('users')
    .select('id, auth_user_id, username, role, is_active')
    .in('id', targetIds)

  if (publicUsersError) {
    throw publicUsersError
  }

  const publicUserMap = new Map((publicUsers ?? []).map((u) => [u.id, u]))

  logHeader('Auth users yukleniyor')
  const authUsers = await listAllAuthUsers(supabase)
  const authByEmail = new Map(
    authUsers
      .filter((u) => u.email)
      .map((u) => [String(u.email).toLowerCase(), u]),
  )

  let createdCount = 0
  let linkedCount = 0
  let skippedCount = 0

  for (const target of TARGET_USERS) {
    const publicRow = publicUserMap.get(target.publicUserId)
    if (!publicRow) {
      console.warn(`[SKIP] No public user record: ${target.publicUserId}`)
      skippedCount += 1
      continue
    }

    const email = target.email.toLowerCase()
    let authUser = authByEmail.get(email)

    if (!authUser) {
      const password = process.env[target.passwordEnv] || defaultPassword

      if (dryRun) {
        console.log(`[DRY-RUN] Auth user olusturulacak: ${email}`)
      } else {
        const { data: created, error: createError } = await supabase.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { username: publicRow.username },
          app_metadata: { role: publicRow.role },
        })

        if (createError) {
          throw createError
        }

        authUser = created.user
        if (authUser?.email) {
          authByEmail.set(String(authUser.email).toLowerCase(), authUser)
        }
        createdCount += 1
        console.log(`[OK] Auth user olusturuldu: ${email}`)
      }
    }

    if (!authUser) {
      skippedCount += 1
      continue
    }

    if (publicRow.auth_user_id === authUser.id) {
      console.log(`[OK] Eslesme zaten dogru: ${publicRow.username} -> ${email}`)
      continue
    }

    const conflictingPublicUser = await findPublicUserByAuthId(supabase, authUser.id)
    if (conflictingPublicUser && conflictingPublicUser.id !== publicRow.id) {
      if (dryRun) {
        console.log(
          `[DRY-RUN] Conflicting public user will be deleted: ${conflictingPublicUser.id} (${conflictingPublicUser.username})`,
        )
      } else {
        const { error: deleteConflictError } = await supabase
          .from('users')
          .delete()
          .eq('id', conflictingPublicUser.id)

        if (deleteConflictError) {
          throw new Error(
            `Cakisan public user (${conflictingPublicUser.id}) silinemedi. ` +
            `Muhtemel sebep: bu satira bagli iliskisel veri var. ` +
            `Hata: ${deleteConflictError.message}`,
          )
        }

        console.log(`[OK] Conflicting public user cleaned: ${conflictingPublicUser.id}`)
      }
    }

    if (dryRun) {
      console.log(`[DRY-RUN] public.users.auth_user_id guncellenecek: ${publicRow.username} (${publicRow.id})`)
      continue
    }

    const { error: updateError } = await supabase
      .from('users')
      .update({ auth_user_id: authUser.id })
      .eq('id', publicRow.id)

    if (updateError) {
      throw updateError
    }

    linkedCount += 1
    console.log(`[OK] Eslesme guncellendi: ${publicRow.username} -> ${email}`)
  }

  logHeader('Ozet')
  console.log(`Olusturulan auth user: ${createdCount}`)
  console.log(`Guncellenen public.auth_user_id: ${linkedCount}`)
  console.log(`Skipped records: ${skippedCount}`)
  if (!dryRun) {
    console.log('\nTest accounts are ready. You can now sign in with these emails.')
  }
}

main().catch((err) => {
  console.error('\nAuth seed script error:')
  console.error(err)
  process.exit(1)
})
