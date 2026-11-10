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

const source = read('src/services/fansubService/requests.ts')
assertIncludes(source, 'createFansubRequestSchema.parse', 'fansubService/requests talep girdisini schema ile dogrulamali.')
assertIncludes(source, 'withServiceTimeout', 'fansubService/requests timeout helper kullanmali.')
assertIncludes(source, 'withAbortSignal', 'fansubService/requests Supabase sorgularinda abort signal baglamali.')
assertIncludes(source, 'createScopedLogger', 'fansubService/requests scoped logger kullanmali.')
assertIncludes(source, 'createRequestContext', 'fansubService/requests request context uretmeli.')
assertIncludes(source, 'isE2EModeEnabled', 'fansubService/requests e2e fansub kurma onizleme submit yolunu korumali.')
assertIncludes(source, 'createE2EMockFansubRequest', 'fansubService/requests e2e modunda UUID olmayan test kullanicisi icin mock talep uretmeli.')
assertIncludes(source, 'submitFansubRequest', 'fansubService/requests submitFansubRequest exportunu korumali.')
assertIncludes(source, 'approveFansubRequest', 'fansubService/requests approveFansubRequest exportunu korumali.')
assertIncludes(source, 'rejectFansubRequest', 'fansubService/requests rejectFansubRequest exportunu korumali.')

console.log('PASS fansub request service keeps the timeout, logger and schema contract')
