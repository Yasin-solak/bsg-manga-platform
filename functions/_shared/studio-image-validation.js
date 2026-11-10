/**
 * Studio image type and size are read without trusting the file name.
 * OCR tiles can use the same validation with narrower limits.
 */

export const STUDIO_RAW_MAX_BYTES = 25 * 1024 * 1024
export const STUDIO_RAW_MAX_WIDTH = 10_000
export const STUDIO_RAW_MAX_HEIGHT = 30_000
export const STUDIO_RAW_MAX_PIXELS = 50_000_000

export class StudioImageError extends Error {
  constructor(message, status = 400) {
    super(message)
    this.name = 'StudioImageError'
    this.status = status
  }
}

function ascii(bytes, offset, length) {
  if (offset < 0 || offset + length > bytes.length) return ''
  return String.fromCharCode(...bytes.subarray(offset, offset + length))
}

function uint16be(bytes, offset) {
  return (bytes[offset] << 8) | bytes[offset + 1]
}

function uint16le(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8)
}

function uint24le(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16)
}

function uint32be(bytes, offset) {
  return ((bytes[offset] << 24) >>> 0)
    | (bytes[offset + 1] << 16)
    | (bytes[offset + 2] << 8)
    | bytes[offset + 3]
}

function uint32le(bytes, offset) {
  return (bytes[offset]
    | (bytes[offset + 1] << 8)
    | (bytes[offset + 2] << 16)
    | (bytes[offset + 3] << 24)) >>> 0
}

function pngDimensions(bytes) {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  if (!signature.every((value, index) => bytes[index] === value)) return null
  if (bytes.length < 45 || uint32be(bytes, 8) !== 13 || ascii(bytes, 12, 4) !== 'IHDR') {
    throw new StudioImageError('PNG başlığı geçersiz.')
  }

  const width = uint32be(bytes, 16)
  const height = uint32be(bytes, 20)
  let offset = 8
  let hasImageData = false
  let hasEnd = false
  while (offset + 12 <= bytes.length) {
    const length = uint32be(bytes, offset)
    const type = ascii(bytes, offset + 4, 4)
    const next = offset + 12 + length
    if (!Number.isSafeInteger(next) || next > bytes.length) {
      throw new StudioImageError('PNG dosyası eksik veya bozuk.')
    }
    if (type === 'acTL') throw new StudioImageError('Hareketli PNG desteklenmiyor.')
    if (type === 'IDAT') hasImageData = true
    if (type === 'IEND') {
      if (length !== 0) throw new StudioImageError('PNG bitiş kaydı geçersiz.')
      hasEnd = true
      break
    }
    offset = next
  }
  if (!hasImageData || !hasEnd) throw new StudioImageError('PNG görüntü verisi eksik.')
  return { mimeType: 'image/png', width, height }
}

function jpegDimensions(bytes) {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return null
  if (bytes.at(-2) !== 0xff || bytes.at(-1) !== 0xd9) {
    throw new StudioImageError('JPEG dosyası eksik veya bozuk.')
  }

  let offset = 2
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) throw new StudioImageError('JPEG bölüm başlığı geçersiz.')
    while (bytes[offset] === 0xff) offset += 1
    const marker = bytes[offset]
    offset += 1
    if (marker === 0xd9) break
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue
    if (offset + 2 > bytes.length) break
    const length = uint16be(bytes, offset)
    if (length < 2 || offset + length > bytes.length) {
      throw new StudioImageError('JPEG bölümü eksik veya bozuk.')
    }
    if ([0xc0, 0xc1, 0xc2].includes(marker)) {
      if (length < 7) throw new StudioImageError('JPEG boyut bilgisi geçersiz.')
      return {
        mimeType: 'image/jpeg',
        width: uint16be(bytes, offset + 5),
        height: uint16be(bytes, offset + 3),
      }
    }
    if (marker === 0xda) break
    offset += length
  }
  throw new StudioImageError('JPEG boyut bilgisi bulunamadı.')
}

function webpDimensions(bytes) {
  if (ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WEBP') return null
  if (bytes.length < 30 || uint32le(bytes, 4) + 8 !== bytes.length) {
    throw new StudioImageError('WebP başlığı geçersiz.')
  }
  const chunk = ascii(bytes, 12, 4)
  const chunkSize = uint32le(bytes, 16)
  if (20 + chunkSize > bytes.length) throw new StudioImageError('WebP görüntü verisi eksik.')

  if (chunk === 'VP8X') {
    if (chunkSize < 10) throw new StudioImageError('WebP boyut bilgisi geçersiz.')
    if ((bytes[20] & 0x02) !== 0) throw new StudioImageError('Hareketli WebP desteklenmiyor.')
    return {
      mimeType: 'image/webp',
      width: uint24le(bytes, 24) + 1,
      height: uint24le(bytes, 27) + 1,
    }
  }
  if (chunk === 'VP8 ') {
    if (chunkSize < 10 || ascii(bytes, 23, 3) !== '\x9d\x01\x2a') {
      throw new StudioImageError('WebP boyut bilgisi geçersiz.')
    }
    return {
      mimeType: 'image/webp',
      width: uint16le(bytes, 26) & 0x3fff,
      height: uint16le(bytes, 28) & 0x3fff,
    }
  }
  if (chunk === 'VP8L') {
    if (chunkSize < 5 || bytes[20] !== 0x2f) {
      throw new StudioImageError('WebP boyut bilgisi geçersiz.')
    }
    return {
      mimeType: 'image/webp',
      width: 1 + (bytes[21] | ((bytes[22] & 0x3f) << 8)),
      height: 1 + ((bytes[22] >> 6) | (bytes[23] << 2) | ((bytes[24] & 0x0f) << 10)),
    }
  }
  throw new StudioImageError('Desteklenmeyen WebP türü.')
}

export function inspectStudioImage(bytes, options = {}) {
  if (!(bytes instanceof Uint8Array) || bytes.length === 0) {
    throw new StudioImageError('Görsel dosyası boş veya geçersiz.')
  }
  const maxBytes = options.maxBytes ?? STUDIO_RAW_MAX_BYTES
  const maxWidth = options.maxWidth ?? STUDIO_RAW_MAX_WIDTH
  const maxHeight = options.maxHeight ?? STUDIO_RAW_MAX_HEIGHT
  const maxPixels = options.maxPixels ?? STUDIO_RAW_MAX_PIXELS
  if (bytes.length > maxBytes) throw new StudioImageError('Görsel boyut sınırını aşıyor.', 413)

  const image = pngDimensions(bytes) ?? jpegDimensions(bytes) ?? webpDimensions(bytes)
  if (!image) throw new StudioImageError('Yalnız PNG, JPEG ve WebP görselleri kabul edilir.')
  if (!Number.isInteger(image.width) || !Number.isInteger(image.height)
    || image.width < 1 || image.height < 1
    || image.width > maxWidth || image.height > maxHeight
    || image.width * image.height > maxPixels) {
    throw new StudioImageError('Görsel piksel boyutu izin verilen sınırı aşıyor.', 413)
  }
  return image
}
