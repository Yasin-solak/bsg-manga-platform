/**
 * Welcome screen contract.
 *
 * Protected decisions:
 *
 * 1. THE WELCOME COMES ONLY FROM THE ROOT ROUTE. Product decision: a signed-out
 * visitor opens the site on the welcome. But converting ALL routes would send every
 * shared link to a login wall and devalue prerendered
 * public routes; deep links are untouched.
 * "Browse for now" leaves a flag, or the home page sends the visitor back,
 * creating an INFINITE LOOP.
 * 2. `/giris` BUILDS ITS OWN SHELL. Rendered inside app chrome the bottom
 * tab bar overlapped content (measured: the "Sign in"
 * link stayed 93px under the bar).
 * 3. THEME VARIABLES ARE OKLCH, `hsl(var(--x))` IS INVALID. The welcome's
 * curtain fell apart entirely for this reason at first and text was unreadable
 * over covers. For alpha use `color-mix(in oklch, ...)`.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (relativePath) => readFileSync(path.join(root, relativePath), 'utf8')

/** "Bu desen kodda olmamali" pinleri kendi aciklama metnine takilmamali. */
const stripComments = (source) => source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')

const welcome = stripComments(read('src/pages/auth/AuthWelcome.tsx'))
const layout = read('src/components/layout/Layout.tsx')
const css = read('src/index.css')

// 1. Karsilama YALNIZCA kok rotadan gelir; derin baglantilar dokunulmaz.
assert.match(
  layout,
  /location\.pathname === '\/' && !hasSeenGuestWelcome\(\)/,
  'the welcome redirect must be ONLY at the root route; converting deep links would drop every shared link onto a sign-in wall',
)

// 2. Auth rotasi chrome disinda.
assert.match(
  layout,
  /const isAuthRoute = location\.pathname === '\/giris'/,
  'auth rotasi kendi kabugunu kurmali',
)
assert.match(
  layout,
  /shouldUseChrome = [\s\S]*?&& !isAuthRoute/,
  'auth rotasi shouldUseChrome istisnalarina eklenmeli',
)

// 5. OKLCH trap: hsl(var(--...)) is NOT USED on the welcome.
assert.ok(
  !/hsl\(var\(--/.test(welcome),
  'theme variables are oklch; hsl(var(--x)) is invalid and silently drops the style',
)
assert.match(
  welcome,
  /color-mix\(in oklch, var\(--background\)/,
  'overlay alpha must be built with color-mix',
)
assert.match(css, /--background: oklch\(/, 'the assumption that tokens are oklch is verified from source')

console.log('PASS welcome screen contract kept')
