import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
const source = readFileSync(new URL('../../src/lib/desktopAppearancePreferences.ts', import.meta.url), 'utf8')
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
const exports = {}
new Function('exports', output)(exports)
const normalize = exports.normalizeDesktopAppearance
for (const value of [null, undefined, '', 42, [], { reduceMotion: 'true', animateFrames: 0 }]) {
  assert.deepEqual(normalize(value), { reduceMotion: false, animateFrames: true })
}
assert.deepEqual(normalize({ reduceMotion: true, animateFrames: false, extra: true }), { reduceMotion: true, animateFrames: false })
assert.deepEqual(normalize({ animateFrames: false }), { reduceMotion: false, animateFrames: false })
const provider = readFileSync(new URL('../../src/contexts/DesktopAppearanceContext.tsx', import.meta.url), 'utf8')
assert.match(provider, /!desktop \|\| \(preferences.animateFrames && !preferences.reduceMotion\)/)
assert.match(provider, /catch \{ setError\(true\) \}/)
console.log('PASS desktop view: broken record, defaults, mobile split and save error')
