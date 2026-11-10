import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')
const packageSource = readFileSync(path.join(rootDir, 'package.json'), 'utf8')
const auditSource = readFileSync(path.join(rootDir, 'scripts', 'deep-audit-suite.mjs'), 'utf8')
const reportDir = path.join(rootDir, 'docs', 'reports')

assert.match(packageSource, /"audit:deep": "node scripts\/deep-audit-suite\.mjs"/)
assert.match(packageSource, /"audit:deep:strict": "node scripts\/deep-audit-suite\.mjs --fail-on-regression"/)
assert.match(auditSource, /apiResilience/)
assert.match(auditSource, /sessionState/)
assert.match(auditSource, /integrationSecurity/)
assert.match(auditSource, /schemaValidationCoverage/)
assert.match(auditSource, /complexityMap/)
assert.match(auditSource, /testStrategyCoverage/)
assert.match(auditSource, /releaseDiscipline/)
assert.match(auditSource, /multiTenant/)
assert.match(auditSource, /function canonicalizeCycleNodes\(nodes\)/)
assert.match(auditSource, /canonicalizeCycleSignature\(item\.signature\)/)
assert.match(auditSource, /const canonicalNodes = \[\.\.\.canonicalRing, canonicalRing\[0\]\]/)

const requiredReports = [
  'deep-audit-baseline.json',
  'deep-audit-baseline.md',
  'api-resilience-baseline.json',
  'api-resilience-baseline.md',
  'session-state-audit.json',
  'session-state-audit.md',
  'integrations-webhook-audit.json',
  'integrations-webhook-audit.md',
  'schema-serialization-audit.json',
  'schema-serialization-audit.md',
  'complexity-map.json',
  'complexity-map.md',
  'test-strategy-audit.json',
  'test-strategy-audit.md',
  'release-discipline-audit.json',
  'release-discipline-audit.md',
  'multi-tenant-audit.json',
  'multi-tenant-audit.md',
]

for (const fileName of requiredReports) {
  assert.equal(existsSync(path.join(reportDir, fileName)), true, `${fileName} eksik`)
}

const report = JSON.parse(readFileSync(path.join(reportDir, 'deep-audit-baseline.json'), 'utf8'))
assert.equal(typeof report.generatedAt, 'string')
assert.equal(typeof report.apiResilience?.summary?.surfaceCount, 'number')
assert.equal(typeof report.sessionState?.summary?.authSurfaceCount, 'number')
assert.equal(typeof report.integrationSecurity?.summary?.webhookSurfaceCount, 'number')
assert.equal(typeof report.schemaValidationCoverage?.summary?.hotspotCount, 'number')
assert.equal(typeof report.complexityMap?.summary?.cycleCount, 'number')
assert.equal(typeof report.testStrategyCoverage?.summary?.totalTestFileCount, 'number')
assert.equal(typeof report.releaseDiscipline?.summary?.recentCommitCount, 'number')
assert.equal(typeof report.multiTenant?.summary?.tenantSurfaceCount, 'number')
assert.equal(typeof report.newViolations, 'object')

console.log('PASS deep audit suite produces all reports')


