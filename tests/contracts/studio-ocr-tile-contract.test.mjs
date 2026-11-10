import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import sharp from 'sharp'
import {
  assertStudioOcrRawAccess,
  readStudioOcrTile,
  StudioOcrTileError,
} from '../../functions/_shared/studio-ocr-tile.js'
import { handleStudioImageTile } from '../../workers/studio-image/index.js'

const pageId = '11111111-1111-4111-8111-111111111111'
const sha256 = 'a'.repeat(64)
const source = await sharp({
  create: { width: 8, height: 8, channels: 3, background: '#ffffff' },
}).composite([{
  input: await sharp({ create: { width: 4, height: 4, channels: 3, background: '#cc3333' } }).png().toBuffer(),
  left: 4, top: 0,
}]).png().toBuffer()
const rawAccess = {
  object_key: `pages/${pageId}/${sha256}.png`, sha256,
  mime_type: 'image/png', byte_size: source.length, width: 8, height: 8,
}
const raw = assertStudioOcrRawAccess(pageId, rawAccess, { raw_width: 8, raw_height: 8 })
const tile = { x: 4, y: 0, width: 4, height: 4, pageWidth: 8, pageHeight: 8 }

assert.throws(() => assertStudioOcrRawAccess(pageId, {
  ...rawAccess, object_key: `pages/${pageId}/foreign.png`,
}, { raw_width: 8, raw_height: 8 }), StudioOcrTileError)
assert.throws(() => assertStudioOcrRawAccess(pageId, {
  ...rawAccess, byte_size: 20_000_001,
}, { raw_width: 8, raw_height: 8 }), (error) => error.status === 413)
assert.throws(() => assertStudioOcrRawAccess(pageId, rawAccess, {
  raw_width: 9, raw_height: 8,
}), StudioOcrTileError)

let requestedKey = null
let transform = null
const env = {
  TYPESET_RAW_BUCKET: {
    async get(key) {
      requestedKey = key
      return {
        size: source.length,
        customMetadata: { sha256 },
        body: new Blob([source]).stream(),
      }
    },
  },
  IMAGES: {
    input() {
      return {
        transform(options) { transform = options; return this },
        async output(options) {
          assert.equal(options.format, 'image/jpeg')
          const trim = transform.trim
          const bytes = await sharp(source).extract({
            left: trim.left, top: trim.top,
            width: 8 - trim.left - trim.right,
            height: 8 - trim.top - trim.bottom,
          }).jpeg({ quality: options.quality }).toBuffer()
          return { response: () => new Response(bytes) }
        },
      }
    },
  },
}
const workerRequest = (override = {}) => new Request('https://studio-image.internal/tile', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ raw, tile, ...override }),
})
const workerResponse = await handleStudioImageTile(workerRequest(), env)
assert.equal(workerResponse.status, 200)
assert.equal(requestedKey, rawAccess.object_key)
assert.deepEqual(transform, {
  background: '#ffffff', trim: { top: 0, right: 0, bottom: 4, left: 4 },
})
const expected = await sharp(source).extract({ left: 4, top: 0, width: 4, height: 4 })
  .jpeg({ quality: 70 }).toBuffer()
assert.deepEqual(Buffer.from(await workerResponse.arrayBuffer()), expected)

const invalidCoords = await handleStudioImageTile(workerRequest({ tile: { ...tile, x: 7 } }), env)
assert.equal(invalidCoords.status, 400)
const foreignObject = await handleStudioImageTile(workerRequest({ raw: {
  ...raw, objectKey: 'pages/other/raw.png',
} }), env)
assert.equal(foreignObject.status, 400)
const badStoredMetadata = await handleStudioImageTile(workerRequest(), {
  ...env, TYPESET_RAW_BUCKET: { get: async () => ({
    size: source.length, customMetadata: { sha256: 'b'.repeat(64) }, body: new Blob([source]).stream(),
  }) },
})
assert.equal(badStoredMetadata.status, 503)

let serviceCall
const pagesEnv = { STUDIO_IMAGE_WORKER: {
  async fetch(request) {
    serviceCall = await request.json()
    const bytes = await sharp(source).extract({ left: 4, top: 0, width: 4, height: 4 })
      .jpeg({ quality: 70 }).toBuffer()
    return new Response(bytes, { headers: { 'content-length': String(bytes.length) } })
  },
} }
const fromService = await readStudioOcrTile(pagesEnv, raw, tile)
assert.equal(fromService.mimeType, 'image/jpeg')
assert.deepEqual(serviceCall, { raw, tile })
assert.deepEqual(Buffer.from(fromService.bytes), expected)
await assert.rejects(readStudioOcrTile({}, raw, tile), (error) => error.status === 503)
await assert.rejects(readStudioOcrTile({ STUDIO_IMAGE_WORKER: {
  fetch: async () => new Response(source, { headers: { 'content-length': String(source.length) } }),
} }, raw, tile), (error) => error.status === 502)

// Translation Studio V3 scan and re-read endpoints: a tile is cropped only from the private raw object
// the DB points to; a file sent by the client does not go to the model.
for (const path of ['../../functions/api/ceviri/scan.js', '../../functions/api/ceviri/reread.js']) {
  const scanSource = await readFile(new URL(path, import.meta.url), 'utf8')
  assert.match(scanSource, /loadPageForUser\(db,/)
  assert.match(scanSource, /\(deps\.readTile \?\? readStudioOcrTile\)\(env,/)
  assert.doesNotMatch(scanSource, /form\.get\('file'\)|file\.arrayBuffer\(\)/)
}

console.log('PASS studio OCR tile is cropped from the private R2 source; foreign image, key and size are rejected')
