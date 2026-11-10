import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')
const eslintSource = readFileSync(path.join(rootDir, 'eslint.config.mjs'), 'utf8')
const ciSource = readFileSync(path.join(rootDir, '.github', 'workflows', 'ci.yml'), 'utf8')
const loggerSource = readFileSync(path.join(rootDir, 'src', 'services', 'logger.ts'), 'utf8')
const userFacingSource = readFileSync(path.join(rootDir, 'src', 'services', 'userFacingError.ts'), 'utf8')
const requestContextPath = path.join(rootDir, 'src', 'services', 'requestContext.ts')
const requestContextSource = readFileSync(requestContextPath, 'utf8')

assert.match(eslintSource, /LEGACY_APP_CONSOLE_ALLOWLIST/)
assert.match(eslintSource, /'no-console': 'error'/)
assert.match(ciSource, /npm run test:contracts/)
assert.match(ciSource, /npm run health:repo:strict/)
assert.match(loggerSource, /StructuredLogEntry/)
assert.match(loggerSource, /event: string/)
assert.match(loggerSource, /context\?: LogContext/)
assert.match(loggerSource, /error\?: unknown/)
assert.match(userFacingSource, /reportUserFacingError/)
assert.equal(existsSync(requestContextPath), true)
assert.match(requestContextSource, /createRequestContext/)
assert.match(requestContextSource, /toRequestContextLogContext/)

console.log('PASS observability guardrail contracts kept')
