// Runs before the production build in `npm run deploy:cf`.
// Production must be built from the reviewed main branch exactly as it is on GitHub: no local edits,
// no unpushed commits, no stale checkout. Set DEPLOY_ALLOW_DIRTY=1 only for a deliberate emergency
// deploy, and follow docs/operations/deploy-and-rollback.md afterwards.
import { execFileSync } from 'node:child_process'

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim()

function fail(message) {
  console.error(`[predeploy:git] ERROR: ${message}`)
  console.error('[predeploy:git] Set DEPLOY_ALLOW_DIRTY=1 to override in an emergency.')
  process.exit(1)
}

if (process.env.DEPLOY_ALLOW_DIRTY === '1') {
  console.warn('[predeploy:git] DEPLOY_ALLOW_DIRTY=1: skipping the git state check.')
  process.exit(0)
}

const branch = git('rev-parse', '--abbrev-ref', 'HEAD')
if (branch !== 'main') fail(`deploys must run from main (current branch: ${branch}).`)

// Untracked files outside the build inputs (scratch notes, local tools) do not reach dist.
const buildInputs = /^(src|public|functions|index\.html|vite\.config|package(-lock)?\.json|tsconfig)/
const dirty = git('status', '--porcelain')
  .split('\n')
  .filter(Boolean)
  .filter((line) => !line.startsWith('??') || buildInputs.test(line.slice(3)))
if (dirty.length > 0) fail(`the working tree has changes that would reach production:\n${dirty.join('\n')}`)

try {
  git('fetch', '--quiet', 'origin', 'main')
} catch {
  fail('could not fetch origin/main to confirm the checkout is current.')
}
const head = git('rev-parse', 'HEAD')
const remote = git('rev-parse', 'origin/main')
if (head !== remote) fail(`HEAD (${head.slice(0, 8)}) is not origin/main (${remote.slice(0, 8)}); pull or push first.`)

console.log(`[predeploy:git] OK: deploying main at ${head.slice(0, 8)}.`)
