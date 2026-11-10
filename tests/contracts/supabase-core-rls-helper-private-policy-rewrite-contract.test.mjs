import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  'supabase/migrations/20260520235908_core_rls_helper_private_policy_rewrite.sql',
  'utf8',
);

const helpers = [
  ['is_admin', ''],
  ['can_manage_moderation_state', ''],
  ['current_public_user_id', ''],
  ['is_fansub_admin', 'uuid'],
  ['is_fansub_staff', 'uuid'],
];

assert.match(
  migration,
  /create schema if not exists app_private;/i,
  'app_private semasi hazirlanmali',
);

assert.match(
  migration,
  /from pg_policy pol[\s\S]*join pg_namespace n[\s\S]*pg_get_expr/i,
  'policy expressions must be rewritten via live metadata',
);

assert.match(
  migration,
  /alter policy %I on %I\.%I/i,
  'the policy alter must quote schema and table names',
);

assert.match(
  migration,
  /regexp_replace\(v_(using|check), 'public\\\.is_fansub_staff/i,
  'Storage policy ifadelerindeki public helper referanslari da yakalanmali',
);

assert.ok(
  migration.includes("(^|[^[:alnum:]_\\.])is_admin[[:space:]]*\\("),
  'Unqualified helper cagrilari da app_private semasina alinmali',
);

for (const [helperName, signature] of helpers) {
  assert.match(
    migration,
    new RegExp(`create or replace function app_private\\.${helperName}\\(`, 'i'),
    `${helperName} must be defined in the app_private schema`,
  );

  assert.match(
    migration,
    new RegExp(`grant execute on function app_private\\.${helperName}\\(${signature}\\) to anon, authenticated, service_role;`, 'i'),
    `${helperName} must be executable by RLS policy roles`,
  );

  assert.match(
    migration,
    new RegExp(`revoke execute on function public\\.${helperName}\\(${signature}\\) from anon, authenticated, public;`, 'i'),
    `${helperName} public direct RPC yuzeyinden kaldirilmali`,
  );
}

assert.ok(
  migration.includes('n.nspname as schema_name') && migration.includes('from pg_policy pol'),
  'the rewrite must be schema-aware to also cover non-public schemas',
);

console.log('PASS Supabase core RLS helper private policy rewrite contract kept');
