import { inspectStudioImage } from '../../functions/_shared/studio-image-validation.js'

const SHA256 = /^[0-9a-f]{64}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_SOURCE_BYTES = 20_000_000
const MAX_TILE_BYTES = 2 * 1024 * 1024
const MIME_EXTENSIONS = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }

function error(status) {
  return new Response(null, { status, headers: { 'cache-control': 'private, no-store' } })
}

async function boundedJson(request) {
  if (request.headers.get('content-type') !== 'application/json' || !request.body) return null
  const reader = request.body.getReader()
  const chunks = []
  let length = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > 2048) return null
      chunks.push(value)
    }
    return JSON.parse(new TextDecoder().decode(await new Blob(chunks).arrayBuffer()))
  } catch {
    return null
  } finally {
    await reader.cancel().catch(() => {})
  }
}

function validInput(input) {
  const raw = input?.raw
  const tile = input?.tile
  const extension = MIME_EXTENSIONS[raw?.mimeType]
  if (!extension || typeof raw?.sha256 !== 'string' || !SHA256.test(raw.sha256)
    || typeof raw?.pageId !== 'string' || !UUID.test(raw.pageId)
    || raw.objectKey !== `pages/${raw.pageId}/${raw.sha256}.${extension}`
    || !Number.isSafeInteger(raw.byteSize) || raw.byteSize < 1 || raw.byteSize > MAX_SOURCE_BYTES
    || !Number.isInteger(raw.width) || !Number.isInteger(raw.height)
    || raw.width < 1 || raw.height < 1 || raw.width > 10_000 || raw.height > 30_000
    || raw.width * raw.height > 50_000_000
    || !Number.isInteger(tile?.x) || !Number.isInteger(tile?.y)
    || !Number.isInteger(tile?.width) || !Number.isInteger(tile?.height)
    || tile.x < 0 || tile.y < 0 || tile.width < 1 || tile.height < 1
    || tile.width > 1024 || tile.height > 1024
    || tile.x + tile.width > raw.width || tile.y + tile.height > raw.height) return false
  return true
}

/** No image other than R2 raw can be input for a tile going to OCR. */
export async function handleStudioImageTile(request, env) {
  if (request.method !== 'POST') return error(405)
  const input = await boundedJson(request)
  if (!validInput(input)) return error(400)
  if (typeof env?.TYPESET_RAW_BUCKET?.get !== 'function'
    || typeof env?.IMAGES?.input !== 'function') return error(503)
  const { raw, tile } = input
  let object
  try {
    object = await env.TYPESET_RAW_BUCKET.get(raw.objectKey)
  } catch {
    return error(503)
  }
  if (!object?.body || object.size !== raw.byteSize
    || object.customMetadata?.sha256 !== raw.sha256) return error(503)
  try {
    const image = await env.IMAGES.input(object.body)
      .transform({
        background: '#ffffff',
        trim: {
          top: tile.y,
          right: raw.width - tile.x - tile.width,
          bottom: raw.height - tile.y - tile.height,
          left: tile.x,
        },
      })
      .output({ format: 'image/jpeg', quality: 70 })
    const transformed = image.response()
    if (!transformed.ok) return error(503)
    const bytes = new Uint8Array(await transformed.arrayBuffer())
    const inspected = inspectStudioImage(bytes, {
      maxBytes: MAX_TILE_BYTES, maxWidth: 1024, maxHeight: 1024, maxPixels: 1_048_576,
    })
    if (inspected.mimeType !== 'image/jpeg'
      || inspected.width !== tile.width || inspected.height !== tile.height) return error(502)
    return new Response(bytes, {
      headers: {
        'content-type': 'image/jpeg',
        'content-length': String(bytes.length),
        'cache-control': 'private, no-store',
        'x-content-type-options': 'nosniff',
      },
    })
  } catch {
    return error(503)
  }
}

export default { fetch: handleStudioImageTile }
