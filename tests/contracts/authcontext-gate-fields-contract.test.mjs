/**
 * AuthContext user projection contract.
 *
 * `mapAppUserToCurrentUser` is an ALLOWLIST: fields of AppUser are passed to CurrentUser
 * one by one. Layout's GATES look at this object, so a field forgotten in the list silently
 * stays `undefined` and the gate keeps firing.
 *
 * THIS HAPPENED: the birth date came from the RPC and mapped to AppUser, but not being in this
 * list it NEVER reached the context. It was saved in the database, yet
 * the user was asked on every launch. E2E tests could not see this because the mock auth path
 * sets `currentUser` directly and NEVER runs this projection.
 *
 * So: every `currentUser` field in Layout's gate conditions MUST also be in the
 * projection.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (relativePath) => readFileSync(path.join(root, relativePath), 'utf8')

const context = read('src/contexts/AuthContext.tsx')
const layout = read('src/components/layout/Layout.tsx')

const projection = (() => {
  const start = context.indexOf('function mapAppUserToCurrentUser')
  assert.ok(start >= 0, 'mapAppUserToCurrentUser must be defined')
  const end = context.indexOf('\n}', start)
  return context.slice(start, end)
})()

/*
 * Extract ALL fields read as `currentUser.<field>` from Layout's gate conditions.
 * A handwritten list would mean this test silently falls behind when a new gate
 * is added.
 */
const gateFields = new Set(
  Array.from(layout.matchAll(/currentUser[?]?\.([A-Za-z_][A-Za-z0-9_]*)/g))
    .map((match) => match[1])
    .filter((field) => field !== 'username'),
)

assert.ok(gateFields.size > 0, 'no currentUser field found in Layout gates')

for (const field of gateFields) {
  assert.ok(
    // No escape: in a regex built inside a template string backslash-b silently becomes a
    // BACKSPACE character and never matches.
    projection.includes(`${field}:`),
    `A Layout gate reads currentUser.${field} but the AuthContext projection does NOT CARRY this field; it silently stays undefined and the gate keeps firing`,
  )
}

// Yasanan somut vaka ayrica pinlenir.
assert.match(
  projection,
  /birthDate: appUser\.birthDate/,
  'birth date must be carried in the projection (the gate must not re-ask on each open)',
)

console.log(`PASS AuthContext projection carries the ${gateFields.size} fields of Layout gates`)
