type NormalizedMediaKind = 'static-image' | 'animated-image' | 'video' | 'unknown'

export interface NormalizedUploadFileResult {
  file: File
  mimeType: string
  extension: string
  mediaKind: NormalizedMediaKind
  durationMs?: number | null
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff]
const GIF87A_SIGNATURE = [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]
const GIF89A_SIGNATURE = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]
const WEBM_SIGNATURE = [0x1a, 0x45, 0xdf, 0xa3]

function hasSignature(bytes: Uint8Array, signature: number[]) {
  return signature.every((value, index) => bytes[index] === value)
}

function containsAscii(bytes: Uint8Array, token: string) {
  const encoded = new TextEncoder().encode(token)
  outer: for (let index = 0; index <= bytes.length - encoded.length; index += 1) {
    for (let offset = 0; offset < encoded.length; offset += 1) {
      if (bytes[index + offset] !== encoded[offset]) {
        continue outer
      }
    }
    return true
  }
  return false
}

function readAscii(bytes: Uint8Array, start: number, length: number) {
  return new TextDecoder('ascii').decode(bytes.slice(start, start + length))
}

async function readSignatureBytes(file: Blob, maxBytes = 64 * 1024) {
  const slice = file.slice(0, Math.min(file.size, maxBytes))
  const buffer = await slice.arrayBuffer()
  return new Uint8Array(buffer)
}

async function readAllBytes(file: Blob) {
  const buffer = await file.arrayBuffer()
  return new Uint8Array(buffer)
}

function readUint16LE(bytes: Uint8Array, offset: number) {
  return bytes[offset] | (bytes[offset + 1] << 8)
}

function readUint16BE(bytes: Uint8Array, offset: number) {
  return (bytes[offset] << 8) | bytes[offset + 1]
}

function readUint24LE(bytes: Uint8Array, offset: number) {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16)
}

function readUint32LE(bytes: Uint8Array, offset: number) {
  return bytes[offset]
    | (bytes[offset + 1] << 8)
    | (bytes[offset + 2] << 16)
    | (bytes[offset + 3] << 24)
}

function readUint32BE(bytes: Uint8Array, offset: number) {
  return ((bytes[offset] << 24) >>> 0)
    | (bytes[offset + 1] << 16)
    | (bytes[offset + 2] << 8)
    | bytes[offset + 3]
}

function normalizeFrameDurationMs(durationMs: number) {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return 100
  return Math.max(20, Math.round(durationMs))
}

function parseApngDurationMs(bytes: Uint8Array) {
  if (!hasSignature(bytes, PNG_SIGNATURE)) return null

  let offset = PNG_SIGNATURE.length
  let totalDurationMs = 0
  let frameCount = 0

  while (offset + 12 <= bytes.length) {
    const chunkLength = readUint32BE(bytes, offset)
    const chunkType = readAscii(bytes, offset + 4, 4)
    const chunkDataOffset = offset + 8
    const nextChunkOffset = chunkDataOffset + chunkLength + 4

    if (chunkType === 'fcTL' && chunkDataOffset + chunkLength <= bytes.length && chunkLength >= 26) {
      const delayNum = readUint16BE(bytes, chunkDataOffset + 20)
      const delayDen = readUint16BE(bytes, chunkDataOffset + 22) || 100
      totalDurationMs += normalizeFrameDurationMs((delayNum / delayDen) * 1000)
      frameCount += 1
    }

    if (chunkType === 'IEND') break
    if (nextChunkOffset <= offset) break
    offset = nextChunkOffset
  }

  return frameCount > 0 ? totalDurationMs : null
}

function skipGifSubBlocks(bytes: Uint8Array, offset: number) {
  let cursor = offset
  while (cursor < bytes.length) {
    const blockSize = bytes[cursor]
    cursor += 1
    if (blockSize === 0) break
    cursor += blockSize
  }
  return cursor
}

