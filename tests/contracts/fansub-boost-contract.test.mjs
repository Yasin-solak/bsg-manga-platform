import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')

const boostServiceSource = readFileSync(path.join(rootDir, 'src', 'services', 'fansubBoostService.ts'), 'utf8')
const statusBarSource = readFileSync(path.join(rootDir, 'src', 'components', 'fansub', 'FansubBoostStatusBar.tsx'), 'utf8')
const supporterPreviewSource = readFileSync(path.join(rootDir, 'src', 'components', 'fansub', 'FansubSupporterPreview.tsx'), 'utf8')
const detailPageSource = readFileSync(path.join(rootDir, 'src', 'pages', 'FansubDetailPage.tsx'), 'utf8')
const controllerSource = readFileSync(path.join(rootDir, 'src', 'pages', 'fansub', 'useFansubDetailController.ts'), 'utf8')

assert.match(boostServiceSource, /current_tier_floor_power/)
assert.match(boostServiceSource, /next_tier_level/)
assert.match(boostServiceSource, /next_tier_required_power/)
assert.match(boostServiceSource, /next_tier_remaining_power/)
assert.match(boostServiceSource, /tier_progress_percent/)
assert.match(boostServiceSource, /tierHeadline/)
assert.match(boostServiceSource, /currentBenefits/)
assert.match(boostServiceSource, /nextTierBenefits/)
assert.match(boostServiceSource, /rewardSummary/)
assert.match(boostServiceSource, /rewardHighlights/)

assert.doesNotMatch(statusBarSource, /NEXT_TIER_THRESHOLDS/)
assert.match(statusBarSource, /snapshot\.tierProgressPercent/)
assert.match(statusBarSource, /snapshot\.nextTierLevel/)

assert.match(supporterPreviewSource, /canRenderFansubSupporterSummary/)
assert.match(supporterPreviewSource, /if \(!snapshot \|\| snapshot\.activeSupporterCount <= 0 \|\| !canShowSupporterSummary\) return null/)
assert.match(supporterPreviewSource, /resolveFansubBoostSupporterStatusLine/)
assert.doesNotMatch(supporterPreviewSource, /canUseSupporterList === true/)
assert.match(detailPageSource, /state:\s*\{\s*from:/)

assert.match(controllerSource, /setBoostSnapshot\(null\)/)
assert.match(controllerSource, /setSupporterPreview\(\[\]\)/)
assert.match(controllerSource, /setIsBoostDialogOpen\(false\)/)

console.log('PASS fansub boost contract and state flow kept')
