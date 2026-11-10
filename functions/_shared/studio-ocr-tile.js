import { inspectStudioImage, StudioImageError } from './studio-image-validation.js'

const SHA256 = /^[0-9a-f]{64}$/
const MAX_SOURCE_BYTES = 20_000_000
const MAX_TILE_BYTES = 2 * 1024 * 1024
const MIME_EXTENSIONS = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }

export class StudioOcrTileError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

/**
 * The key and digest from the access RPC are verified together; only the private raw
 * object the database points to is passed to the separate Worker.
 */
export function assertStudioOcrRawAccess(pageId, access, page) {
  const sha256 = access?.sha256
  const mimeType = access?.mime_type
  const byteSize = access?.byte_size
  const extension = MIME_EXTENSIONS[mimeType]
  if (typeof sha256 !== 'string' || !SHA256.test(sha256) || !extension
    || !Number.isSafeInteger(byteSize) || byteSize < 1
    || access?.object_key !== `pages/${pageId}/${sha256}.${extension}`
    || !Number.isInteger(access?.width) || !Number.isInteger(access?.height)
    || access.width < 1 || access.height < 1
    || access?.width !== page.raw_width || access?.height !== page.raw_height) {
    throw new StudioOcrTileError(502, 'Ham görsel kaydı doğrulanamadı.')
  }
  if (byteSize > MAX_SOURCE_BYTES) {
    throw new StudioOcrTileError(413,
      'Bu raw görsel otomatik tarama için 20 MB sınırını aşıyor. Daha küçük bir görsel yükleyin veya metinleri elle işaretleyin.')
  }
  return {
    pageId, sha256, mimeType, byteSize, objectKey: access.object_key,
    width: access.width, height: access.height,
  }
}

export async function readStudioOcrTile(env, raw, tile) {
  if (typeof env?.STUDIO_IMAGE_WORKER?.fetch !== 'function') {
    throw new StudioOcrTileError(503, 'Özel görsel işleme servisi hazır değil.')
  }
  let response
  try {
    response = await env.STUDIO_IMAGE_WORKER.fetch(new Request('https://studio-image.internal/tile', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ raw, tile }),
      signal: AbortSignal.timeout(30_000),
    }))
  } catch {
    throw new StudioOcrTileError(503, 'Raw görsel karosu hazırlanamadı.')
  }
  if (!response.ok) {
    throw new StudioOcrTileError(response.status === 413 ? 413 : 503,
      response.status === 413 ? 'Raw görsel karosu boyut sınırını aşıyor.' : 'Raw görsel karosu hazırlanamadı.')
  }
  const contentLength = Number(response.headers.get('content-length'))
  if (!Number.isSafeInteger(contentLength) || contentLength < 1 || contentLength > MAX_TILE_BYTES) {
    throw new StudioOcrTileError(503, 'Görsel servisi geçersiz karo boyutu döndürdü.')
  }
  // Instead of trusting the service response, the bytes going to OpenAI are inspected separately.
  const bytes = new Uint8Array(await response.arrayBuffer())
  let inspected
  try {
    inspected = inspectStudioImage(bytes, {
      maxBytes: MAX_TILE_BYTES, maxWidth: 2048, maxHeight: 2048, maxPixels: 4_000_000,
    })
  } catch (error) {
    if (error instanceof StudioImageError) {
      throw new StudioOcrTileError(502, 'Görsel servisi geçersiz karo döndürdü.')
    }
    throw error
  }
  if (bytes.length !== contentLength || inspected.mimeType !== 'image/jpeg'
    || inspected.width !== tile.width || inspected.height !== tile.height) {
    throw new StudioOcrTileError(502, 'Raw görsel karosu doğrulanamadı.')
  }
  return { bytes, mimeType: inspected.mimeType }
}