function parseGifDurationMs(bytes: Uint8Array) {
  if (!hasSignature(bytes, GIF87A_SIGNATURE) && !hasSignature(bytes, GIF89A_SIGNATURE)) return null
  if (bytes.length < 13) return null

  let offset = 6
  const packed = bytes[offset + 4]
  offset += 7

  if ((packed & 0x80) !== 0) {
    const globalColorTableSize = 3 * (2 ** ((packed & 0x07) + 1))
    offset += globalColorTableSize
  }

  let totalDurationMs = 0
  let pendingDelayMs: number | null = null
  let frameCount = 0

  while (offset < bytes.length) {
    const marker = bytes[offset]

    if (marker === 0x3b) break

    if (marker === 0x21) {
      const label = bytes[offset + 1]
      if (label === 0xf9 && offset + 7 < bytes.length) {
        const delayCs = readUint16LE(bytes, offset + 4)
        pendingDelayMs = normalizeFrameDurationMs(delayCs * 10)
        offset += 8
        continue
      }

      offset = skipGifSubBlocks(bytes, offset + 2)
      continue
    }

    if (marker === 0x2c) {
      if (offset + 9 >= bytes.length) break
      const localPacked = bytes[offset + 9]
      offset += 10

      if ((localPacked & 0x80) !== 0) {
        const localColorTableSize = 3 * (2 ** ((localPacked & 0x07) + 1))
        offset += localColorTableSize
      }

      offset += 1
      offset = skipGifSubBlocks(bytes, offset)
      totalDurationMs += pendingDelayMs ?? 100
      pendingDelayMs = null
      frameCount += 1
      continue
    }

    offset += 1
  }

  return frameCount > 0 ? totalDurationMs : null
}

function parseAnimatedWebPDurationMs(bytes: Uint8Array) {
  if (readAscii(bytes, 0, 4) !== 'RIFF' || readAscii(bytes, 8, 4) !== 'WEBP') return null

  let offset = 12
  let totalDurationMs = 0
  let frameCount = 0

  while (offset + 8 <= bytes.length) {
    const chunkType = readAscii(bytes, offset, 4)
    const chunkSize = readUint32LE(bytes, offset + 4)
    const chunkDataOffset = offset + 8
    const paddedChunkSize = chunkSize + (chunkSize % 2)
    const nextChunkOffset = chunkDataOffset + paddedChunkSize

    if (chunkType === 'ANMF' && chunkDataOffset + chunkSize <= bytes.length && chunkSize >= 16) {
      totalDurationMs += normalizeFrameDurationMs(readUint24LE(bytes, chunkDataOffset + 12))
      frameCount += 1
    }

    if (nextChunkOffset <= offset) break
    offset = nextChunkOffset
  }

  return frameCount > 0 ? totalDurationMs : null
}

async function resolveAnimatedDurationMs(file: File, mimeType: string, extension: string, mediaKind: NormalizedMediaKind) {
  if (mediaKind !== 'animated-image') return null

  const bytes = await readAllBytes(file)
  if (mimeType === 'image/png' || extension === 'png') return parseApngDurationMs(bytes)
  if (mimeType === 'image/gif' || extension === 'gif') return parseGifDurationMs(bytes)
  if (mimeType === 'image/webp' || extension === 'webp') return parseAnimatedWebPDurationMs(bytes)
  return null
}

async function resolveVideoDurationMs(file: File) {
  if (typeof window === 'undefined' || typeof document === 'undefined' || typeof URL === 'undefined') {
    return null
  }

  return await new Promise<number | null>((resolve) => {
    const objectUrl = URL.createObjectURL(file)
    const video = document.createElement('video')

    const cleanup = (durationMs: number | null) => {
      video.removeAttribute('src')
      video.load()
      URL.revokeObjectURL(objectUrl)
      resolve(durationMs)
    }

    video.preload = 'metadata'
    video.muted = true
    video.playsInline = true
    video.onloadedmetadata = () => {
      const durationMs = Number.isFinite(video.duration) && video.duration > 0
        ? Math.round(video.duration * 1000)
        : null
      cleanup(durationMs)
    }
    video.onerror = () => cleanup(null)
    video.src = objectUrl
  })
}

function inferFromMimeOrName(file: File): NormalizedUploadFileResult {
  // Why: File.type and the file name are attacker controlled; if the magic bytes are not recognized,
  // the client preview uses the same fail-closed decision as the server allowlist.
  return {
    file,
    mimeType: 'application/octet-stream',
    extension: 'bin',
    mediaKind: 'unknown',
    durationMs: null,
  }
}

