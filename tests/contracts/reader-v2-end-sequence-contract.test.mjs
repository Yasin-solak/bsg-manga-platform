/**
 * Reader v2 chapter end sequence + closing credit v2 contract (Phase 4).
 *
 * Pins two real gaps:
 * 1. The v1 presentation overrode the fansub's `maxSupporterCount` setting with `Math.min(..., 2)`:
 * even a fansub choosing 6 supporters saw 2.
 * 2. There was no donation path at chapter end; apart from the fansub's editorial CTA
 * no platform support action (boost/donation) was offered.
 */

import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')
const read = (relativePath) => readFileSync(path.join(rootDir, relativePath), 'utf8')

const moduleCache = new Map()
function resolveSourcePath(baseRelativePath) {
  for (const candidate of [`${baseRelativePath}.ts`, `${baseRelativePath}.tsx`, `${baseRelativePath}/index.ts`]) {
    if (existsSync(path.join(rootDir, candidate))) return candidate
  }
  throw new Error(`The contract loader could not find the file: ${baseRelativePath}`)
}

function loadModule(relativePath) {
  if (moduleCache.has(relativePath)) return moduleCache.get(relativePath)
  const { outputText } = ts.transpileModule(read(relativePath), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.Preserve },
  })
  const shim = { exports: {} }
  moduleCache.set(relativePath, shim.exports)
  const requireShim = (specifier) => {
    if (specifier.startsWith('@/')) return loadModule(resolveSourcePath(`src/${specifier.slice(2)}`))
    if (specifier.startsWith('./') || specifier.startsWith('../')) {
      const base = path.posix.join(path.posix.dirname(relativePath.split(path.sep).join('/')), specifier)
      return loadModule(resolveSourcePath(base))
    }
    // Paket import'lari (ikon setleri vb.) bos birakilir: burada test edilen
    // saf mantik onlara dokunmaz. Dokunursa cagri aninda patlar, sessizce
    // yanlis sonuc uretmez.
    return {}
  }
  new Function('module', 'exports', 'require', outputText)(shim, shim.exports, requireShim)
  return shim.exports
}

const endSequence = loadModule('src/pages/reader/readerV2EndSequenceEngine.ts')
const creditModule = loadModule('src/pages/reader/readerV2CreditPresentation.ts')

// ---------- A) Chapter end block order and gates ----------
const baseInput = {
  hasNextChapter: true,
  chapterNotes: null,
  hasFansub: true,
  creditReady: true,
  boostEnabled: true,
  donationsEnabled: true,
  commentsEnabled: false,
}

{
  const plan = endSequence.resolveReaderV2EndSequence(baseInput)
  // With a credit, support is not a SEPARATE card but inside the credit (user request).
  assert.deepEqual(plan.blocks, ['next', 'credit'], 'with a credit no separate support card must render')
  assert.equal(plan.supportInsideCredit, true, 'support actions must sit in the credit card')
  assert.deepEqual(plan.supportActions, ['takviye', 'bagis'], 'both support paths must be offered')
}

{
  const plan = endSequence.resolveReaderV2EndSequence({ ...baseInput, chapterNotes: '  Bu bolumde renk testi var.  ' })
  assert.equal(plan.blocks[0], 'notes', 'the chapter note must come first: readers must see it before leaving')
}

{
  const plan = endSequence.resolveReaderV2EndSequence({ ...baseInput, chapterNotes: '   ' })
  assert.ok(!plan.blocks.includes('notes'), 'bosluktan ibaret not blok acmamali')
}

{
  const plan = endSequence.resolveReaderV2EndSequence({ ...baseInput, hasNextChapter: false })
  assert.ok(plan.blocks.includes('finale'), 'with no next chapter the closing card must come')
  assert.ok(!plan.blocks.includes('next'), 'the two must not happen together')
}

{
  const plan = endSequence.resolveReaderV2EndSequence({ ...baseInput, creditReady: false })
  assert.ok(!plan.blocks.includes('credit'), 'the block must not open if the credit is not ready')
  // Kredi YOKKEN destek yolu kaybolmamali: kendi kartiyla gorunur.
  assert.ok(plan.blocks.includes('support'), 'with no credit the support card must be kept')
  assert.equal(plan.supportInsideCredit, false)
}

// Support strip gates: with no fansub it is unclear who to support.
{
  const noFansub = endSequence.resolveReaderV2EndSequence({ ...baseInput, hasFansub: false })
  assert.deepEqual(noFansub.supportActions, [], 'no support action on a fansubless chapter')
  assert.ok(!noFansub.blocks.includes('support'))

  const onlyDonations = endSequence.resolveReaderV2EndSequence({ ...baseInput, boostEnabled: false })
  assert.deepEqual(onlyDonations.supportActions, ['bagis'], 'a disabled flag must not disable the other')

  const allOff = endSequence.resolveReaderV2EndSequence({
    ...baseInput, boostEnabled: false, donationsEnabled: false,
  })
  assert.ok(!allOff.blocks.includes('support'), 'with no actions no empty strip must render')
  assert.equal(allOff.supportInsideCredit, false, 'with no actions nothing must go inside the credit either')
}

