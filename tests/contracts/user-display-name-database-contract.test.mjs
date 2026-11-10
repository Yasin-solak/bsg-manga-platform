import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const identityMigration = readFileSync(
  new URL('../../supabase/migrations/20260718055835_user_display_name_identity.sql', import.meta.url),
  'utf8',
)
const adminProjectionMigration = readFileSync(
  new URL('../../supabase/migrations/20260718060137_user_display_name_admin_projection.sql', import.meta.url),
  'utf8',
)
const adminDetailMigration = readFileSync(
  new URL('../../supabase/migrations/20260718060459_user_display_name_admin_detail.sql', import.meta.url),
  'utf8',
)
const coreMigration = readFileSync(
  new URL('../../supabase/migrations/20260207235901_core_schema.sql', import.meta.url),
  'utf8',
)

function run(name, assertion) {
  try {
    assertion()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    throw error
  }
}

function functionBlock(source, schema, functionName) {
  const block = source.match(new RegExp(
    `create(?: or replace)? function ${schema}\\.${functionName}\\([\\s\\S]*?\\$function\\$;`,
    'i',
  ))?.[0]
  assert.ok(block, `${schema}.${functionName} fonksiyon blogu bulunamadi.`)
  return block
}

run('display_name is an additive, non-unique identity field', () => {
  assert.match(identityMigration, /alter table public\.users[\s\S]*add column if not exists display_name text/i)
  assert.doesNotMatch(identityMigration, /unique[^;\n]*display_name|display_name[^;\n]*unique/i)
  assert.match(coreMigration, /unique index if not exists users_username_lower_key[\s\S]*lower\(username\)/i)
  assert.match(coreMigration, /unique index if not exists users_username_slug_key[\s\S]*username_slug/i)
})

run('the display name is normalized and limited to 1-40 characters', () => {
  assert.match(identityMigration, /create trigger users_normalize_display_name[\s\S]*before insert or update of display_name, username/i)
  assert.match(identityMigration, /new\.display_name := coalesce[\s\S]*new\.username/i)
  assert.match(identityMigration, /char_length\(display_name\) between 1 and 40/i)
  assert.match(identityMigration, /display_name !~ '\[\[:cntrl:\]\]'/i)
  assert.match(identityMigration, /alter column display_name set not null/i)
  assert.match(identityMigration, /disable trigger trg_users_prevent_non_admin_sensitive_updates[\s\S]*update public\.users[\s\S]*enable trigger trg_users_prevent_non_admin_sensitive_updates/i)
})

run('the user display name RPC updates only its own row', () => {
  const privateRpc = functionBlock(identityMigration, 'app_private', 'update_my_display_name')
  const publicRpc = functionBlock(identityMigration, 'public', 'update_my_display_name')
  assert.match(privateRpc, /security definer[\s\S]*set search_path = ''/i)
  assert.match(privateRpc, /v_user_id uuid := app_private\.current_public_user_id\(\)/i)
  assert.match(privateRpc, /where u\.id = v_user_id/i)
  assert.doesNotMatch(privateRpc, /set[\s\S]{0,80}username\s*=/i)
  assert.match(publicRpc, /security invoker[\s\S]*app_private\.update_my_display_name\(p_display_name\)/i)
  assert.doesNotMatch(publicRpc, /security definer/i)
  assert.match(identityMigration, /revoke all on function public\.update_my_display_name\(text\)[\s\S]*from public, anon, authenticated/i)
  assert.match(identityMigration, /grant execute on function public\.update_my_display_name\(text\)[\s\S]*to authenticated/i)
})

