import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/*
 * Admin > Community (v2, 2026-11-01): site management of the new community system (community_v2:
 * server / channel / message). The moderation desk built on the old post feed
 * (community_posts) was removed.
 * Protected intent:
 * - Only a site admin (is_admin) can call it; all reads/writes go through one
 * safe RPC (public.community_v2_admin -> community_v2.admin_api).
 * - Interventions produce the same result as the server's own rules and are written to the action
 * history with a "site_admin" marker; nobody is notified.
 * - Report decisions and archive use version control; two admins deciding
 * at once do not overwrite each other.
 * - Member actions do not apply to the server owner (archive the server if needed).
 * - Desk layout: screen height, paged list, details on the right / drawer on narrow screens.
 * - Operations (quotas, background jobs) moved from Operations to Community.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')
const read = (relativePath) => readFileSync(path.join(rootDir, relativePath), 'utf8')
const dir = 'src/components/admin/sections/community'

// Eski gonderi moderasyonu parcalari kaldirildi.
for (const removed of [
  `${dir}/AdminCommunityPostDetail.tsx`,
  `${dir}/CommunityModerationDialogs.tsx`,
  `${dir}/adminCommunityUtils.ts`,
  'src/pages/admin/useAdminCommunityHandlers.ts',
  'src/components/admin/ops/AdminCommunityOperations.tsx',
]) assert.equal(existsSync(path.join(rootDir, removed)), false, `${removed} must be removed`)

const section = read('src/components/admin/sections/AdminCommunitySection.tsx')
const servers = read(`${dir}/CommunityServersDesk.tsx`)
const serverDetail = read(`${dir}/CommunityServerDetail.tsx`)
const reports = read(`${dir}/CommunityReportsDesk.tsx`)
const dialogs = read(`${dir}/CommunityActionDialogs.tsx`)
const operations = read(`${dir}/CommunityOperationsPanel.tsx`)
const service = read('src/services/communityAdminService.ts')
const migration = read('supabase/migrations/20261101160000_community_v2_admin.sql')
const adminPage = read('src/pages/AdminPage.tsx')
const ops = read('src/components/admin/AdminOpsSection.tsx')
const nav = read('src/pages/admin/adminNavigation.ts')

// The section is tied to the new system; the old post service / type is not used.
assert.doesNotMatch(section, /communityService|CommunityPost\b/)
assert.match(section, /communityAdmin\.overview/)
for (const tab of ['servers', 'reports', 'operations']) assert.match(section, new RegExp(`id: '${tab}'`))
assert.match(section, /admin-community-strip-reports/)
assert.match(section, /useCommunityAvailability\(\)/)
assert.match(section, /onOpenReportsChange\?\.\(value\.reports_open\)/)
assert.match(adminPage, /<AdminCommunitySection\s+flagsHref=[\s\S]*?onOpenReportsChange=\{setCommunityOpenReports\}\s*\/>/)

// Sidebar badge: open message reports (not pending posts).
assert.match(nav, /badge: communityOpenReportCount/)
assert.doesNotMatch(nav, /communityPendingCount/)

// Isletim Topluluk'ta; Operasyon artik icermez.
assert.doesNotMatch(ops, /AdminCommunityOperations/)
assert.match(section, /<CommunityOperationsPanel/)
assert.match(operations, /communityOperations\(draft\)/)
assert.match(operations, /dirty\.current \? previous : value\.config/)

// One RPC, server-side pagination and an error message filter.
assert.match(service, /supabase\.rpc\('community_v2_admin'/)
assert.match(service, /\['P0001', '42501', '22023'\]\.includes/)
for (const action of ['overview', 'servers', 'server', 'members', 'reports', 'decide_report', 'delete_message', 'moderate', 'archive']) {
  assert.match(service, new RegExp(`call\\('${action}'`), `${action} servisi`)
  assert.match(migration, new RegExp(`'${action}'`), `${action} eylemi`)
}

// Database: site admin only, safe search path, anon closed.
assert.match(migration, /security definer/i)
assert.match(migration, /set search_path(?: to|\s*=)\s*''/i)
assert.match(migration, /not public\.is_admin\(\)/)
assert.match(migration, /revoke all on function public\.community_v2_admin\(text, jsonb\) from public, anon/i)
assert.match(migration, /'site_admin', true/)
assert.match(migration, /version[\s\S]{0,80}p->>'version'/)
assert.match(migration, /community_v2\.emit\(/)
assert.doesNotMatch(migration, /insert into public\.notifications/i, 'site admin intervention produces no notification')

// Servers desk: paged list + type / sort + details; a drawer on narrow screens.
assert.match(servers, /const PAGE_SIZE = 20/)
assert.match(servers, /xl:grid-rows-\[minmax\(0,1fr\)\]/)
assert.match(servers, /onOpenAutoFocus=\{focusSheetContainer\}/)
assert.match(servers, /onKeyDown=\{handleListKey\}/)

// Server details: tabs, paged members, no member action on the owner, archive dialog.
for (const tab of ['overview', 'members', 'audit']) assert.match(serverDetail, new RegExp(`'${tab}'`))
assert.match(serverDetail, /const MEMBER_PAGE = 25/)
assert.match(serverDetail, /member\.is_owner \? null : \(/)
assert.match(serverDetail, /<ArchiveDialog/)
assert.match(serverDetail, /site_admin \?/)
assert.match(serverDetail, /\/topluluk\?sunucu=\$\{current\.id\}/)

// Reports: status tabs, remove + resolve order, a deep link to the channel.
for (const status of ['open', 'resolved', 'dismissed']) assert.match(reports, new RegExp(`\\['${status}', `))
assert.match(reports, /if \(mode === 'delete' && !report\.message\.deleted_at\) await communityAdmin\.deleteMessage\(report\.message\.id\)\s+await communityAdmin\.decideReport\(/)
assert.match(reports, /\/topluluk\?sunucu=\$\{report\.server\.id\}&kanal=\$\{report\.channel\.id\}/)
assert.match(reports, /canModerateAuthor = Boolean\(authorState && !authorState\.is_owner\)/)
assert.match(reports, /xl:grid-rows-\[minmax\(0,1fr\)\]/)

// Pencereler: tasmayan aciklama, sonucu once soyler, bildirim gitmedigini belirtir.
assert.match(dialogs, /grid-cols-\[minmax\(0,1fr\)\]/)
assert.match(dialogs, /line-clamp-2 \[overflow-wrap:anywhere\]/)
assert.match(dialogs, /bildirim gitmez/)
for (const testId of ['admin-community-member-dialog', 'admin-community-archive-dialog', 'admin-community-report-dialog']) assert.match(dialogs, new RegExp(testId))

console.log('PASS admin community v2 (community_v2 site management) contract kept')
