import assert from 'node:assert/strict'
import {
  dedupeItems, isFragmentPair, mergeDetectedItems, normalizeAlternatives, normalizeDetectedItems, normalizeDraft, retryAfterMs, routeCost,
  runRoutes, TranslationAiError,
} from '../../functions/_shared/translation-ai.js'
import { planTiles } from '../../functions/api/ceviri/scan.js'
import { orderItems, suggestedFontSize } from '../../functions/api/ceviri/translate.js'

// The model box scales from the 0-1000 tile space to natural page pixels.
const tile = { x: 0, y: 1000, width: 800, height: 1000, pageWidth: 800, pageHeight: 3000 }
const detected = normalizeDetectedItems({
  items: [
    { type: 'balon', shape: 'elips', text: 'どこへ', left: 500, top: 100, right: 750, bottom: 300, confidence: 0.96, font_px: 20 },
    { type: 'sfx', shape: 'yok', text: '', left: 0, top: 0, right: 100, bottom: 100, confidence: 0.9, font_px: 60 },
    { type: 'bilinmez', shape: 'elips', text: 'x', left: 0, top: 0, right: 10, bottom: 10, confidence: 1, font_px: 5 },
    { type: 'balon', shape: 'elips', text: 'y', left: -5, top: 0, right: 10, bottom: 10, confidence: 1, font_px: 5 },
  ],
}, tile)
assert.equal(detected.length, 2)
assert.deepEqual(detected[0].bbox, { x: 400, y: 1100, w: 200, h: 200 })
assert.equal(detected[0].fontPx, 20)
assert.equal(detected[1].confidence, 0, 'empty text confidence must be zero')

// The same balloon in overlapping tiles is not saved twice.
const kept = dedupeItems([{ x: 400, y: 1100, w: 200, h: 200 }], [
  { bbox: { x: 410, y: 1110, w: 150, h: 150 } },
  { bbox: { x: 0, y: 0, w: 50, h: 50 } },
])
assert.equal(kept.length, 1)
assert.deepEqual(kept[0].bbox, { x: 0, y: 0, w: 50, h: 50 })

// The tile plan covers the page without gaps and does not exceed 1024.
const tiles = planTiles(800, 5000)
assert.ok(tiles.every((t) => t.width <= 1024 && t.height <= 1024 && t.y + t.height <= 5000))
assert.equal(tiles[tiles.length - 1].y + tiles[tiles.length - 1].height, 5000)
for (let i = 1; i < tiles.length; i += 1) assert.ok(tiles[i - 1].y + tiles[i - 1].height - tiles[i].y >= 256, 'karolar en az 256px ortusur')
assert.equal(planTiles(600, 900).length, 1)

// Okuma sirasi: manga sagdan sola, webtoon soldan saga.
const items = [
  { id: 'sol', bbox_x: 20, bbox_y: 40, bbox_w: 150, bbox_h: 100 },
  { id: 'sag', bbox_x: 400, bbox_y: 44, bbox_w: 180, bbox_h: 150 },
  { id: 'alt', bbox_x: 40, bbox_y: 600, bbox_w: 150, bbox_h: 100 },
]
assert.deepEqual(orderItems(items, 'ja').map((i) => i.id), ['sag', 'sol', 'alt'])
assert.deepEqual(orderItems(items, 'ko').map((i) => i.id), ['sol', 'sag', 'alt'])
assert.equal(suggestedFontSize({ type: 'sfx', source_font_size: null }, 800), 56)
assert.equal(suggestedFontSize({ type: 'balon', source_font_size: 20 }, 800), 17)

// Draft: a missing item does not drop the batch, an invalid font falls back to default.
const drafts = normalizeDraft({
  items: [
    { id: 'a', text: 'Nereye gittiğini sanıyorsun?', font: 'diyalog', reason: 'Standart' },
    { id: 'b', text: 'GÜM', font: 'olmayan', reason: '' },
    { id: 'z', text: 'yabanci', font: 'sfx', reason: '' },
  ],
}, ['a', 'b', 'c'])
assert.equal(drafts.size, 2)
assert.equal(drafts.get('b').font, 'diyalog')
assert.throws(() => normalizeDraft({ items: [] }, ['a']), TranslationAiError)
// Kaynak sutun satir sonlari ceviriye tasinmaz; dizgi satiri kendisi kirar.
assert.equal(normalizeDraft({ items: [{ id: 'a', text: 'Gunluk de\n gil ay', font: 'yumusak', reason: '' }] }, ['a']).get('a').text,
  'Gunluk de gil ay')

const alts = normalizeAlternatives({
  items: [{ id: 'a', alternatives: ['nereye gittiğini sanıyorsun?', 'Nereye gidiyorsun sen?', 'Nereye?', 'Fazla'] }],
}, drafts)
assert.deepEqual(alts.get('a'), ['Nereye gidiyorsun sen?', 'Nereye?'], 'draft repeats must be dropped, at most 2 alternatives')

