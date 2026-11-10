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

const fansubEconomySource = read('src/services/fansubService/economy.ts')
assertIncludes(fansubEconomySource, 'withServiceTimeout', 'fansubService/economy timeout helper kullanmali.')
assertIncludes(fansubEconomySource, 'withAbortSignal', 'fansubService/economy abort signal baglamali.')
assertIncludes(fansubEconomySource, 'createScopedLogger', 'fansubService/economy scoped logger kullanmali.')

const fansubRewardsSource = read('src/services/rewardService/fansubRewards.ts')
assertIncludes(fansubRewardsSource, 'withServiceTimeout', 'rewardService/fansubRewards timeout helper kullanmali.')
assertIncludes(fansubRewardsSource, 'withAbortSignal', 'rewardService/fansubRewards abort signal baglamali.')
assertIncludes(fansubRewardsSource, 'createScopedLogger', 'rewardService/fansubRewards scoped logger kullanmali.')

console.log('PASS fansub economy and reward services keep the timeout/logger contract')
