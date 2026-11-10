import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')

function read(relativePath) {
  return readFileSync(path.join(rootDir, relativePath), 'utf8')
}

const boundarySource = read('src/components/common/AppErrorBoundary.tsx')
const mainSource = read('src/main.tsx')

assert.match(boundarySource, /class AppErrorBoundaryRoot extends Component/)
assert.match(boundarySource, /getDerivedStateFromError/)
assert.match(boundarySource, /componentDidCatch/)
assert.match(boundarySource, /createScopedLogger\('AppErrorBoundary'\)/)
assert.match(boundarySource, /resetKey/)
assert.match(mainSource, /import AppErrorBoundary from ['"]@\/components\/common\/AppErrorBoundary['"]/)
assert.match(mainSource, /<AppErrorBoundary>\s*<App \/>\s*<\/AppErrorBoundary>/s)

console.log('PASS app-wide render errors are covered by ErrorBoundary')