assert.equal(routeCost({ input_cost_per_mtok: 0.4, output_cost_per_mtok: 1.6 }, { input: 1_000_000, output: 500_000 }), 1.2)

// Routing: an unconfigured provider is skipped, a failing model falls to the next one.
const calls = []
const fetchImpl = async (url, init) => {
  calls.push(url)
  const body = JSON.parse(init.body)
  if (url.includes('openai')) {
    assert.equal(body.text.format.strict, true)
    assert.equal(body.store, false)
    return new Response('{}', { status: 500 })
  }
  if (url.includes('googleapis')) {
    assert.ok(!JSON.stringify(body.generationConfig.responseSchema).includes('additionalProperties'))
    assert.equal(init.headers['x-goog-api-key'], 'g-key')
    return Response.json({
      candidates: [{ content: { parts: [{ text: JSON.stringify({ ok: true }) }] } }],
      usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20 },
    })
  }
  throw new Error(`beklenmeyen ${url}`)
}
const run = await runRoutes([
  { provider: 'anthropic', model: 'claude-haiku-4-5', input_cost_per_mtok: 1, output_cost_per_mtok: 5 },
  { provider: 'openai', model: 'gpt-4.1-mini', input_cost_per_mtok: 0.4, output_cost_per_mtok: 1.6 },
  { provider: 'google', model: 'gemini-3.8-flash', input_cost_per_mtok: 0.75, output_cost_per_mtok: 3.75 },
], { OPENAI_API_KEY: 'o-key', GEMINI_API_KEY: 'g-key' }, {
  name: 't', schema: { type: 'object', additionalProperties: false, properties: { ok: { type: 'boolean' } } },
  instructions: 'i', text: 'x', maxTokens: 10,
}, { fetchImpl })
assert.equal(calls.length, 2, 'anahtari olmayan anthropic cagrilmamali')
assert.equal(run.route.provider, 'google')
assert.deepEqual(run.usage, { input: 100, output: 20 })

await assert.rejects(
  runRoutes([{ provider: 'openai', model: 'm' }], {}, { name: 't', schema: {}, instructions: '', text: '', maxTokens: 1 }),
  (error) => error instanceof TranslationAiError && error.code === 'not_configured',
)

// Anthropic: structured output is obtained with a required tool.
const anthropic = await runRoutes([{ provider: 'anthropic', model: 'claude-haiku-4-5' }], { ANTHROPIC_API_KEY: 'a' }, {
  name: 'draft', schema: { type: 'object' }, instructions: 'i', text: 'x', maxTokens: 10,
}, {
  fetchImpl: async (_url, init) => {
    const body = JSON.parse(init.body)
    assert.deepEqual(body.tool_choice, { type: 'tool', name: 'draft' })
    assert.equal(init.headers['x-api-key'], 'a')
    return Response.json({ content: [{ type: 'tool_use', name: 'draft', input: { v: 1 } }], usage: { input_tokens: 3, output_tokens: 4 } })
  },
})
assert.deepEqual(anthropic.value, { v: 1 })

// An area cut at a tile edge: the first tile sees the part, the next tile sees all of it.
// The full copy replaces the part (not first come); a cut copy cannot delete the full one.
const edgeTile = { x: 0, y: 0, width: 800, height: 1024, pageWidth: 800, pageHeight: 3000 }
const cut = normalizeDetectedItems({ items: [
  { type: 'anlatim', shape: 'kutu', text: '実技', left: 100, top: 900, right: 300, bottom: 1000, confidence: 0.9, font_px: 20 },
] }, edgeTile)
assert.equal(cut[0].edgeCut, true, 'a box touching an interior tile edge counts as cut')
const pageEdge = normalizeDetectedItems({ items: [
  { type: 'balon', shape: 'elips', text: 'a', left: 0, top: 0, right: 200, bottom: 200, confidence: 0.9, font_px: 20 },
] }, edgeTile)
assert.equal(pageEdge[0].edgeCut, false, 'the page own edge does not count as cut')
const partial = { id: 'parca', x: 80, y: 922, w: 160, h: 102 }
const merged = mergeDetectedItems([partial], [
  { bbox: { x: 80, y: 922, w: 160, h: 300 }, edgeCut: false },
])
assert.deepEqual(merged.replace, ['parca'], 'tam kopya kesik parcanin yerine gecer')
assert.equal(merged.insert.length, 1)
assert.equal(mergeDetectedItems([{ id: 'tam', x: 80, y: 922, w: 160, h: 300 }], [
  { bbox: { x: 80, y: 922, w: 160, h: 102 }, edgeCut: true },
]).insert.length, 0, 'kesik kopya eklenmez')
assert.deepEqual(mergeDetectedItems([{ id: null, x: 80, y: 922, w: 160, h: 102 }], [
  { bbox: { x: 80, y: 922, w: 160, h: 300 }, edgeCut: false },
]).replace, [], 'elle eklenen (kimliksiz) oge silinmez')

