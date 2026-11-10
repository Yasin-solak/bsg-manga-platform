import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')

const registrySource = readFileSync(path.join(rootDir, 'src', 'services', 'featureFlagRegistry.ts'), 'utf8')
const serviceSource = readFileSync(path.join(rootDir, 'src', 'services', 'featureFlagService.ts'), 'utf8')

const keyMatches = Array.from(registrySource.matchAll(/^\s*'([^']+)':\s*\{/gm)).map((match) => match[1])
assert.ok(keyMatches.length >= 10)
assert.match(registrySource, /owner: '.*'/)
assert.match(registrySource, /amac: '.*'/)
assert.match(registrySource, /cleanupNotu: '.*'/)
assert.match(serviceSource, /FEATURE_FLAG_REGISTRY/)
assert.match(serviceSource, /listRegisteredFeatureFlags/)
assert.match(serviceSource, /createScopedLogger/)

console.log('PASS feature flag registry contract kept')
