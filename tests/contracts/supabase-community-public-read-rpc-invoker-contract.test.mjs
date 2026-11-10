import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  'supabase/migrations/20260520235910_community_public_read_rpc_invoker.sql',
  'utf8',
);

const functions = [
  'get_community_post_asset',
  'get_community_post_assets',
  'get_community_post_poll',
];

for (const functionName of functions) {
  assert.match(
    migration,
    new RegExp(`alter function public\\.${functionName}\\(uuid\\) security invoker;`, 'i'),
    `${functionName} must be an RLS-controlled invoker`,
  );

  assert.match(
    migration,
    new RegExp(`grant execute on function public\\.${functionName}\\(uuid\\) to anon, authenticated;`, 'i'),
    `${functionName} must keep working as a public read endpoint`,
  );
}

assert.doesNotMatch(
  migration,
  /get_community_post_reaction_summary|track_community_post_view|track_community_post_share/i,
  'aggregate and write-tracking community RPCs must not change in this batch',
);

console.log('PASS Supabase community public read RPC invoker contract kept');
