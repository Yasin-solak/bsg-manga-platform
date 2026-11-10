import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n')

// Fansub studio v2: the community tab manages the community v2 server instead of the old post feed.
const migration = read('supabase/migrations/20261030120000_fansub_manage_community_v2_summary.sql')
assert.match(migration, /create or replace function public\.get_fansub_manage_community_v2\(p_fansub_id uuid\)/)
assert.match(migration, /app_private\.fansub_staff_topluluk\(p_fansub_id\)/, 'the server summary is tied to panel.topluluk permission')
assert.match(migration, /revoke all on function public\.get_fansub_manage_community_v2\(uuid\) from public, anon;/)
assert.doesNotMatch(migration.replace(/^\s*--.*$/gm, ''), /community_v2\.actor\(\)/, 'the summary must return with community off too (actor raises an error)')

const nav = read('src/pages/fansubYonet/fansubStudioNavigation.ts')
assert.match(nav, /topluluk: 'panel\.topluluk'/)
assert.doesNotMatch(nav, /id: 'postlar'/, 'the old post tab left navigation')
const state = read('src/pages/fansubYonet/useFansubYonetState.ts')
assert.match(state, /rawValue === 'postlar' \? 'topluluk'/, 'old #postlar links redirect to the community tab')

const tab = read('src/pages/fansubYonet/FansubYonetCommunityTab.tsx')
assert.match(tab, /allowedManagementTabs\(server\)/, 'embedded admin uses server role permissions')
assert.match(tab, /communityV2\.write\('create_server', \{ fansub_id: fansubId \}\)/)
assert.doesNotMatch(tab, /FansubYonetPostsTab|LegacyArchive/, 'the old post archive was removed')

const page = read('src/pages/FansubYonetPage.tsx')
assert.match(page, /getFansubManageCommunityV2\(id\)/)
assert.match(page, /<FansubYonetCommunityTab/)
assert.match(page, /pendingCommunity=\{pendingCommunity\}/, 'server pending items are reflected on the sidebar badge')

// The reported and removed chapter/series fix queue is above the Chapters tab.
assert.match(page, /<FansubReportedContentPanel fansubId=\{id\} canFix=\{canCreateContent\}/)
const reported = read('src/pages/fansubYonet/FansubReportedContentPanel.tsx')
assert.match(reported, /listFansubReportedContent\(fansubId, 'open'\)/)
assert.match(reported, /<ReportedChapterFixDialog/)
// The tab title is in one place (page top).
const header = read('src/pages/fansubYonet/FansubYonetHeader.tsx')
assert.match(header, /<h1/)

console.log('PASS fansub studio v2 (community v2 server tab, reported content, single title)')
