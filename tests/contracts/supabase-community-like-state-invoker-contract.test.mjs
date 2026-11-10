import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  'supabase/migrations/20260520235913_community_like_state_invoker.sql',
  'utf8',
);

assert.match(
  migration,
  /create or replace function public\.is_community_post_liked\(p_post_id uuid\)/i,
  'the like state RPC must be redefined',
);

assert.match(
  migration,
  /security invoker/i,
  'Like state RPC definer yetkisi tasimamali',
);

assert.match(
  migration,
  /app_private\.current_public_user_id\(\)/i,
  'Current user helper app_private semasindan cagrilmali',
);

assert.doesNotMatch(
  migration,
  /public\.current_public_user_id\(\)|security definer/i,
  'no public helper and definer must remain',
);

assert.match(
  migration,
  /grant execute on function public\.is_community_post_liked\(uuid\) to authenticated;/i,
  'the frontend must keep working as an authenticated endpoint',
);

console.log('PASS Supabase community like state invoker contract kept');
