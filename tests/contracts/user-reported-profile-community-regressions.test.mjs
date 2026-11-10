import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/*
 * User-reported profile / report regressions. The old community post feed
 * (community_posts) was removed entirely on 2026-11-01: no post tab on the profile,
 * report targets are only manga / chapter / comment / list comment / user.
 */

const rootDir = process.cwd()

function read(relativePath) {
  return readFileSync(path.join(rootDir, relativePath), 'utf8')
}

const profileEditActions = read('src/pages/profile/useProfileEditActions.ts')
const profilePage = read('src/pages/ProfilePage.tsx')
const profileTypes = read('src/pages/profile/types.ts')
const profileDataLoaders = read('src/pages/profile/profileDataLoaders.ts')
const reportModeration = read('src/services/reportService/moderation.ts')
const reportReviewModal = read('src/components/common/ReportReviewModal/ReportReviewModal.tsx')
const reportShared = read('src/services/reportService/shared.ts')
const reportTargets = read('src/services/reportService/targets.ts')
const notificationPresets = read('src/services/notificationService/presets.ts')

assert.match(profileEditActions, /targetSlotLimit <= 0/)
assert.match(profileEditActions, /Premium gerekir/)

// The profile does not read / show old posts.
assert.doesNotMatch(profileTypes, /communityPosts/)
assert.doesNotMatch(profileDataLoaders, /listProfileCommunityPosts|communityService/)
assert.doesNotMatch(profilePage, /ProfileCommunityPosts/)

assert.match(notificationPresets, /sendReportContentRemovedNotification/)
assert.match(notificationPresets, /sendReportResolvedReporterNotification/)
assert.match(reportModeration, /notifyReportDeactivation/)
assert.match(reportReviewModal, /reportReporterId = activeReport\.reporter_id/)
assert.match(reportReviewModal, /reporterId: reportReporterId/)
assert.match(reportReviewModal, /targetOwnerId: targetContext\?\.ownerId/)
assert.match(reportShared, /ownerColumn: 'author_id'/)
assert.doesNotMatch(reportShared, /community_posts|community_comments/)
assert.doesNotMatch(reportTargets, /community_posts|community_comments/)

console.log('PASS user reported profile/community regressions')
