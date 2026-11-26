import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const read = (path) => readFileSync(new URL('../../' + path, import.meta.url), 'utf8')
const load = (path) => {
  const output = ts.transpileModule(read(path), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const module = { exports: {} }
  new Function('module', 'exports', output)(module, module.exports)
  return module.exports
}

// iOS zooms into inputs under 16px on focus; maximum-scale=1 is added on Apple touch devices only
// (iOS keeps pinch zoom anyway; elsewhere maximum-scale would block it).
const { isAppleTouchDevice, installMobileViewportFix } = load('src/lib/mobileViewport.ts')
assert.equal(isAppleTouchDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', 5), true)
assert.equal(isAppleTouchDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5), true, 'iPadOS reports a Mac with touch')
assert.equal(isAppleTouchDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0), false, 'a desktop Mac is not touched')
assert.equal(isAppleTouchDevice('Mozilla/5.0 (Linux; Android 15; Pixel 9)', 5), false)
const meta = { content: 'width=device-width, initial-scale=1.0', getAttribute() { return this.content }, setAttribute(_name, value) { this.content = value } }
const doc = { querySelector: () => meta }
installMobileViewportFix(doc, { userAgent: 'Mozilla/5.0 (Linux; Android 15)', maxTouchPoints: 5 })
assert.equal(meta.content, 'width=device-width, initial-scale=1.0', 'Android keeps pinch zoom')
installMobileViewportFix(doc, { userAgent: 'Mozilla/5.0 (iPhone)', maxTouchPoints: 5 })
assert.equal(meta.content, 'width=device-width, initial-scale=1.0, maximum-scale=1')
installMobileViewportFix(doc, { userAgent: 'Mozilla/5.0 (iPhone)', maxTouchPoints: 5 })
assert.equal(meta.content, 'width=device-width, initial-scale=1.0, maximum-scale=1', 'applied once')
assert.match(read('src/main.tsx'), /installMobileViewportFix\(\)/)
assert.match(read('src/index.css'), /touch-action: manipulation;/, 'no double-tap zoom on quick taps')

// Pages must not be wider than a phone: a wider page lets the browser zoom out and pan sideways.
assert.match(read('src/pages/FansubsPage.tsx'), /className="grid grid-cols-1 gap-5 xl:grid-cols-\[minmax\(0,1fr\)_350px\]"/,
  'the single mobile column is minmax(0,1fr), not sized by the scrolling chip rail')
assert.match(read('src/pages/shop/ShopHeader.tsx'), /className='flex min-w-0 max-w-full items-center gap-1 overflow-x-auto/,
  'shop tabs scroll inside the header instead of widening the page')

// Announcements: a background refresh (tab return, polling) keeps what is on screen.
const announcements = read('src/components/announcements/useAnnouncements.ts')
assert.match(announcements, /setState\(s => \(s\.key === key && s\.loaded \? s : initialState\(key\)\)\)/,
  'no skeleton on refresh, so an empty panel does not flash in and out')
assert.match(announcements, /const lastResult = new Map/, 'returning to a page shows the last list at once')
assert.match(read('src/components/announcements/AnnouncementsPanel.tsx'), /if \(!error && !items\.length\) return null/,
  'the home panel appears with content only, never as a placeholder that vanishes')

// Desktop sidebar: management is a compact nav group and Premium is one row.
const sidebar = read('src/components/layout/AppSidebar.tsx')
assert.match(sidebar, /<DesktopHomeNav username=\{currentUser\?\.username\} todayCount=\{todayChapterCount\} manage=\{manageLinks\} \/>/)
assert.match(sidebar, /\{!enableSearchHotkey && currentUser && \(\(isAdminResolved \|\| isAdmin\)/, 'the tall management block is not drawn on desktop')
assert.match(read('src/components/home/HomePremiumCard.tsx'), /className="dh-premium-crown"/)
assert.match(read('src/components/home/desktop/desktop-home.css'), /@media\(min-width:1024px\) and \(max-height:1000px\)/)

console.log('PASS home and sidebar polish: iOS input zoom, page width, quiet announcement refresh, compact desktop sidebar')
