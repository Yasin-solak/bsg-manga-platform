import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')
const reportDir = path.join(rootDir, 'docs', 'reports')
const reportJsonPath = path.join(reportDir, 'repo-health-baseline.json')
const reportMarkdownPath = path.join(reportDir, 'repo-health-baseline.md')
const packageSource = readFileSync(path.join(rootDir, 'package.json'), 'utf8')
const auditSource = readFileSync(path.join(rootDir, 'scripts', 'repo-health-audit.mjs'), 'utf8')

assert.match(packageSource, /"health:repo": "node scripts\/repo-health-audit\.mjs"/)
assert.match(packageSource, /"health:repo:strict": "node scripts\/repo-health-audit\.mjs --fail-on-regression"/)
assert.match(auditSource, /observabilityHotspots/)
assert.match(auditSource, /userFacingErrorCoverage/)
assert.match(auditSource, /requestContextCoverage/)
assert.match(auditSource, /newViolations/)
assert.match(auditSource, /criticalExportCoverage/)
assert.match(auditSource, /featureFlagIssues/)
assert.equal(existsSync(reportJsonPath), true)
assert.equal(existsSync(reportMarkdownPath), true)

const report = JSON.parse(readFileSync(reportJsonPath, 'utf8'))
assert.equal(typeof report.summary?.totalLines, 'number')
assert.equal(typeof report.summary?.featureFlagCount, 'number')
assert.equal(typeof report.summary?.unusedFeatureFlagCount, 'number')
assert.equal(typeof report.summary?.structuredLoggerFileCount, 'number')
assert.equal(typeof report.summary?.untestedCriticalExportCount, 'number')
assert.ok(Array.isArray(report.largeFiles))
assert.ok(Array.isArray(report.consoleHotspots))
assert.ok(Array.isArray(report.criticalAreas))
assert.ok(Array.isArray(report.observabilityHotspots))
assert.ok(Array.isArray(report.appConsoleFiles))
assert.ok(Array.isArray(report.featureFlagIssues))
assert.ok(Array.isArray(report.criticalExportCoverage?.untestedExports))
assert.ok(Array.isArray(report.userFacingErrorCoverage?.criticalFiles))
assert.ok(Array.isArray(report.requestContextCoverage?.criticalFiles))
assert.equal(typeof report.newViolations, 'object')

console.log('PASS repo health audit report is produced with observability fields')
