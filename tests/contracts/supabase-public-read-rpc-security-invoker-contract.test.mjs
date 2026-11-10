import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  'supabase/migrations/20260520235909_public_read_rpc_security_invoker_batch.sql',
  'utf8',
);

const functions = [
  ['get_active_premium_offer', ''],
  ['get_active_premium_package', 'text'],
  ['get_popular_community_tags', 'integer, integer'],
  ['get_runtime_feature_flags', 'text\\[\\]'],
  ['list_active_fansub_boost_plans', ''],
  ['list_public_release_schedule', 'uuid, timestamptz, integer, integer'],
  ['search_public_mangas_v2', 'text, text\\[\\], text, text, integer, integer'],
];

for (const [name, signaturePattern] of functions) {
  assert.match(
    migration,
    new RegExp(`alter function public\\.${name}\\(${signaturePattern}\\) security invoker;`, 'i'),
    `${name} SECURITY INVOKER modeline gecmeli`,
  );

  assert.match(
    migration,
    new RegExp(`grant execute on function public\\.${name}\\(${signaturePattern}\\) to anon, authenticated;`, 'i'),
    `${name} must keep working for anon/auth as a public read endpoint`,
  );
}

assert.doesNotMatch(
  migration,
  /track_community_post_(view|share)|track_manga_read|get_public_user_profile/i,
  'write-tracking and privacy-sensitive profiles must not change in this batch',
);

console.log('PASS Supabase public read RPC security invoker contract kept');
