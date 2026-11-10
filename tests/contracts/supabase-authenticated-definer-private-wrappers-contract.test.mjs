import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  'supabase/migrations/20260520235917_authenticated_definer_private_wrappers.sql',
  'utf8',
);

assert.match(
  migration,
  /has_function_privilege\('authenticated', p\.oid, 'EXECUTE'\)/i,
  'definer functions executable by the authenticated role must be targeted',
);

assert.match(
  migration,
  /p\.prorettype not in \('trigger'::regtype, 'event_trigger'::regtype\)/i,
  'RPC olmayan trigger donuslu fonksiyonlar wrapper batchinden dislanmali',
);

assert.match(
  migration,
  /pg_get_functiondef\(p\.oid\)/i,
  'Mevcut govde canli function definition uzerinden kopyalanmali',
);

assert.match(
  migration,
  /CREATE OR REPLACE FUNCTION app_private\./i,
  'Definer govde app_private semasina tasinmali',
);

assert.match(
  migration,
  /security invoker/i,
  'the public RPC surface must be an invoker wrapper',
);

assert.match(
  migration,
  /revoke execute on function public\..+from public, anon, authenticated/is,
  'public wrapper grants must clear old broad permissions',
);

assert.match(
  migration,
  /if r\.anon_execute then[\s\S]+grant execute on function public\..+to anon/i,
  'anon execute must be kept if present in the old state',
);

assert.match(
  migration,
  /if r\.authenticated_execute then[\s\S]+grant execute on function public\..+to authenticated/i,
  'the authenticated execute contract must be kept',
);

assert.match(
  migration,
  /revoke execute on function app_private\..+from public, anon, authenticated/is,
  'Private definer govdelerde default PUBLIC EXECUTE kalmamali',
);

console.log('PASS Supabase authenticated definer private wrappers contract kept');
