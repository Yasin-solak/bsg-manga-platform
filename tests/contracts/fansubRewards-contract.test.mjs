import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '../..')

function read(relativePath) {
  return readFileSync(path.join(rootDir, relativePath), 'utf8')
}

function assertIncludes(source, needle, message) {
  if (!source.includes(needle)) {
    throw new Error(message)
  }
}

const source = read('src/services/rewardService/fansubRewards.ts')
assertIncludes(source, 'withServiceTimeout', 'fansubRewards timeout helper kullanmali.')
assertIncludes(source, 'withAbortSignal', 'fansubRewards abort signal baglamali.')
assertIncludes(source, 'createScopedLogger', 'fansubRewards scoped logger kullanmali.')

console.log('PASS fansubRewards keeps the timeout/logger contract')
