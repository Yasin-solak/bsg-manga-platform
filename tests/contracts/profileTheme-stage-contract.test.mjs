import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import ts from 'typescript'
import { activeLocaleShim } from './i18n-source.mjs'

// Profile theme (src/lib/profileTheme.ts): reading, ready-made themes and scene token readability.
const require = createRequire(import.meta.url)
const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

function load(path, mocks = {}) {
  const exports = {}
  const code = ts.transpileModule(read(path), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  new Function('require', 'exports', code)((name) => name === '@/i18n/activeLocale' ? activeLocaleShim : (name in mocks ? mocks[name] : require(name)), exports)
  return exports
}

const hoverTheme = load('src/components/common/hoverCardTheme.ts')
const theme = load('src/lib/profileTheme.ts', { '@/components/common/hoverCardTheme': hoverTheme })

// Reading: invalid color -> no theme; default if style / pattern is unknown.
assert.equal(theme.parseProfileTheme(null), null)
assert.equal(theme.parseProfileTheme({ mainColor: 'kirmizi', accentColor: '#000000' }), null, 'an invalid color does not count as a theme')
assert.deepEqual(
  theme.parseProfileTheme({ mainColor: '#D916B8', accentColor: '#1a1024', style: 'yok-boyle', pattern: 'stars' }),
  { mainColor: '#d916b8', accentColor: '#1a1024', style: 'aurora', pattern: 'stars' },
  'an old / unknown style falls to the default, colors are normalized',
)

// Ready-made themes: all valid and readable; ids unique.
const ids = new Set()
for (const preset of theme.PROFILE_THEME_PRESETS) {
  assert.ok(!ids.has(preset.id), `${preset.id} is unique`)
  ids.add(preset.id)
  assert.ok(theme.parseProfileTheme(preset), `${preset.id} is a valid theme`)
  assert.ok(theme.PROFILE_THEME_STYLES.includes(preset.style), `${preset.id} stili bilinen`)
  assert.ok(theme.PROFILE_THEME_PATTERNS.includes(preset.pattern), `${preset.id} deseni bilinen`)
}

// Sahne tokenlari: dugme koyu sahnede okunur (cok koyu temada da acilir), uzerindeki yazi zit tonda.
function rgb(value) {
  const [r, g, b] = value.match(/\d+/g).map(Number)
  return { r, g, b }
}
function luminance({ r, g, b }) {
  const channel = (value) => {
    const n = value / 255
    return n <= 0.03928 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}
for (const sample of [null, { mainColor: '#0c0f16', accentColor: '#05060a', style: 'spotlight', pattern: 'none' }, ...theme.PROFILE_THEME_PRESETS]) {
  const vars = theme.profileStageVars(sample)
  const button = luminance(rgb(vars['--primary']))
  const ink = luminance(rgb(vars['--primary-foreground']))
  assert.ok(button >= 0.18, `${sample?.mainColor ?? 'notr'}: the button reads on a dark scene`)
  const contrast = (Math.max(button, ink) + 0.05) / (Math.min(button, ink) + 0.05)
  assert.ok(contrast >= 3, `${sample?.mainColor ?? 'notr'}: the button text reads (${contrast.toFixed(2)})`)
}

// The scene and lock screen use the same themed background.
assert.match(read('src/pages/profile/ProfileShowcaseStage.tsx'), /<ProfileThemeBackdrop theme=\{theme\}/)
assert.match(read('src/pages/profile/ProfileLockedView.tsx'), /<ProfileThemeBackdrop theme=\{theme\} \/>/, 'the lock screen uses the owner theme')

console.log('PASS profile theme (reading, ready-made themes, scene tokens)')
