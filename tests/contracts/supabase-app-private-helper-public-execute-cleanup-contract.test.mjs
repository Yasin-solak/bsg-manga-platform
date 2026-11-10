import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  'supabase/migrations/20260520235918_app_private_helper_public_execute_cleanup.sql',
  'utf8',
);

assert.match(
  migration,
  /alter default privileges for role postgres in schema app_private\s+revoke execute on functions from public;/i,
  'the PUBLIC EXECUTE default must close on future app_private functions',
);

assert.match(
  migration,
  /has_function_privilege\('public', p\.oid, 'EXECUTE'\)/i,
  'Mevcut PUBLIC EXECUTE tasiyan app_private fonksiyonlar hedeflenmeli',
);

assert.match(
  migration,
  /revoke execute on function app_private\./i,
  'app_private fonksiyonlardan PUBLIC EXECUTE kaldirilmali',
);

assert.match(
  migration,
  /grant execute on function app_private\..+to anon, authenticated, service_role/is,
  'explicit execute permission for API roles must be kept for RLS and wrapper calls',
);

console.log('PASS Supabase app_private helper public execute cleanup contract kept');
