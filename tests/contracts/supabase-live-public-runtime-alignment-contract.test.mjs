import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  'supabase/migrations/20260520235921_live_public_runtime_permission_alignment.sql',
  'utf8',
);

assert.match(
  migration,
  /create or replace view public\.public_user_directory\s+with \(security_invoker = true\)/i,
  'Public user directory security_invoker kalmali',
);

assert.match(
  migration,
  /app_private\.resolve_user_active_fansub_identity_tag\(u\.id\)/i,
  'the fansub identity label must resolve with an app_private wrapper instead of a public definer helper',
);

assert.match(
  migration,
  /app_private\.get_profile_view_access\(u\.id\)/i,
  'profile visibility must read via app_private projection instead of a public helper chain',
);

assert.doesNotMatch(
  migration,
  /public\.is_admin\(\)|public\.resolve_user_active_fansub_identity_tag|public\.fansub_has_boost_capability|public\.is_chapter_publicly_unlocked/i,
  'the new public runtime migration must not bring back public direct-helper calls',
);

assert.match(
  migration,
  /app_private\.fansub_has_boost_capability\(f\.id, 'hasFullNameStyle'\)/i,
  'Homepage/fansub boost projection app_private helper kullanmali',
);

assert.match(
  migration,
  /app_private\.is_chapter_publicly_unlocked\(c\.publish_at\)/i,
  'Fansub manga sayaci public unlock helperini app_private wrapper uzerinden okumali',
);

assert.match(
  migration,
  /app\.community_post_view_counter_update/i,
  'the community view counter must be guarded with a narrow transaction-local flag',
);

assert.match(
  migration,
  /and \(to_jsonb\(new\) - 'views_count' - 'updated_at'\) = \(to_jsonb\(old\) - 'views_count' - 'updated_at'\)/i,
  'the moderation guard must only allow views_count and updated_at changes',
);




console.log('PASS Supabase live public runtime alignment contract kept');
