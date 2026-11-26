import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL('../../' + path, import.meta.url), 'utf8')
const layout = read('src/components/layout/Layout.tsx')

// A brand-new account has neither a birth date nor finished onboarding. The gate comes first and
// the onboarding redirect must not pull the user off it; otherwise the two redirect to each other
// forever and the date can never be entered (production incident 2026-11-22).
const gate = layout.indexOf('if (!loading && currentUser && !currentUser.birthDate && !isBirthDateGate)')
const onboarding = layout.indexOf('if (!loading && currentUser && !currentUser.onboardingCompletedAt && !isOnboardingRoute && !isBirthDateGate)')
assert.ok(gate > 0, 'a session without a birth date is sent to the gate')
assert.ok(onboarding > 0, 'the onboarding redirect skips the birth date gate')
assert.ok(gate < onboarding, 'the birth date gate is checked before onboarding')
assert.match(layout, /if \(!loading && currentUser\?\.birthDate && isBirthDateGate\)/, 'a saved date leaves the gate')

// The footnote is one sentence: split across two keys it rendered "Under 13under this age" in
// English and "13 yaşındanküçükler" in Turkish.
const page = read('src/pages/BirthDateGatePage.tsx')
assert.match(page, /txa\('Bir kez kaydedilir ve sonradan değiştirilemez\. \{v1\} yaşından küçükler BSG Manga\\'yı kullanamaz\.', \{ v1: MIN_AGE \}\)/)

console.log('PASS birth date gate: no redirect loop with onboarding, single-sentence footnote')
