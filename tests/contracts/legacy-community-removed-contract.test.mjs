import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/*
 * The old community post feed (community_posts, /discussion) was fully removed with its data on
 * 2026-11-01 by user decision; community is only the new system
 * (community_v2: server / channel / message, /topluluk).
 * This contract prevents the old feed from silently returning (replacing the earlier
 * community-create-composer, community-detail-density, community-page-redesign
 * and community-rich-detail-platform contracts).
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')
const read = (relativePath) => readFileSync(path.join(rootDir, relativePath), 'utf8')

for (const removed of [
  'src/services/communityService.ts',
  'src/services/communityService',
  'src/pages/community',
  'src/pages/communityDetail',
  'src/pages/CommunityDetailPage.tsx',
  'src/components/common/CommunityCreateModal',
  'src/components/community/CommunityPostCard.tsx',
  'src/components/home/HomeCommunityCorner.tsx',
  'src/pages/fansub/tabs/FansubPostsTab.tsx',
  'src/pages/fansubYonet/FansubYonetPostsTab.tsx',
  'src/pages/profile/ProfileCommunityPosts.tsx',
  'src/components/admin/pending/AdminPendingPostDetail.tsx',
]) assert.equal(existsSync(path.join(rootDir, removed)), false, `${removed} must be removed`)

// No queries to old tables / RPCs remain in source.
const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const full = path.join(dir, name)
  return statSync(full).isDirectory() ? walk(full) : /\.(ts|tsx)$/.test(name) ? [full] : []
})
const legacyPattern = /from\('community_(posts|comments|post_\w+|comment_\w+)'\)|rpc\('(toggle_community_post_like|vote_community_post_poll|track_community_post_\w+|get_popular_community_tags|list_my_community_post_like_states|create_fansub_community_post|list_fansub_tagged_community_feed|get_fansub_manage_community_overview)'/
for (const file of walk(path.join(rootDir, 'src'))) {
  assert.doesNotMatch(readFileSync(file, 'utf8'), legacyPattern, `${path.relative(rootDir, file)} must not reach the old community table`)
}

// Old links go to the new community.
assert.match(read('src/App.tsx'), /<Route path='discussion\/\*' element=\{<Navigate to='\/topluluk' replace \/>\} \/>/)
assert.match(read('src/pages/CommunityPage.tsx'), /communityV2\/CommunityEntry/)

// No post type in the approval queue / reports / comment moderation.
assert.match(read('src/components/admin/pending/pendingSectionUtils.ts'), /export type PendingItemType = 'manga' \| 'chapter' \| 'fansub_request'/)
assert.doesNotMatch(read('src/services/reportService/types.ts'), /\| 'post'|\| 'comment'\n/)
assert.match(read('src/services/adminCommentModerationService/types.ts'), /export type AdminCommentModerationSource = 'manga' \| 'chapter' \| 'list'/)

console.log('PASS the old community post feed was removed (community_v2 only)')
