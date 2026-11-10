import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  'supabase/migrations/20260520235914_remaining_anon_definer_private_wrappers.sql',
  'utf8',
);

const targets = [
  'get_community_post_reaction_summary',
  'get_effective_public_chapter_credit_config',
  'get_profile_view_access',
  'get_public_fansub_boost_bundle',
  'get_public_fansub_boost_snapshot',
  'get_public_fansub_supporter_asset_render_catalog',
  'get_public_fansub_tier_preview',
  'get_public_profile_stats',
  'get_public_user_profile_by_id',
  'get_public_user_profile_by_username',
  'list_public_fansub_boost_supporters_preview',
  'list_public_fansub_supporter_assets',
  'track_community_post_share',
  'track_community_post_view',
  'track_manga_read',
];

assert.match(
  migration,
  /create schema if not exists app_private;/i,
  'Private sema migration tarafindan hazirlanmali',
);

assert.match(
  migration,
  /pg_get_functiondef\(p\.oid\)/i,
  'Mevcut govdeler canli tanimdan kopyalanmali',
);

assert.match(
  migration,
  /CREATE OR REPLACE FUNCTION app_private\./i,
  'Definer govde app_private semasina tasinmali',
);

assert.match(
  migration,
  /security invoker/i,
  'the public surface must be an invoker wrapper',
);

assert.match(
  migration,
  /select \* from app_private\./i,
  'functions returning TABLE must return through an app_private wrapper',
);

assert.match(
  migration,
  /select app_private\./i,
  'functions returning scalars must return through an app_private wrapper',
);

for (const target of targets) {
  assert.match(
    migration,
    new RegExp(`'${target}'`, 'i'),
    `${target} hedef listede bulunmali`,
  );
}

assert.match(
  migration,
  /grant execute on function public\./i,
  'the existing public RPC contract must be kept for anon/authenticated',
);

console.log('PASS Supabase remaining anon definer private wrappers contract kept');