function renameFileWithDetectedType(file: File, mimeType: string, extension: string) {
  const baseName = file.name.replace(/\.[^.]+$/, '') || 'upload'
  return new File([file], `${baseName}.${extension}`, {
    type: mimeType,
    lastModified: file.lastModified,
  })
}

export async function normalizeUploadFile(file: File): Promise<NormalizedUploadFileResult> {
  const bytes = await readSignatureBytes(file)

  if (hasSignature(bytes, PNG_SIGNATURE)) {
    const mediaKind: NormalizedMediaKind = containsAscii(bytes, 'acTL') ? 'animated-image' : 'static-image'
    const normalizedFile = file.type === 'image/png' && file.name.toLowerCase().endsWith('.png')
      ? file
      : renameFileWithDetectedType(file, 'image/png', 'png')
    const durationMs = mediaKind === 'animated-image'
      ? await resolveAnimatedDurationMs(normalizedFile, 'image/png', 'png', mediaKind)
      : null
    return {
      file: normalizedFile,
      mimeType: 'image/png',
      extension: 'png',
      mediaKind,
      durationMs,
    }
  }

  if (hasSignature(bytes, JPEG_SIGNATURE)) {
    const normalizedFile = file.type === 'image/jpeg' && /\.(jpe?g)$/i.test(file.name)
      ? file
      : renameFileWithDetectedType(file, 'image/jpeg', 'jpg')
    return {
      file: normalizedFile,
      mimeType: 'image/jpeg',
      extension: 'jpg',
      mediaKind: 'static-image',
      durationMs: null,
    }
  }

  if (hasSignature(bytes, GIF87A_SIGNATURE) || hasSignature(bytes, GIF89A_SIGNATURE)) {
    const normalizedFile = file.type === 'image/gif' && /\.gif$/i.test(file.name)
      ? file
      : renameFileWithDetectedType(file, 'image/gif', 'gif')
    const durationMs = await resolveAnimatedDurationMs(normalizedFile, 'image/gif', 'gif', 'animated-image')
    return {
      file: normalizedFile,
      mimeType: 'image/gif',
      extension: 'gif',
      mediaKind: 'animated-image',
      durationMs,
    }
  }

  const riffHeader = readAscii(bytes, 0, 4)
  const webpHeader = readAscii(bytes, 8, 4)
  if (riffHeader === 'RIFF' && webpHeader === 'WEBP') {
    const mediaKind: NormalizedMediaKind = containsAscii(bytes, 'ANIM') || containsAscii(bytes, 'ANMF')
      ? 'animated-image'
      : 'static-image'
    const normalizedFile = file.type === 'image/webp' && /\.webp$/i.test(file.name)
      ? file
      : renameFileWithDetectedType(file, 'image/webp', 'webp')
    const durationMs = mediaKind === 'animated-image'
      ? await resolveAnimatedDurationMs(normalizedFile, 'image/webp', 'webp', mediaKind)
      : null
    return {
      file: normalizedFile,
      mimeType: 'image/webp',
      extension: 'webp',
      mediaKind,
      durationMs,
    }
  }

  if (hasSignature(bytes, WEBM_SIGNATURE) && containsAscii(bytes, 'webm')) {
    const normalizedFile = file.type === 'video/webm' && /\.webm$/i.test(file.name)
      ? file
      : renameFileWithDetectedType(file, 'video/webm', 'webm')
    const durationMs = await resolveVideoDurationMs(normalizedFile)
    return {
      file: normalizedFile,
      mimeType: 'video/webm',
      extension: 'webm',
      mediaKind: 'video',
      durationMs,
    }
  }

  if (readAscii(bytes, 4, 4) === 'ftyp') {
    const normalizedFile = file.type === 'video/mp4' && /\.mp4$/i.test(file.name)
      ? file
      : renameFileWithDetectedType(file, 'video/mp4', 'mp4')
    const durationMs = await resolveVideoDurationMs(normalizedFile)
    return {
      file: normalizedFile,
      mimeType: 'video/mp4',
      extension: 'mp4',
      mediaKind: 'video',
      durationMs,
    }
  }

  return inferFromMimeOrName(file)
}

export async function isAnimatedImageFile(file: File): Promise<boolean> {
  const normalized = await normalizeUploadFile(file)
  return normalized.mediaKind === 'animated-image'
}
