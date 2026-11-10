/**
 * Reader v2 chapter end follow + notification invite contract (Phase 5).
 *
 * The invite's visibility depends on a combination of seven inputs. This matrix cannot be tried one by one
 * in a browser (permission state, iOS tab, flag); it is verified in the pure engine.
 *
 * Protected product decision: push permission is asked at chapter END, the moment the user just
 * experienced the value. The site-wide cold invite stays in v1.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')
const read = (relativePath) => readFileSync(path.join(rootDir, relativePath), 'utf8')

function loadModule(relativePath) {
  const { outputText } = ts.transpileModule(read(relativePath), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  })
  const shim = { exports: {} }
  new Function('module', 'exports', 'require', outputText)(shim, shim.exports, () => ({}))
  return shim.exports
}

const invite = loadModule('src/pages/reader/readerV2NotifyInviteEngine.ts')
const endSequence = loadModule('src/pages/reader/readerV2EndSequenceEngine.ts')

/** All on, user signed in, not following: the richest start. */
const base = {
  hasFansub: true,
  signedIn: true,
  isFollowing: false,
  pushFlagEnabled: true,
  pushSupported: true,
  pushState: 'unsubscribed',
  isIosBrowserTab: false,
  dismissed: false,
}

// ---------- A) Varyant matrisi ----------
assert.equal(invite.resolveReaderV2NotifyInvite(base), 'follow', 'a signed-in non-follower must first be asked to follow')

assert.equal(
  invite.resolveReaderV2NotifyInvite({ ...base, hasFansub: false }),
  'hidden',
  'a chapter with no fansub has no team to follow',
)
assert.equal(
  invite.resolveReaderV2NotifyInvite({ ...base, dismissed: true }),
  'hidden',
  'if the user closed it once it must not ask again',
)
assert.equal(
  invite.resolveReaderV2NotifyInvite({ ...base, signedIn: false }),
  'signin',
  'a signed-out user must see a sign-in invite',
)
assert.equal(
  invite.resolveReaderV2NotifyInvite({ ...base, signedIn: false, dismissed: true }),
  'hidden',
  'the dismiss decision holds for signed-out users too',
)

// Following: the one next offer is notifications.
const following = { ...base, isFollowing: true }
assert.equal(invite.resolveReaderV2NotifyInvite(following), 'push', 'a follower must be asked about notifications')
assert.equal(
  invite.resolveReaderV2NotifyInvite({ ...following, pushState: 'subscribed' }),
  'hidden',
  'an already subscribed user must not be asked again',
)
assert.equal(
  invite.resolveReaderV2NotifyInvite({ ...following, pushState: 'denied' }),
  'hidden',
  'izin reddedilmisse buradan duzeltilemez; gurultu yapilmamali',
)
assert.equal(
  invite.resolveReaderV2NotifyInvite({ ...following, pushState: 'unknown' }),
  'hidden',
  'no wrong card before the state resolves',
)
assert.equal(
  invite.resolveReaderV2NotifyInvite({ ...following, pushFlagEnabled: false }),
  'hidden',
  'with the flag off no notification offer must appear',
)
assert.equal(
  invite.resolveReaderV2NotifyInvite({ ...following, pushSupported: false }),
  'hidden',
  'if the browser does not support it no offer must appear',
)
assert.equal(
  invite.resolveReaderV2NotifyInvite({ ...following, isIosBrowserTab: true }),
  'install',
  'in an iOS browser tab the right path is adding to the home screen',
)
// iOS kurulum yonergesi bayraga baglidir: push kapaliyken kurulum onerisi anlamsiz.
assert.equal(
  invite.resolveReaderV2NotifyInvite({ ...following, isIosBrowserTab: true, pushFlagEnabled: false }),
  'hidden',
  'with push off install instructions must not show either',
)
// While not following yet iOS/permission state should not change the decision: follow first.
assert.equal(
  invite.resolveReaderV2NotifyInvite({ ...base, isIosBrowserTab: true, pushState: 'denied' }),
  'follow',
  'the follow offer must be independent of push conditions',
)

