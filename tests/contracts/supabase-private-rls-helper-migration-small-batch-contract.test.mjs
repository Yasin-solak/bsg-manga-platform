import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  'supabase/migrations/20260520235907_private_rls_helper_migration_small_batch.sql',
  'utf8',
);

const helpers = [
  ['is_user_blocked_between', 'uuid, uuid', /uuid,\s*uuid/i],
  ['is_user_manga_list_owner', 'uuid'],
  ['user_has_any_fansub_membership', 'uuid'],
  ['can_create_fansub_request_daily', 'uuid'],
  ['can_current_user_access_chapter', 'timestamptz'],
  ['fansub_has_boost_capability', 'uuid, text', /uuid,\s*text/i],
  ['can_read_public_user_row', 'uuid'],
];

assert.match(
  migration,
  /create schema if not exists app_private;/i,
  'app_private semasi migration icinde olusturulmali',
);

for (const [helperName, signature, signaturePattern] of helpers) {
  const escapedSignature = signaturePattern?.source ?? signature;

  assert.match(
    migration,
    new RegExp(`create or replace function app_private\\.${helperName}\\(`, 'i'),
    `${helperName} app_private semasina tasinmali`,
  );

  assert.match(
    migration,
    new RegExp(`grant execute on function app_private\\.${helperName}\\(${escapedSignature}\\) to anon, authenticated, service_role;`, 'i'),
    `${helperName} private helper must be executable by RLS roles`,
  );

  assert.match(
    migration,
    new RegExp(`revoke execute on function public\\.${helperName}\\(${escapedSignature}\\) from anon, authenticated, public;`, 'i'),
    `${helperName} public direct RPC grant'i kapatilmali`,
  );
}

const policyNames = [
  'chapters_select_public',
  'community_comments_select_rule',
  'community_posts_select_rule',
  'fansub_join_requests_insert_owner',
  'fansub_pinned_notices_select_public',
  'fansub_requests_insert_owner',
  'manga_comments_select_rule',
  'user_manga_list_comments_delete_rule',
  'user_manga_list_comments_update_rule',
  'user_manga_lists_select_rule',
  'users_select_active',
];

for (const policyName of policyNames) {
  assert.match(
    migration,
    new RegExp(`alter policy "${policyName}"`, 'i'),
    `${policyName} app_private helper'lara yonlendirilmeli`,
  );
}

const policySection = migration.slice(
  migration.indexOf('alter policy "chapters_select_public"'),
  migration.indexOf('revoke execute on function public.is_user_blocked_between'),
);

assert.doesNotMatch(
  policySection,
  /alter policy[\s\S]*\bpublic\.(is_user_blocked_between|is_user_manga_list_owner|user_has_any_fansub_membership|can_create_fansub_request_daily|can_current_user_access_chapter|fansub_has_boost_capability|can_read_public_user_row)\(/i,
  'Policy ifadelerinde public helper referansi kalmamali',
);

console.log('PASS Supabase private RLS helper small batch contract kept');
