/**
 * Security score contract.
 *
 * The score's only job is to give trust. A miscalculated score or one detached from its
 * source is worse than none: it shows green and nobody looks. This file protects two
 * things: calculation accuracy and the record staying IN SYNC with the UI.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')
const read = (relativePath) => readFileSync(path.join(rootDir, relativePath), 'utf8')

function loadModule(relativePath) {
  const { outputText } = ts.transpileModule(read(relativePath), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  })
  const shim = { exports: {} }
  new Function('module', 'exports', 'require', outputText)(shim, shim.exports, () => ({}))
  return shim.exports
}

const stripComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const score = loadModule('src/lib/securityScore.ts')

// ---------- A) Calculation ----------
// With no open finding the score must be full: ACCEPTED findings do not lower points.
// This is the heart of the design: 94 of 103 advisor findings are deliberate design.
assert.deepEqual(
  score.computeSecurityScore({ openFindings: [], openCriticalAlerts: 0, openHighAlerts: 0 }),
  { score: 100, lines: [], band: 'iyi' },
  'with no open finding the score must be 100',
)

const withHigh = score.computeSecurityScore({
  openFindings: [{ key: 'x', severity: 'yuksek', label: 'Test bulgusu' }],
  openCriticalAlerts: 0,
  openHighAlerts: 0,
})
assert.equal(withHigh.score, 85, 'yuksek bulgu 15 puan dusurmeli')

// Every lost point must have a match in the LIST: the score is a door to the list, not a badge.
assert.equal(withHigh.lines.length, 1, 'each penalty must produce a row')
assert.equal(withHigh.lines[0].penalty, 15, 'satir cezayi tasimali')
assert.equal(withHigh.lines[0].kind, 'durus', 'posture and runtime must be split')

// ---------- B) Runtime cap ----------
// Without a cap one alarm storm would zero the score and hide a real regression
// on the posture side.
const storm = score.computeSecurityScore({
  openFindings: [],
  openCriticalAlerts: 50,
  openHighAlerts: 50,
})
assert.equal(storm.score, 100 - score.RUNTIME_PENALTY_CAP, 'the alarm penalty must be limited by the cap')
assert.ok(storm.score > 0, 'alarm firtinasi skoru sifirlamamali')

// Alarmlar TEK satirda toplanmali; 12 ayri satir listeyi kullanilamaz yapardi.
assert.equal(
  storm.lines.filter((line) => line.kind === 'calisma_zamani').length,
  1,
  'alarms must gather in one row',
)

// Skor asla negatife dusmemeli.
const worst = score.computeSecurityScore({
  openFindings: Array.from({ length: 20 }, (_, index) => ({ key: `k${index}`, severity: 'yuksek', label: `B${index}` })),
  openCriticalAlerts: 10,
  openHighAlerts: 10,
})
assert.equal(worst.score, 0, 'skor tabanda durmali')

// ---------- C) Modul SAF ----------
assert.doesNotMatch(
  stripComments(read('src/lib/securityScore.ts')),
  /\bfetch\(|\bwindow\b|\bdocument\b|supabase/,
  'the score module must not know network or browser',
)

// ---------- D) RECORD and UI must stay in sync ----------
// The audit record (JSON, human-facing) and the list read by the UI (TS) sit in separate
// files. Updating the record and forgetting the list would silently make the score
// a liar: the panel says "no open findings" while the record holds one.
const register = JSON.parse(read('docs/reports/security-accepted-findings.json'))
const findingsSource = read('src/lib/securityFindings.ts')

const registerOpenKeys = (register.acik_bulgular ?? []).map((item) => item.kural).sort()
const uiOpenKeys = [...findingsSource.matchAll(/key: '([^']+)'/g)].map((match) => match[1]).sort()

assert.deepEqual(
  uiOpenKeys,
  registerOpenKeys,
  'the open finding list must match the record (docs/reports/security-accepted-findings.json)',
)

// Each acceptance in the record must carry a REASON; an unreasoned acceptance turns the record into trash.
for (const accepted of register.kabul_edilenler ?? []) {
  assert.ok(accepted.gerekce && accepted.gerekce.length > 20, `an acceptance cannot lack a reason: ${accepted.kural}`)
  assert.ok(accepted.tarih, `an acceptance cannot lack a date: ${accepted.kural}`)
}

// ---------- E) The score must STATE its source date ----------
// Posture findings come from manual audits and are not live. Hiding this would
// show the user a stale number as if fresh.
const statusSection = read('src/components/admin/ops/AdminOpsStatusSection.tsx')
assert.match(statusSection, /SECURITY_AUDIT_DATE/, 'the audit date must show')
assert.match(statusSection, /canli degil/, 'skorun canli olmadigi yazmali')

// ---------- F) NO unmeasurable box ----------
// The first design had "system load 38%" and a "healthy" badge; neither had a
// source. A fake green badge undermines the panel's only job.
assert.doesNotMatch(
  stripComments(statusSection),
  /Sistem Yuku|sistemYuku|healthy|Healthy/,
  'kaynagi olmayan kutu eklenmemeli',
)

// ---------- G) Every number is a DOOR ----------
// Showing a stat and leaving it leaves the operator alone with "so where do I look
// now". Boxes and score rows must have actions.
// The box body moved to the shared `AdminOpsStatCard` (four tabs use the same box);
// the action field's TYPE is defined there. The pin follows the file because
// what is measured is that the box CAN CARRY an action, not where it is defined.
const statCard = read('src/components/admin/ops/AdminOpsStatCard.tsx')
assert.match(statCard, /action\?: \{ label: string; run: \(\) => void \}/, 'kutunun eylemi olabilmeli')
// An actionless box must not SILENTLY look clickable: with no action no arrow
// should render either, or a dead box imitates a door.
assert.match(
  stripComments(statCard),
  /\{action && !disabled \?/,
  'eylemsiz kutuda eylem etiketi basilmamali',
)
assert.match(stripComments(statusSection), /onOpenTab\?\.\('security'\)/, 'alarm kutusu guvenlige goturmeli')
// ALL FOUR boxes must be doors. Searching patterns one by one was not enough: two
// boxes go to the same target and deleting one did not trip the other's pin.
assert.equal(
  (stripComments(statusSection).match(/action=\{\{/g) || []).length,
  4,
  'each stat box must have an action',
)
assert.match(stripComments(statusSection), /onOpenTab\?\.\('audit_logs'\)/, 'hareketler audit loga goturmeli')
assert.match(stripComments(statusSection), /navigate\('\/admin\/kullanicilar'\)/, 'must lead to online users')
// The posture finding row must say WHAT TO DO; a penalty alone gives no direction.
assert.match(stripComments(statusSection), /finding\.action/, 'bulgu satiri cozumu gostermeli')

// ---------- H) Bakim modu ----------
const gate = read('src/components/layout/MaintenanceGate.tsx')
const maintenanceCard = read('src/components/admin/ops/AdminOpsMaintenanceCard.tsx')

// H1) FAILS OPEN. Security gates do the opposite; this is deliberately reversed:
// closing the whole site because of a network error would be a bigger outage than
// what it tries to prevent.
assert.match(stripComments(gate), /catch\(\(\) => false\)/, 'if the flag cannot be read the site must stay open')
assert.match(stripComments(gate), /isFeatureEnabled\(MAINTENANCE_FLAG, false/, 'must be off by default')

// H2) Admin HER ZAMAN girer: modu acan kisinin kendini disari kilitlemesi,
// modu geri kapatmasini da imkansiz kilardi.
assert.match(
  stripComments(gate),
  /if \(!maintenance \|\| loading \|\| isAdmin\) return/,
  'admins must not see the maintenance screen',
)

// H3) The gate must be in BOTH shell branches; otherwise reader routes stay open
// in maintenance mode.
const layout = stripComments(read('src/components/layout/Layout.tsx'))
assert.equal((layout.match(/<MaintenanceGate>/g) || []).length, 2, 'the gate must be in both shell branches')

// H4) Opening takes two steps, CLOSING one: ending an outage must be easier than
// starting one.
assert.match(
  stripComments(maintenanceCard),
  /confirming \? void apply\(true\) : setConfirming\(true\)/,
  'acmak onay istemeli',
)
assert.match(
  stripComments(maintenanceCard),
  /onClick=\{\(\) => \{ void apply\(false\) \}\}/,
  'closing must be one step',
)

// H5) Flag writes are a FULL OVERWRITE: `set_feature_flag` is not a patch.
//
// In the first version the card only sent `isEnabled` and every enable
// silently made the flag NON-public. The result happened live:
// `get_runtime_feature_flags` does not return a non-public flag to anon users,
// the gate fails open, the admin thinks "maintenance mode is on" but
// visitors browsed the site. It would have gone unnoticed without an incognito test.
assert.match(
  stripComments(maintenanceCard),
  /isPublic: MAINTENANCE_IS_PUBLIC/,
  'bakim bayragi her yazimda public kalmali',
)
// Fields must be searched INSIDE THE CALL. The first version searched the whole file and the
// `const [description, setDescription] = ...` line satisfied the pin:
// dropping a field without touching the call was not caught.
const writeCall = stripComments(maintenanceCard).match(/setAdminFeatureFlag\(\{[\s\S]*?\}\)/)?.[0] ?? ''
assert.ok(writeCall.length > 0, 'a flag write call must exist (the pin must not be dead)')
for (const field of ['label', 'description', 'rolloutPercent', 'isPublic', 'isEnabled']) {
  assert.match(
    writeCall,
    new RegExp(`\\b${field}\\b`),
    `${field} must be sent on write (a missing field falls to the default)`,
  )
}

console.log('PASS security score contract verified')