// ---------- B) Tek tikta takip + bildirim ----------
assert.equal(
  invite.shouldBundlePushWithFollow(base),
  true,
  'the plan says "one step": a follow tap must also enable notifications',
)
assert.equal(invite.shouldBundlePushWithFollow({ ...base, pushFlagEnabled: false }), false)
assert.equal(invite.shouldBundlePushWithFollow({ ...base, pushSupported: false }), false)
assert.equal(invite.shouldBundlePushWithFollow({ ...base, isIosBrowserTab: true }), false, 'push cannot be requested in an iOS tab')
assert.equal(
  invite.shouldBundlePushWithFollow({ ...base, pushState: 'denied' }),
  false,
  'a denied permission must not be asked again (the browser will not ask anyway)',
)
assert.equal(invite.shouldBundlePushWithFollow({ ...base, pushState: 'subscribed' }), false)

// ---------- C) Bolum sonundaki yeri ----------
{
  const plan = endSequence.resolveReaderV2EndSequence({
    hasNextChapter: true,
    chapterNotes: null,
    hasFansub: true,
    creditReady: true,
    boostEnabled: true,
    donationsEnabled: true,
    commentsEnabled: true,
    showNotifyInvite: true,
  })
  // Support actions are no longer a SEPARATE card but inside the closing credit
  // (user design request), hence no 'support' block in the list.
  assert.deepEqual(
    plan.blocks,
    ['next', 'credit', 'notify', 'comments'],
    'support moved to the credit card; blocks must simplify accordingly',
  )
  assert.equal(plan.supportInsideCredit, true)

  // The earlier rule "the free ask before the paid ask" came from block order. With support moved into the card,
  // the rule stays INSIDE THE CARD: the money ask comes at the END of the card, after the identity
  // and supporter row, and chapter end does not open with a money ask.
  const endSequenceUi = read('src/pages/reader/ReaderV2EndSequence.tsx')
  const creditStart = endSequenceUi.indexOf('data-testid="reader-v2-end-credit"')
  const supportersAt = endSequenceUi.indexOf('data-testid="reader-v2-end-credit-supporters"', creditStart)
  const boostAt = endSequenceUi.indexOf('data-testid="reader-v2-end-support-boost"', creditStart)
  assert.ok(creditStart > -1 && supportersAt > -1 && boostAt > -1, 'credit card parts must exist')
  assert.ok(
    boostAt > supportersAt,
    'support buttons must be at the end of the card (first who made it, then support)',
  )

  const withoutInvite = endSequence.resolveReaderV2EndSequence({
    hasNextChapter: true,
    chapterNotes: null,
    hasFansub: true,
    creditReady: true,
    boostEnabled: true,
    donationsEnabled: true,
    commentsEnabled: true,
    showNotifyInvite: false,
  })
  assert.ok(!withoutInvite.blocks.includes('notify'), 'davet gizliyken blok acilmamali')
}

// ---------- D) Baglanti katmani niyeti ----------
const hookSource = read('src/pages/reader/useReaderV2NotifyInvite.ts')
assert.match(
  hookSource,
  /reader-v2-notify-invite/,
  'v2 must use its own dismiss key: a decision on the v1 cold invite must not silence this',
)
assert.doesNotMatch(
  hookSource,
  /'mz-push-nudge'/,
  'the v1 key must not be shared (the offers differ)',
)
assert.match(hookSource, /followFansub/, 'the follow action must be wired')
// If following succeeded a push error should not undo following.
assert.match(
  hookSource,
  /await followFansub[\s\S]*setIsFollowing\(true\)[\s\S]*try \{[\s\S]*enableWebPush/,
  'push enable must be in a separate try: a failed push must not undo the follow',
)

const componentSource = read('src/pages/reader/ReaderV2NotifyInvite.tsx')
assert.match(componentSource, /data-testid="reader-v2-end-notify"/)
assert.match(componentSource, /data-variant=\{variant\}/, 'the variant must be observable from outside')
// AuthPage donus yolunu router state'inden okur; sorgu parametresi CALISMAZ.
assert.match(
  componentSource,
  /to="\/giris" state=\{\{ from: signInFrom \}\}/,
  'the sign-in return must be given with router state (AuthPage reads no query parameter)',
)
const authSource = read('src/pages/AuthPage.tsx')
assert.match(authSource, /location\.state as \{ from\?: unknown \}/, 'AuthPage donus yolunu state\'ten okumaya devam etmeli')

console.log('PASS reader v2 follow + notification invite contract verified')