run('public profile and self read models carry display_name', () => {
  const directoryView = identityMigration.match(
    /create or replace view public\.public_user_directory[\s\S]*?grant select on public\.public_user_directory/i,
  )?.[0] ?? ''
  assert.match(directoryView, /with \(security_invoker = true\)/i)
  assert.match(directoryView, /u\.id,[\s\S]*u\.username,[\s\S]*u\.avatar_url,[\s\S]*u\.frame_type,[\s\S]*as background_type,[\s\S]*as active_fansub_identity_tag,[\s\S]*as display_name/i)
  assert.match(identityMigration, /grant select \(display_name\) on public\.users to anon, authenticated/i)
  for (const functionName of [
    'get_public_user_profile_by_id',
    'get_public_user_profile_by_username',
    'get_auth_user_profile',
    'get_my_user_identity',
    'get_my_private_user_profile',
  ]) {
    const privateRead = functionBlock(identityMigration, 'app_private', functionName)
    const publicRead = functionBlock(identityMigration, 'public', functionName)
    assert.match(privateRead, /security definer[\s\S]*'display_name'/i)
    assert.match(publicRead, new RegExp(`security invoker[\\s\\S]*app_private\\.${functionName}`, 'i'))
    assert.doesNotMatch(publicRead, /security definer/i)
  }
  assert.match(identityMigration, /function app_private\.get_public_user_profile_by_id\([\s\S]*p_include_social_links boolean default false/i)
  assert.match(identityMigration, /function app_private\.get_public_user_profile_by_username\([\s\S]*p_include_social_links boolean default false/i)
})

run('gorunen ad arama indeksi transaction uyumlu olusturulur', () => {
  assert.match(identityMigration, /create index if not exists users_display_name_trgm_idx[\s\S]*display_name gin_trgm_ops/i)
  assert.doesNotMatch(identityMigration, /create\s+index\s+concurrently/i)
})

run('the admin list carries and searches the display name and limits the page to 10', () => {
  const privateDirectory = functionBlock(adminProjectionMigration, 'app_private', 'get_admin_user_directory_rows')
  const publicDirectory = functionBlock(adminProjectionMigration, 'public', 'get_admin_user_directory_rows')
  assert.match(adminProjectionMigration, /drop function if exists app_private\.get_admin_user_directory_rows\(\)/i)
  assert.match(privateDirectory, /returns table \([\s\S]*username text,[\s\S]*display_name text[\s\S]*security definer/i)
  assert.match(publicDirectory, /security invoker[\s\S]*app_private\.get_admin_user_directory_rows\(\)/i)
  assert.match(adminProjectionMigration, /or u\.display_name ilike/i)
  assert.match(adminProjectionMigration, /'displayName', i\.display_name/i)
  assert.match(adminProjectionMigration, /v_limit < 1 or v_limit > 10/i)
  assert.match(adminProjectionMigration, /p_limit integer default 10/i)
  assert.match(adminProjectionMigration, /grant execute on function app_private\.get_admin_user_directory_rows\(\)[\s\S]*to authenticated, service_role/i)
})

run('admin preview and detail are enriched with the display name, backward compatible', () => {
  assert.match(adminDetailMigration, /function public\.get_admin_user_management_preview[\s\S]*'\{profile,displayName\}'/i)
  assert.match(adminDetailMigration, /function public\.get_admin_user_detail_v2[\s\S]*public\.get_admin_user_detail\(p_user_id\)[\s\S]*'\{profile,displayName\}'/i)
  assert.match(adminDetailMigration, /function app_private\.get_admin_user_detail_profile[\s\S]*'display_name'/i)
  assert.match(adminDetailMigration, /function public\.get_admin_user_detail_profile[\s\S]*security invoker[\s\S]*app_private\.get_admin_user_detail_profile/i)
  assert.match(adminDetailMigration, /grant execute on function public\.get_admin_user_detail_v2\(uuid\)[\s\S]*to authenticated;/i)
  assert.doesNotMatch(adminDetailMigration, /grant execute on function public\.get_admin_user_detail_v2\(uuid\)[\s\S]*to authenticated, service_role/i)
  assert.doesNotMatch(adminDetailMigration, /from public\.get_admin_user_directory_rows\(\)/i)
  assert.match(adminDetailMigration, /from public\.users as u[\s\S]*where u\.id = p_user_id/i)
})

run('kimlik migrationi username uretim imzasina dokunmaz', () => {
  assert.doesNotMatch(identityMigration, /generate_unique_username/i)
})
