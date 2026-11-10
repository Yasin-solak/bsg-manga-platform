import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')

const governanceSource = readFileSync(path.join(rootDir, 'src', 'lib', 'fansubBoostCapabilityGovernance.ts'), 'utf8')
const tierConstantsSource = readFileSync(path.join(rootDir, 'src', 'pages', 'fansub', 'fansubBoostConstants.ts'), 'utf8')
const detailDerivedSource = readFileSync(path.join(rootDir, 'src', 'pages', 'fansub', 'useFansubDetailDerived.ts'), 'utf8')
const hoverCardSource = readFileSync(path.join(rootDir, 'src', 'components', 'common', 'FansubHoverCard.tsx'), 'utf8')
const fansubCardSource = readFileSync(path.join(rootDir, 'src', 'components', 'common', 'FansubCard.tsx'), 'utf8')
const chapterCreditSource = readFileSync(path.join(rootDir, 'src', 'components', 'fansub', 'chapterCreditPresentation.ts'), 'utf8')
const adminBoostSource = readFileSync(path.join(rootDir, 'src', 'components', 'admin', 'sections', 'AdminBoostSection.tsx'), 'utf8')
const adminBoostSharedSource = readFileSync(path.join(rootDir, 'src', 'components', 'admin', 'sections', 'adminBoost', 'adminBoostSection.shared.tsx'), 'utf8')
const migration162Source = readFileSync(
  path.join(rootDir, 'supabase', 'migrations', '20260410235907_fansub_boost_downgrade_surface_projection.sql'),
  'utf8',
)

assert.match(governanceSource, /canUploadStaticBackground/)
assert.match(governanceSource, /canUploadVideoBackground/)
assert.match(governanceSource, /hasFullNameStyle/)
assert.match(governanceSource, /hasChapterEndCredit/)

assert.match(detailDerivedSource, /resolveVisibleFansubBackground/)
assert.match(detailDerivedSource, /resolveVisibleFansubNameStyle/)
assert.match(hoverCardSource, /resolveVisibleFansubBackground/)
assert.match(hoverCardSource, /resolveVisibleFansubNameStyle/)
assert.match(fansubCardSource, /resolveVisibleFansubBackground/)
assert.match(chapterCreditSource, /canRenderFansubChapterEndCredit/)
assert.match(adminBoostSource, /adminBoostSection\.shared/)
assert.match(adminBoostSharedSource, /getFansubBoostDowngradeRule/)

assert.match(migration162Source, /has_full_name_style boolean/)
assert.match(migration162Source, /can_upload_static_background boolean/)
assert.match(migration162Source, /can_upload_video_background boolean/)
assert.match(migration162Source, /public\.fansub_has_boost_capability\(f\.id, 'hasFullNameStyle'\)/)
assert.match(migration162Source, /public\.fansub_has_boost_capability\(f\.id, 'canUploadStaticBackground'\)/)
assert.match(migration162Source, /public\.fansub_has_boost_capability\(f\.id, 'canUploadVideoBackground'\)/)

assert.match(tierConstantsSource, /buildBoostTierCatalog/)
assert.match(tierConstantsSource, /normalizeFansubBoostCapabilityPolicies/)
assert.match(tierConstantsSource, /placementType === 'tier'/)
assert.match(tierConstantsSource, /placementType === 'core'/)
assert.match(governanceSource, /resolutionState !== 'resolved'/)
assert.match(governanceSource, /return isVideoBackground \? canUseVideoBackground : canUseStaticBackground/)
assert.match(governanceSource, /return capabilities\?\.hasFullNameStyle === true/)
assert.match(governanceSource, /return capabilities\?\.hasChapterEndCredit === true/)

console.log('PASS fansub boost downgrade and tier redistribution scenarios kept')
