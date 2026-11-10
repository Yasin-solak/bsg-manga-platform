import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  'supabase/migrations/20260520235915_app_private_definer_execute_scope.sql',
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
  /alter default privileges for role postgres in schema app_private\s+revoke execute on functions from public;/i,
  'the PUBLIC EXECUTE default must close for future app_private functions',
);

assert.match(
  migration,
  /revoke execute on function app_private\./i,
  'Mevcut private definer govdelerde PUBLIC EXECUTE kapatilmali',
);

assert.match(
  migration,
  /grant execute on function app_private\..+to anon, authenticated, service_role/is,
  'Gerekli API rolleri explicit execute yetkisini korumali',
);

for (const target of targets) {
  assert.match(
    migration,
    new RegExp(`'${target}'`, 'i'),
    `${target} private execute scope hedef listesinde bulunmali`,
  );
}

console.log('PASS Supabase app_private definer execute scope contract kept');
