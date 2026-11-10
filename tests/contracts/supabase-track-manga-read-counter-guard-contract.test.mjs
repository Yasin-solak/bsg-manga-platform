import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  'supabase/migrations/20260520235916_track_manga_read_counter_guard_scope.sql',
  'utf8',
);

assert.match(
  migration,
  /current_setting\('app\.manga_read_counter_update', true\) = 'true'/i,
  'the approval guard must pass a metric update only with the track_manga_read flag',
);

assert.match(
  migration,
  /new\.total_views = old\.total_views \+ 1/i,
  'the guard must accept only a single full view increment',
);

assert.match(
  migration,
  /\(to_jsonb\(new\) - 'total_views'\) = \(to_jsonb\(old\) - 'total_views'\)/i,
  'no other manga column must change during the counter bypass',
);

assert.match(
  migration,
  /set_config\('app\.manga_read_counter_update', 'true', true\)/i,
  'track_manga_read must set a transaction-local flag before the counter update',
);

assert.match(
  migration,
  /set_config\('app\.manga_read_counter_update', '', true\)/i,
  'track_manga_read counter update sonrasinda transaction-local bayragi temizlemeli',
);

assert.match(
  migration,
  /revoke execute on function app_private\.track_manga_read\(uuid, uuid, numeric, text\) from public;/i,
  'Private definer fonksiyonda PUBLIC EXECUTE geri gelmemeli',
);

console.log('PASS Supabase track_manga_read counter guard contract kept');
