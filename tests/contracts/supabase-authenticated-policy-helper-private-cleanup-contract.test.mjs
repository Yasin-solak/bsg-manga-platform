import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  'supabase/migrations/20260520235912_authenticated_policy_helper_private_cleanup.sql',
  'utf8',
);

const privateHelpers = [
  ['can_write_pending_community_post_child', 'uuid'],
  ['can_write_pending_community_poll_child', 'uuid'],
  ['is_current_user_premium_active', ''],
];

for (const [name, signature] of privateHelpers) {
  assert.match(
    migration,
    new RegExp(`create or replace function app_private\\.${name}\\(`, 'i'),
    `${name} app_private semasina alinmali`,
  );

  assert.match(
    migration,
    new RegExp(`grant execute on function app_private\\.${name}\\(${signature}\\) to authenticated, service_role;`, 'i'),
    `${name} must be executable by policy roles`,
  );

  assert.match(
    migration,
    new RegExp(`revoke execute on function public\\.${name}\\(${signature}\\) from anon, authenticated, public;`, 'i'),
    `${name} public direct RPC yuzeyinden kaldirilmali`,
  );
}

assert.match(
  migration,
  /from pg_policy pol[\s\S]*join pg_namespace n/i,
  'public and storage policy expressions must be rewritten via metadata',
);

assert.match(
  migration,
  /app_private\.can_write_pending_community_post_child/i,
  'Community post child policy helper app_private kullanmali',
);

assert.match(
  migration,
  /app_private\.is_current_user_premium_active/i,
  'Premium storage policy helper app_private kullanmali',
);

assert.match(
  migration,
  /revoke execute on function public\.is_fansub_staff_of_user\(uuid\) from anon, authenticated, public;/i,
  'an unused staff-of-user helper must not be a direct authenticated RPC',
);

console.log('PASS Supabase authenticated policy helper private cleanup contract kept');