{
  const withComments = endSequence.resolveReaderV2EndSequence({ ...baseInput, commentsEnabled: true })
  assert.equal(withComments.blocks[withComments.blocks.length - 1], 'comments', 'comments must be at the very bottom')
}

// ---------- B) Kapanis kredisi v2 ----------
const fansub = { id: 'fansub-1', name: 'Test Ekibi', slug: 'test-ekibi', avatar: null, activeNameStyle: undefined }

function makeSupporter(index, eligible = true) {
  return {
    supporterUserId: `user-${index}`,
    username: `Destekci${index}`,
    usernameSlug: `destekci${index}`,
    avatarUrl: null,
    highestActivePlanCode: 'mega',
    activeFansubIdentityTag: null,
    rewardCapabilities: { canAppearInCreditPage: eligible },
  }
}

const enabledSnapshot = {
  tierLevel: 3,
  activeSupporterCount: 1234,
  capabilities: {
    tierLabel: 'Altin',
    hasChapterEndCredit: true,
    canUseChapterEndCredit: true,
    hasDiscoverBadge: false,
    hasGoldFrame: false,
  },
}

const baseConfig = {
  title: null,
  body: null,
  ctaLabel: null,
  ctaTarget: null,
  showMetrics: true,
  showSupporters: true,
  maxSupporterCount: 6,
}

{
  const presentation = creditModule.buildReaderV2CreditPresentation({
    fansub,
    config: baseConfig,
    snapshot: enabledSnapshot,
    supporters: [1, 2, 3, 4, 5, 6].map((index) => makeSupporter(index)),
  })

  assert.ok(presentation, 'with the capability on a credit must be produced')
  assert.ok(
    presentation.supporters.length > 2,
    'if a fansub picked 6 supporters it must not be limited to 2 (the hard cap in the v1 presentation was removed)',
  )
  assert.equal(presentation.supporters.length, 6)
  assert.equal(presentation.hiddenSupporterCount, 0)
  assert.equal(presentation.metrics.length, 2, 'with showMetrics on two metrics must come')
}

// The v1 presentation is still limited to 2: v2 diverges ON PURPOSE, not by accident.
{
  const v1Source = read('src/components/fansub/chapterCreditPresentation.ts')
  assert.match(
    v1Source,
    /clampFansubChapterCreditSupporterCount\(config\.maxSupporterCount\),\s*2,/,
    'the v1 presentation was not changed: v2 is a separate model, v1 behavior stays as is',
  )
}

// Ineligible supporters should not count (reward capability off).
{
  const presentation = creditModule.buildReaderV2CreditPresentation({
    fansub,
    config: { ...baseConfig, maxSupporterCount: 2 },
    snapshot: enabledSnapshot,
    supporters: [makeSupporter(1), makeSupporter(2, false), makeSupporter(3), makeSupporter(4)],
  })
  assert.equal(presentation.supporters.length, 2, 'must show up to the cap')
  assert.equal(presentation.hiddenSupporterCount, 1, '1 eligible not shown must remain (the ineligible does not count)')
}

{
  const presentation = creditModule.buildReaderV2CreditPresentation({
    fansub,
    config: { ...baseConfig, showSupporters: false, showMetrics: false },
    snapshot: enabledSnapshot,
    supporters: [makeSupporter(1)],
  })
  assert.deepEqual(presentation.supporters, [], 'with showSupporters off the list is empty')
  assert.deepEqual(presentation.metrics, [], 'with showMetrics off no metrics')
}

// Capability off is absence, not an error (v1 threw).
{
  const result = creditModule.buildReaderV2CreditPresentation({
    fansub,
    config: baseConfig,
    snapshot: { tierLevel: 0, activeSupporterCount: 0, capabilities: {} },
    supporters: [],
  })
  assert.equal(result, null, 'with the credit off it must return null and throw no exception')
  assert.equal(
    creditModule.buildReaderV2CreditPresentation({ fansub, config: null, snapshot: null, supporters: [] }),
    null,
    'konfig gelmeden kredi cizilmemeli',
  )
}