// The model can shift the cut part's box (a real page: "もので" did not overlap the full box at all).
// Same type + proximity + line-by-line text part => same area; the full copy deletes the part.
const fragment = (type, text, x, y, w, h) => ({ type, sourceText: text, bbox: { x, y, w, h } })
assert.equal(isFragmentPair(fragment('anlatim', 'もので', 965, 783, 59, 120),
  fragment('anlatim', 'ところがその\n国家試験は\n医学の知識をみ\nもので', 1039, 830, 126, 194)), true)
assert.equal(isFragmentPair(fragment('anlatim', '実技\n含ま', 127, 935, 193, 89),
  fragment('anlatim', '実技試験などは\n含まれていない', 136, 990, 125, 230)), true)
assert.equal(isFragmentPair(fragment('sfx', 'ゴシ', 817, 129, 60, 121), fragment('sfx', 'ゴシ', 626, 323, 58, 109)), false,
  'side by side identical SFX copies stay separate')
assert.equal(isFragmentPair(fragment('balon', 'はい', 532, 1387, 98, 203), fragment('anlatim', 'ではいけない', 500, 1300, 300, 300)), false,
  'farkli tur birlestirilmez')
assert.equal(isFragmentPair(fragment('anlatim', 'もので', 100, 100, 50, 50), fragment('anlatim', 'xxもので', 900, 1500, 100, 100)), false,
  'distant areas do not merge')
const shifted = mergeDetectedItems([{ id: 'kesik', type: 'anlatim', text: '実技\n含ま', x: 127, y: 935, w: 193, h: 89 }], [
  { type: 'anlatim', sourceText: '実技試験などは\n含まれていない', bbox: { x: 136, y: 990, w: 125, h: 230 }, edgeCut: false },
])
assert.deepEqual(shifted.replace, ['kesik'])
assert.equal(shifted.insert.length, 1)

// Busy/quota (429/503): after the suggested short wait the same route once more,
// then the next model with a separate quota is tried.
assert.equal(retryAfterMs(new Response('', { headers: { 'retry-after': '3' } })), 3000)
assert.equal(retryAfterMs(new Response(''), '{"error":{"details":[{"retryDelay": "12.5s"}]}}'), 12500)
const busyCalls = []
const waits = []
const busy = await runRoutes([
  { provider: 'google', model: 'gemini-3.8-flash' },
  { provider: 'google', model: 'gemini-3.5-flash-lite' },
], { GEMINI_API_KEY: 'g' }, { name: 't', schema: { type: 'object' }, instructions: 'i', text: 'x', maxTokens: 10 }, {
  sleep: async (ms) => { waits.push(ms) },
  fetchImpl: async (url) => {
    busyCalls.push(String(url).includes('lite') ? 'lite' : 'flash')
    if (!String(url).includes('lite')) {
      return Response.json({ error: { message: 'high demand', details: [{ retryDelay: '1s' }] } }, { status: 503 })
    }
    return Response.json({ candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }], usageMetadata: {} })
  },
})
assert.deepEqual(busyCalls, ['flash', 'flash', 'lite'])
assert.deepEqual(waits, [1000])
assert.equal(busy.route.model, 'gemini-3.5-flash-lite')
const longWait = []
await assert.rejects(runRoutes([{ provider: 'google', model: 'g' }], { GEMINI_API_KEY: 'g' }, {
  name: 't', schema: {}, instructions: '', text: '', maxTokens: 1,
}, {
  sleep: async (ms) => { longWait.push(ms) },
  fetchImpl: async () => Response.json({ error: { details: [{ retryDelay: '40s' }] } }, { status: 429 }),
}), (error) => error.code === 'provider_busy')
assert.deepEqual(longWait, [], 'a long quota wait is not waited inside the request')

console.log('PASS translation studio v3 service contract (detect, tile, reading order, model routing)')

// Quota/busy reaches the client as 429 + Retry-After; the scan waits and retries without failing the page.
const { errorResponse } = await import('../../functions/_shared/translation-http.js')
const busyError = new TranslationAiError('provider_busy', 'yogun')
busyError.retryAfterMs = 37_500
const busyResponse = errorResponse(busyError)
assert.equal(busyResponse.status, 429)
assert.equal(busyResponse.headers.get('retry-after'), '38')
const scanSource = (await import('node:fs')).readFileSync(new URL('../../src/pages/translationStudio/StepScan.tsx', import.meta.url), 'utf8')
assert.match(scanSource, /withBusyRetry\(\(\) => scanTile\(/)
assert.match(scanSource, /withBusyRetry\(\(\) => translatePage\(/)
console.log('PASS translation studio v3 quota wait (429 Retry-After, client retry)')
