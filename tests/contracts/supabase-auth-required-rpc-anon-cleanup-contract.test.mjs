import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')

function read(relativePath) {
  return readFileSync(path.join(rootDir, relativePath), 'utf8')
}

function blockAfter(source, marker, endMarker = '\n\n') {
  const start = source.indexOf(marker)
  assert.ok(start >= 0, `${marker} bulunamadi`)
  const end = source.indexOf(endMarker, start + marker.length)
  return source.slice(start, end === -1 ? undefined : end)
}

const migration = read('supabase/migrations/20260519235904_auth_required_rpc_anon_cleanup.sql')

const authRequiredBlock = blockAfter(migration, 'left on existing login-required functions')

for (const rpcName of [
  'block_user',
  'create_user_manga_list',
  'create_security_event',
  'get_my_account_economy_snapshot',
  'get_upload_auth_context',
  'list_fansub_manage_chapters',
  'purchase_store_item',
  'record_auth_session_context',
  'redeem_coin_code',
  'set_community_post_reaction',
  'submit_manga_rating',
  'upsert_fansub_profile',
  'vote_community_post_poll',
]) {
  assert.ok(authRequiredBlock.includes(`'${rpcName}'`), `${rpcName} must be in the anon cleanup scope`)
}

for (const publicRpcName of [
  'get_public_user_profile_by_id',
  'get_public_fansub_boost_bundle',
  'get_community_post_assets',
  'get_profile_view_access',
  'search_public_mangas_v2',
  'track_community_post_view',
]) {
  assert.ok(!authRequiredBlock.includes(`'${publicRpcName}'`), `${publicRpcName} must stay a public RPC`)
}

assert.match(authRequiredBlock, /revoke execute on function %s from anon, public/)
assert.match(authRequiredBlock, /grant execute on function %s to authenticated/)

const privateBlock = blockAfter(migration, 'used inside the trigger/privileged RPC chain')

for (const rpcName of [
  'create_fansub_audit_log',
  'handle_auth_user_created',
  'is_trusted_mutation_stack',
  'maybe_refresh_fansub_boost_snapshot',
  'push_notification',
  'resolve_fansub_notice_target',
]) {
  assert.ok(privateBlock.includes(`'${rpcName}'`), `${rpcName} must be in the private RPC scope`)
}

assert.match(privateBlock, /revoke execute on function %s from anon, authenticated, public/)
assert.match(privateBlock, /grant execute on function %s to service_role/)
assert.match(migration, /notify pgrst, 'reload schema';/)

console.log('PASS auth-required RPC anon cleanup contract kept')