// CTA hedefi adrese donusmeli.
{
  const takviye = creditModule.buildReaderV2CreditPresentation({
    fansub, config: { ...baseConfig, ctaTarget: 'takviye' }, snapshot: enabledSnapshot, supporters: [],
  })
  assert.match(takviye.ctaHref, /tab=takviye/, 'the boost target must go to the boost tab')
  assert.ok(takviye.ctaLabel, 'with a target there must be a label')

  const none = creditModule.buildReaderV2CreditPresentation({
    fansub, config: baseConfig, snapshot: enabledSnapshot, supporters: [],
  })
  assert.equal(none.ctaHref, null)
  assert.equal(none.ctaLabel, null, 'with no target no label either (no unclickable button)')
}

// ---------- C) Support actions INSIDE THE CHAPTER ----------
// User feedback (2026-07-30): NO redirect to the fansub page for boost/donation;
// the dialog opens inside the reader.
const endSequenceUi = read('src/pages/reader/ReaderV2EndSequence.tsx')
assert.match(endSequenceUi, /onClick=\{onBoost\}/, 'boost must open inside the chapter')
assert.match(endSequenceUi, /onClick=\{onDonate\}/, 'donation must open inside the chapter')
assert.doesNotMatch(
  endSequenceUi,
  /supportHref|donateHref/,
  'support actions now open a dialog, not an address',
)
// The numeric status row was REMOVED (user design feedback): level
// and supporter count changed no decision at reading end.
assert.doesNotMatch(endSequenceUi, /reader-v2-end-support-status/, 'the numeric support state must not come back')

const supportHook = read('src/pages/reader/useReaderV2Support.ts')
assert.match(supportHook, /purchaseFansubBoost/, 'boost must use the same service')
assert.match(supportHook, /donateToFansub/, 'donation must use the same service')
assert.match(
  supportHook,
  /isDonationConfirmationInputValid/,
  'the confirm text rule must come from the same source as the fansub page (a copied rule diverges)',
)
assert.match(supportHook, /onRequireSignIn/, 'a signed-out user must be sent to the sign-in flow')

// The donation deep link (Phase 4a) is kept: the path from the fansub page must still work;
// the reader no longer uses it but other surfaces can.
const routes = loadModule('src/lib/routes.ts')
{
  const href = routes.buildFansubDonatePath({ id: 'fansub-1', slug: 'test-ekibi' })
  assert.match(href, /^\/fansub\/test-ekibi\?bagis=1$/, 'bagis derin baglantisi korunmali')
}
const detailSource = read('src/pages/FansubDetailPage.tsx')
assert.match(detailSource, /FANSUB_DONATE_QUERY_PARAM/, 'the fansub page must consume the donation parameter')
assert.match(detailSource, /next\.delete\(FANSUB_DONATE_QUERY_PARAM\)/, 'the parameter must clear once consumed (not reopen on refresh)')

// ---------- D) Chapter end must NOT be a separate fixed panel ----------
const pageSource = read('src/pages/reader/ReaderV2Page.tsx')
assert.match(pageSource, /data-testid="reader-v2-stage"/)
assert.match(pageSource, /<ReaderV2StageContent/, 'stage content must be in a single scroll container')
const stageContentSource = read('src/pages/reader/ReaderV2StageContent.tsx')
const endSequenceSource = read('src/pages/reader/ReaderV2EndSequence.tsx')
assert.doesNotMatch(
  endSequenceSource,
  /\bfixed\b/,
  'chapter end must not be a fixed layer: this is why the overflowing/clipped v1 fixed panel was removed',
)
assert.match(stageContentSource, /snap-center overflow-y-auto/, 'in page mode chapter end must be the last snapped screen')
assert.match(stageContentSource, /endSequenceNode/, 'chapter end must render in the same scroll container')

// ---------- E) Closing credit presentation (user design feedback) ----------
// Numeric metrics were removed: "Support level: X" / "Supporters: N" changed no decision at reading
// end; supporter avatars already give social proof.
assert.doesNotMatch(endSequenceUi, /metric\.label/, 'metrik etiketleri cizilmemeli')
assert.doesNotMatch(endSequenceUi, /credit\.metrics\.map/, 'metrik listesi cizilmemeli')
// The discover badge is an ICON, not TEXT.
assert.match(endSequenceUi, /<FansubDiscoverBadge iconOnly \/>/, 'the badge must show as an icon')
assert.doesNotMatch(endSequenceUi, /<FansubDiscoverBadge compact \/>/, 'badge text must not come back')
// Destek eylemleri kredi kartinin ICINDE.
assert.match(endSequenceUi, /supportInsideCredit \|\| credit\.ctaHref/, 'support must continue the credit card')
assert.match(endSequenceUi, /supportInsideCredit && supportActions\.includes\('takviye'\)/)
assert.match(endSequenceUi, /supportInsideCredit && supportActions\.includes\('bagis'\)/)

console.log('PASS reader v2 chapter end + closing credit contract verified')
