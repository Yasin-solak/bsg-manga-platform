import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

/*
 * Support requests v2 (reply desk):
 * - The summary strip shows real status counts ("awaiting reply" used to count only
 * 20 records on the open page) and works as a status filter.
 * - The desk opens with those awaiting reply; "next awaiting reply" after replying.
 * - The requester gets a notification when a reply is saved (no notice used to go out).
 */
const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

const service = read('src/services/supportRequestService.ts')
assert.match(service, /export async function countSupportRequestsByStatus\(signal\?: AbortSignal\)/)
assert.match(service, /const statuses = \['open', 'answered', 'closed'\] as const/)
assert.match(service, /\.select\('id', \{ count: 'exact', head: true \}\)\.eq\('status', status\)/, 'counted over all requests')

const section = read('src/components/admin/sections/AdminSupportSection.tsx')
assert.match(section, /useState<AdminSupportFilter>\(\{ page: 0, search: '', status: 'open', category: 'all' \}\)/, 'the desk opens with those awaiting a reply')
assert.match(section, /countSupportRequestsByStatus\(controller\.signal\)/)
assert.doesNotMatch(section, /Bu sayfadaki talepler/, 'no misleading per-page counter')
assert.match(section, /data-testid="admin-support-next"/, 'next one awaiting a reply')
assert.match(section, /<AdminSupportDetail/)

const sql = read('supabase/migrations/20261101110000_support_reply_notify.sql').replace(/^\s*--.*$/gm, '')
assert.match(sql, /select u\.id into v_user from public\.users u where u\.auth_user_id = new\.user_id;/, 'auth identity -> public user')
assert.match(sql, /'route_hint', '\/ayarlar\?bolum=destek'/)
assert.match(sql, /after update of admin_response on public\.support_requests/)
assert.match(sql, /revoke all on function support_internal\.notify_reply\(\) from public, anon, authenticated;/)

console.log('PASS support requests v2 (real counts, reply desk, reply notification)')
