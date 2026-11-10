export const MAX_FILE_BYTES = 10 * 1024 * 1024
export const FILE_TYPES = { 'image/jpeg': ['jpg', 'jpeg'], 'image/png': ['png'], 'image/webp': ['webp'], 'image/gif': ['gif'], 'application/pdf': ['pdf'], 'text/plain': ['txt'] }
export function safeFileName(name) {
  return Array.from(String(name).normalize('NFC'), char => {
    const code = char.codePointAt(0)
    return code < 32 || code === 127 || char === '/' || char === '\\' || (code >= 0x202a && code <= 0x202e) || (code >= 0x2066 && code <= 0x2069) ? '_' : char
  }).join('').trim().slice(0,120).replace(/[\ud800-\udbff]$/,'_') || 'dosya'
}
export function assertFileMeta(file) {
  if (!file || !Number.isInteger(file.size) || file.size < 1 || file.size > MAX_FILE_BYTES) throw new Error('Dosya boş olamaz ve en fazla 10 MB olabilir.')
  const ext = String(file.name).split('.').pop().toLowerCase()
  if (!FILE_TYPES[file.type]?.includes(ext)) throw new Error('JPG, PNG, WebP, GIF, PDF veya TXT dosyası seç.')
}
export function validateFileBytes(bytes, mime) {
  const ascii = (start, end) => String.fromCharCode(...bytes.slice(start,end))
  let valid = false
  if (mime === 'image/png') valid = bytes.length > 24 && bytes.slice(0,8).every((v,i) => v === [137,80,78,71,13,10,26,10][i]) && ascii(12,16)==='IHDR'
  if (mime === 'image/jpeg') valid = bytes.length > 4 && bytes[0]===255 && bytes[1]===216 && bytes[2]===255
  if (mime === 'image/webp') valid = bytes.length > 16 && ascii(0,4)==='RIFF' && ascii(8,12)==='WEBP' && ['VP8 ','VP8L','VP8X'].includes(ascii(12,16))
  if (mime === 'image/gif') valid = bytes.length > 13 && ['GIF87a','GIF89a'].includes(ascii(0,6))
  if (mime === 'application/pdf') valid = ascii(0,5)==='%PDF-' && ascii(Math.max(0,bytes.length-1024),bytes.length).includes('%%EOF')
  if (mime === 'text/plain') {
    try {
      new TextDecoder('utf-8',{fatal:true}).decode(bytes)
      valid = !bytes.some(code => code < 32 && code !== 9 && code !== 10 && code !== 13)
    } catch { valid = false }
  }
  if (!valid) throw new Error('Dosyanın içeriği seçilen türle uyuşmuyor veya dosya bozuk.')
}
