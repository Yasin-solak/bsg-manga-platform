import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  'supabase/migrations/20260520235911_invoker_rpc_private_helper_body_rewrite.sql',
  'utf8',
);

for (const functionName of [
  'get_community_post_assets',
  'get_community_post_poll',
  'get_runtime_feature_flags',
]) {
  assert.match(
    migration,
    new RegExp(`create or replace function public\\.${functionName}\\(`, 'i'),
    `${functionName} must be redefined`,
  );
}

assert.match(
  migration,
  /security invoker/i,
  'Fonksiyonlar invoker statulerini korumali',
);

assert.match(
  migration,
  /app_private\.current_public_user_id\(\)/i,
  'current user helper app_private semasindan cagrilmali',
);

assert.match(
  migration,
  /app_private\.is_admin\(\)/i,
  'admin helper app_private semasindan cagrilmali',
);

const bodies = migration.slice(
  migration.indexOf('create or replace function public.get_community_post_assets'),
  migration.indexOf('grant execute on function public.get_community_post_assets'),
);

assert.doesNotMatch(
  bodies,
  /public\.(is_admin|current_public_user_id)\(/i,
  'Invoker govdelerinde public helper cagrisi kalmamali',
);

console.log('PASS Supabase invoker RPC private helper body rewrite contract kept');
