import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')
const source = readFileSync(
  path.join(rootDir, 'src', 'pages', 'fansubYonet', 'FansubYonetOverviewTab.tsx'),
  'utf8',
)

assert.match(source, /export\s+default\s+function\s+FansubYonetOverviewTab\b/, 'FansubYonetOverviewTab must keep the main tab component.')
assert.match(source, /getFansubManageOverviewCockpit/, 'FansubYonetOverviewTab must fetch cockpit metrics.')
assert.match(source, /QuickActionsPanel/, 'FansubYonetOverviewTab must render the quick action panel.')
assert.doesNotMatch(source, /function\s+formatDonationDate\b/, 'Bagis operasyonu artik Genel Bakis yerine ayri takviye akisinda durmali.')
assert.doesNotMatch(source, /listFansubDonationActivity/, 'the donation list must leave the Overview tab.')
assert.match(source, /<AttentionPanel/, 'Overview operasyonel dikkat panelini render etmeli.')
// Studyo v2: saglik paneli ana metrik seridi + buyume grafigine bolundu.
assert.match(source, /<KpiRow/, 'Overview must render the main metric strip.')
assert.match(source, /<GrowthPanel/, 'Overview buyume grafigini render etmeli.')
assert.match(source, /<ServerPanel community={community}/, 'Overview must show the community v2 server summary.')
assert.match(source, /<PipelinePanel/, 'Overview pipeline panelini render etmeli.')

console.log('PASS fansub admin overview tab keeps the operational split contract')
