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

const source = read('src/components/common/UserHoverCardSurface.tsx')
assertIncludes(source, 'onActionMenuPointerDown', 'UserHoverCardSurface action menu pointer callback sozlesmesini korumali.')
assertIncludes(source, 'activeProfileEffectAssets', 'UserHoverCardSurface profil efekt asset sozlesmesini korumali.')
assertIncludes(source, 'ProfileEffectLayer', 'UserHoverCardSurface profil efekt katmanini korumali.')

console.log('PASS UserHoverCardSurface keeps the basic render contract')
