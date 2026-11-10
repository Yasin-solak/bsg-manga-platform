import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const contractFiles = [
  'community-expression-preview-contract.test.mjs',
  'comment-spoiler-contract.test.mjs',
  'admin-comment-moderation-contract.test.mjs',
  'chapter-version-routing-contract.test.mjs',
  'manga-public-slug-contract.test.mjs',
  'reader-mode-foundation-contract.test.mjs',
]

for (const contractFile of contractFiles) {
  const contractPath = path.join(__dirname, contractFile)
  const result = spawnSync(process.execPath, [contractPath], {
    stdio: 'inherit',
  })

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

console.log('PASS comment + reader regression suite')
