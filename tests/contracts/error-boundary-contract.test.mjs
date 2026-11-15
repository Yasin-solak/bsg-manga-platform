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
const reportSource = read('src/components/common/reportRenderCrash.ts')
const routeBoundarySource = read('src/components/common/RouteErrorBoundary.tsx')
const layoutSource = read('src/components/layout/Layout.tsx')
const mainSource = read('src/main.tsx')

assert.match(boundarySource, /class AppErrorBoundaryRoot extends Component/)
assert.match(boundarySource, /getDerivedStateFromError/)
assert.match(boundarySource, /componentDidCatch/)
assert.match(boundarySource, /reportRenderCrash\(/)
assert.match(reportSource, /createScopedLogger\('AppErrorBoundary'\)/)
assert.match(boundarySource, /resetKey/)
assert.match(mainSource, /import AppErrorBoundary from ['"]@\/components\/common\/AppErrorBoundary['"]/)
assert.match(mainSource, /<AppErrorBoundary>\s*<App \/>\s*<\/AppErrorBoundary>/s)

// Route-level boundary: shares the crash report, resets on pathname change, recovers stale chunks.
assert.match(routeBoundarySource, /reportRenderCrash\(/)
assert.match(routeBoundarySource, /getDerivedStateFromError/)
assert.match(routeBoundarySource, /resetKey=\{pathname\}/)
assert.match(routeBoundarySource, /props\.resetKey === state\.resetKey/)
assert.match(routeBoundarySource, /isStaleChunkError\(error\) && reloadForStaleChunk\(\)/)
assert.match(routeBoundarySource, /if \(this\.props\.silent \|\| reloading\) return null/)

// Layout wraps the routed page in BOTH branches: with chrome and the standalone full-screen routes.
assert.match(layoutSource, /import \{ RouteErrorBoundary \} from '@\/components\/common\/RouteErrorBoundary'/)
assert.equal((layoutSource.match(/<RouteErrorBoundary>\s*<Outlet \/>\s*<\/RouteErrorBoundary>/g) ?? []).length, 2)
const chromeBranch = layoutSource.slice(layoutSource.indexOf('<TopBarOverrideProvider>'))
assert.match(chromeBranch, /<PageTransition>\s*<RouteErrorBoundary>\s*<Outlet \/>/)
const standaloneBranch = layoutSource.slice(layoutSource.indexOf('if (!shouldUseChrome)'), layoutSource.indexOf('<TopBarOverrideProvider>'))
assert.match(standaloneBranch, /<MaintenanceGate>\s*<RouteErrorBoundary>\s*<Outlet \/>/)

// Global chrome widgets that render server/user data fail silently instead of breaking navigation.
assert.match(read('src/components/layout/AccountTopBarActions.tsx'), /<SilentErrorBoundary name='notifications'>\s*<NotificationTrigger/)
assert.match(read('src/components/layout/AppSidebar.tsx'), /<SilentErrorBoundary name="global-search"><GlobalSearchCommand/)
assert.match(read('src/components/announcements/AnnouncementsPanel.tsx'), /<SilentErrorBoundary name="announcements">/)

console.log('PASS app-wide, route-level and widget render errors are isolated by ErrorBoundaries')
