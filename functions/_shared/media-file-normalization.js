const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff]
const GIF87A_SIGNATURE = [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]
const GIF89A_SIGNATURE = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]
const WEBM_SIGNATURE = [0x1a, 0x45, 0xdf, 0xa3]

function hasSignature(bytes, signature) {
  return signature.every((value, index) => bytes[index] === value)
}

function containsAscii(bytes, token) {
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

function readAscii(bytes, start, length) {
  return new TextDecoder('ascii').decode(bytes.slice(start, start + length))
}

async function readSignatureBytes(file, maxBytes = 64 * 1024) {
  const slice = file.slice(0, Math.min(file.size, maxBytes))
  const buffer = await slice.arrayBuffer()
  return new Uint8Array(buffer)
}

async function readAllBytes(file) {
  const buffer = await file.arrayBuffer()
  return new Uint8Array(buffer)
}

function readUint16LE(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8)
}

function readUint16BE(bytes, offset) {
  return (bytes[offset] << 8) | bytes[offset + 1]
}

function readUint24LE(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16)
}

function readUint32LE(bytes, offset) {
  return bytes[offset]
    | (bytes[offset + 1] << 8)
    | (bytes[offset + 2] << 16)
    | (bytes[offset + 3] << 24)
}

function readUint32BE(bytes, offset) {
  return ((bytes[offset] << 24) >>> 0)
    | (bytes[offset + 1] << 16)
    | (bytes[offset + 2] << 8)
    | bytes[offset + 3]
}

function normalizeFrameDurationMs(durationMs) {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return 100
  return Math.max(20, Math.round(durationMs))
}

function parseApngDurationMs(bytes) {
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

function skipGifSubBlocks(bytes, offset) {
  let cursor = offset
  while (cursor < bytes.length) {
    const blockSize = bytes[cursor]
    cursor += 1
    if (blockSize === 0) break
    cursor += blockSize
  }
  return cursor
}

function parseGifDurationMs(bytes) {
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
  let pendingDelayMs = null
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

function parseAnimatedWebPDurationMs(bytes) {
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

async function resolveAnimatedDurationMs(file, mimeType, extension, mediaKind) {
  if (mediaKind !== 'animated-image') return null

  const bytes = await readAllBytes(file)
  if (mimeType === 'image/png' || extension === 'png') return parseApngDurationMs(bytes)
  if (mimeType === 'image/gif' || extension === 'gif') return parseGifDurationMs(bytes)
  if (mimeType === 'image/webp' || extension === 'webp') return parseAnimatedWebPDurationMs(bytes)
  return null
}

function renameFileWithDetectedType(file, mimeType, extension) {
  const baseName = file.name.replace(/\.[^.]+$/, '') || 'upload'
  return new File([file], `${baseName}.${extension}`, {
    type: mimeType,
    lastModified: file.lastModified,
  })
}

function inferFromMimeOrName(file) {
  // Why: File.type and the file name are attacker controlled; if the magic bytes are not recognized
  // we fall back to a safe unknown so a fake MIME cannot pass the upload allowlist.
  return {
    file,
    mimeType: 'application/octet-stream',
    extension: 'bin',
    mediaKind: 'unknown',
    durationMs: null,
  }
}

export async function normalizeUploadFile(file) {
  const bytes = await readSignatureBytes(file)

  if (hasSignature(bytes, PNG_SIGNATURE)) {
    const mediaKind = containsAscii(bytes, 'acTL') ? 'animated-image' : 'static-image'
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
    const mediaKind = containsAscii(bytes, 'ANIM') || containsAscii(bytes, 'ANMF')
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
    return {
      file: normalizedFile,
      mimeType: 'video/webm',
      extension: 'webm',
      mediaKind: 'video',
      durationMs: null,
    }
  }

  if (readAscii(bytes, 4, 4) === 'ftyp') {
    const normalizedFile = file.type === 'video/mp4' && /\.mp4$/i.test(file.name)
      ? file
      : renameFileWithDetectedType(file, 'video/mp4', 'mp4')
    return {
      file: normalizedFile,
      mimeType: 'video/mp4',
      extension: 'mp4',
      mediaKind: 'video',
      durationMs: null,
    }
  }

  return inferFromMimeOrName(file)
}
