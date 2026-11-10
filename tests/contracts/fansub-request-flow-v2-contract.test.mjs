import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')

function readSource(relativePath) {
  return readFileSync(path.join(rootDir, relativePath), 'utf8')
}

const requiredFiles = [
  'src/components/common/FansubRequestModal/fansubRequestModal.shared.ts',
  'src/components/common/FansubRequestModal/FansubRequestStepNav.tsx',
  'src/components/common/FansubRequestModal/FansubRequestPreview.tsx',
  'src/components/common/FansubRequestModal/FansubRequestSteps.tsx',
]

for (const relativePath of requiredFiles) {
  assert.equal(existsSync(path.join(rootDir, relativePath)), true, `${relativePath} bulunamadi`)
}

const modalSource = readSource('src/components/common/FansubRequestModal/FansubRequestModal.tsx')
const sharedSource = readSource('src/components/common/FansubRequestModal/fansubRequestModal.shared.ts')
const previewSource = readSource('src/components/common/FansubRequestModal/FansubRequestPreview.tsx')
const stepsSource = readSource('src/components/common/FansubRequestModal/FansubRequestSteps.tsx')
const adminDetailSource = readSource('src/components/admin/pending/AdminPendingDetailContent.tsx')
const requestServiceSource = readSource('src/services/fansubService/requests.ts')

assert.match(modalSource, /FansubRequestPreview/)
assert.match(modalSource, /FansubRequestStepNav/)
assert.match(modalSource, /lg:grid-cols-\[minmax\(0,1fr\)_340px\]/)
assert.match(modalSource, /FANSUB_AVATAR_ALLOWED_TYPES/)
assert.match(modalSource, /FANSUB_AVATAR_MAX_BYTES/)
assert.match(modalSource, /buildFansubRequestMeta/)
assert.match(modalSource, /name\.trim\(\)\.length > FANSUB_NAME_MAX_LENGTH/)

assert.match(sharedSource, /createInitialFansubRequestDraft/)
assert.match(sharedSource, /getDraftCompletion/)
assert.match(sharedSource, /buildFansubRequestMeta/)
assert.match(sharedSource, /FANSUB_AVATAR_MAX_BYTES = 2 \* 1024 \* 1024/)

assert.match(previewSource, /Canlı Önizleme/)
assert.match(previewSource, /Başvuru doluluğu/)
assert.match(previewSource, /Adminin göreceği başvuru özeti/)

assert.match(stepsSource, /maxLength=\{FANSUB_NAME_MAX_LENGTH\}/)
assert.match(stepsSource, /maxLength=\{FANSUB_DESCRIPTION_MAX_LENGTH\}/)
assert.match(stepsSource, /FANSUB_RULES_PATH/)
assert.match(stepsSource, /COPYRIGHT_POLICY_PATH/)
assert.match(stepsSource, /ENFORCEMENT_POLICY_PATH/)
assert.match(stepsSource, /DMCA ve telif beyanı/)

assert.match(adminDetailSource, /FansubRequestMetaPanel/)
assert.match(adminDetailSource, /Ba(s|\u015f)vuru (Metaverisi|bilgileri)/)
assert.match(adminDetailSource, /requestMeta\?\.dmcaAccepted/)
assert.match(adminDetailSource, /meta\.weeklyReleaseGoal/)
assert.match(adminDetailSource, /meta\.contentTypes/)
assert.match(adminDetailSource, /meta\.focusGenres/)
assert.match(adminDetailSource, /meta\.teamRolesNeeded/)

assert.match(requestServiceSource, /isE2EModeEnabled/)
assert.match(requestServiceSource, /createE2EMockFansubRequest/)
assert.match(requestServiceSource, /getE2EMockAuthUser\(\)\?\.id === input\.requesterUserId/)
assert.doesNotMatch(requestServiceSource, /requesterUserId\.startsWith\('e2e-'\)/)

console.log('PASS fansub creation v2 modal, preview and admin requestMeta contract kept')
