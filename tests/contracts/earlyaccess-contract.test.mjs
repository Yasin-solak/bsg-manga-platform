import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

/**
 * Nitro early access rule contract.
 *
 * The rule as the user described it: when a chapter publishes it is OPEN to Nitro members;
 * non-members wait a fixed time and see the REMAINING hours.
 * Example (from the user): chapter out at 12:00, rule is 36 hours, the user arrives at
 * 16:00 -> "opens in 32 hours".
 */

const src = readFileSync(new URL('../../src/lib/earlyAccess.ts', import.meta.url), 'utf8')

// ---------- A) Duration from ONE SOURCE ----------
// The UI and (later) the server should use the same number; if the constant scatters they silently
// drift and the user sees the wrong time.
assert.match(src, /export const EARLY_ACCESS_HOURS = 36/, 'the duration must be defined in one place')

// ---------- B) Uyeye kilit HIC hesaplanmaz ----------
assert.match(src, /if \(isPremium\) return unlocked/, 'Nitro uyesi kilit gormemeli')

// ---------- C) Missing data DOES NOT MEAN LOCKED ----------
// Treating an unknown publish_at as "locked" would make a public chapter look inaccessible.
assert.match(src, /if \(!publishAt\) return unlocked/, 'with no publish moment it must not lock')

// ---------- D) Time left rounds UP ----------
// Saying "31 hours" with 31h 10m left would imply it opens earlier than expected.
assert.match(src, /Math\.ceil\(/, 'remaining time must round up')

// ---------- E) Behavior: the example the user gave ----------
/*
 * The module is TRANSPILED and run.
 *
 * The first version had `await import('...ts').catch(() => null)` and `if (mod)`:
 * it ran locally (Node 24), and in CI (Node 20) the import failed and ALL behavior
 * assertions were SILENTLY skipped. A contract that runs but verifies nothing
 * is not a contract.
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')

function loadModule(relativePath) {
  const source = readFileSync(path.join(rootDir, relativePath), 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  })
  const shim = { exports: {} }
  const stub = new Proxy({}, { get: () => new Proxy(() => ({}), { get: () => () => {} }) })
  // Metin katmani gercek davranisiyla: Turkce etkin dilde sablon doldurulur.
  const activeLocale = {
    intlLocale: () => 'tr-TR',
    txa: (text, vars = {}) => text.replace(/\{(\w+)\}/g, (whole, name) => (name in vars ? String(vars[name]) : whole)),
  }
  new Function('module', 'exports', 'require', outputText)(shim, shim.exports, (id) => (id === '@/i18n/activeLocale' ? activeLocale : stub))
  return shim.exports
}

const mod = loadModule('src/lib/earlyAccess.ts')

{
  const publishAt = '2026-01-10T12:00:00.000Z'
  const at16 = Date.parse('2026-01-10T16:00:00.000Z')

  const guest = mod.getEarlyAccessState({ publishAt, isPremium: false, nowMs: at16 })
  assert.equal(guest.locked, true, 'a non-member must still be locked at 16:00')
  assert.equal(guest.hoursRemaining, 32, '36 - 4 = 32 saat kalmali')
  assert.equal(mod.formatEarlyAccessLabel(guest), '32 saat sonra herkese açık')

  const member = mod.getEarlyAccessState({ publishAt, isPremium: true, nowMs: at16 })
  assert.equal(member.locked, false, 'a Nitro member must be able to read at the same moment')

  const after = Date.parse('2026-01-12T00:01:00.000Z')
  assert.equal(
    mod.getEarlyAccessState({ publishAt, isPremium: false, nowMs: after }).locked,
    false,
    '36 saat dolunca kilit kalkmali',
  )
}

// ---------- F) A NOT YET PUBLISHED chapter is a separate state ----------
/*
 * A user saw "public in 237 hours" on the home page and rightly did not understand.
 * Cause: a chapter scheduled eight days out leaked into the list
 * (RLS hides it from regular users but admins see all).
 *
 * This state DIFFERS from "non-member waiting": before publish time Nitro members
 * cannot read either. Treating them the same would show a Nitro prompt next to a chapter
 * nobody can open, implying that buying it unlocks it.
 */
{
  const publishAt = '2026-01-20T10:00:00.000Z'
  const now = Date.parse('2026-01-12T10:00:00.000Z') // yayindan 8 gun ONCE

  const state = mod.getEarlyAccessState({ publishAt, isPremium: false, nowMs: now })
  assert.equal(state.notYetPublished, true, 'a chapter scheduled for the future must be "not yet published"')
  assert.equal(state.hoursRemaining, 0, 'no countdown on an unpublished chapter')

  // A DATE, not hours: "237 hours" is not readable info.
  const label = mod.formatEarlyAccessLabel(state)
  assert.ok(!/saat sonra/.test(label), `no time on an unpublished chapter, got: ${label}`)
  assert.match(label, /Ocak/, `the date must print, got: ${label}`)

  // After publish time it returns to the normal early access wait.
  const justPublished = mod.getEarlyAccessState({
    publishAt,
    isPremium: false,
    nowMs: Date.parse('2026-01-20T14:00:00.000Z'),
  })
  assert.equal(justPublished.notYetPublished, false, 'yayin aninin ardindan normal kilit')
  assert.equal(justPublished.hoursRemaining, 32, '36 - 4 = 32')
}

// ---------- G) "Yeni Bolumler" YAYINLANMAMISI listelemez ----------
/*
 * The root cause was here: the feed query had no time condition. RLS filtered for regular users,
 * but it leaked for admins and fansub staff.
 * The condition must match app_private.can_current_user_access_chapter:
 * open if publish_at is empty, open to nobody if in the future.
 */
const feed = readFileSync(new URL('../../src/services/latestChapterFeedService.ts', import.meta.url), 'utf8')
assert.match(
  feed,
  /listLatestChaptersWithFansub[\s\S]*?publish_at\.is\.null,publish_at\.lte\.\$\{nowIso\}/,
  'the "New Chapters" feed must exclude chapters scheduled for the future',
)

console.log('PASS early access rule contract verified')
