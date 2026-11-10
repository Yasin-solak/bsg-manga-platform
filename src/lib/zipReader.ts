import { txa } from '@/i18n/activeLocale'
/**
 * Kucuk ZIP okuyucu: yalniz "store" (0) ve "deflate" (8) girdilerini acar.
 * Deflate icin tarayicinin yerlesik DecompressionStream('deflate-raw') API'si
 * kullanilir; ek bagimlilik gerekmez. Sifreli ve ZIP64 arsivler desteklenmez.
 */

export interface ZipEntry {
  name: string
  data: Uint8Array
}

const EOCD_SIGNATURE = 0x06054b50
const CENTRAL_SIGNATURE = 0x02014b50
const LOCAL_SIGNATURE = 0x04034b50

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

export async function readZip(
  buffer: ArrayBuffer,
  { maxEntries = 1000, maxEntryBytes = 25 * 1024 * 1024, filter }: {
    maxEntries?: number
    maxEntryBytes?: number
    filter?: (name: string) => boolean
  } = {},
): Promise<ZipEntry[]> {
  const view = new DataView(buffer)
  const bytes = new Uint8Array(buffer)
  let eocd = -1
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65_557); offset -= 1) {
    if (view.getUint32(offset, true) === EOCD_SIGNATURE) {
      eocd = offset
      break
    }
  }
  if (eocd < 0) throw new Error(txa('ZIP dosyası okunamadı.'))
  const count = view.getUint16(eocd + 10, true)
  let cursor = view.getUint32(eocd + 16, true)
  if (count > maxEntries) throw new Error(txa('ZIP en fazla {v1} dosya içerebilir.', { v1: maxEntries }))

  const decoder = new TextDecoder()
  const entries: ZipEntry[] = []
  for (let index = 0; index < count; index += 1) {
    if (view.getUint32(cursor, true) !== CENTRAL_SIGNATURE) throw new Error(txa('ZIP dizini bozuk.'))
    const flags = view.getUint16(cursor + 8, true)
    const method = view.getUint16(cursor + 10, true)
    const compressedSize = view.getUint32(cursor + 20, true)
    const size = view.getUint32(cursor + 24, true)
    const nameLength = view.getUint16(cursor + 28, true)
    const extraLength = view.getUint16(cursor + 30, true)
    const commentLength = view.getUint16(cursor + 32, true)
    const localOffset = view.getUint32(cursor + 42, true)
    const name = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength))
    cursor += 46 + nameLength + extraLength + commentLength

    if (name.endsWith('/') || (filter && !filter(name))) continue
    if (flags & 0x1) throw new Error(txa('Şifreli ZIP desteklenmiyor.'))
    if (size > maxEntryBytes) throw new Error(txa('{v1} boyut sınırını aşıyor.', { v1: name }))
    if (view.getUint32(localOffset, true) !== LOCAL_SIGNATURE) throw new Error(txa('ZIP girdisi bozuk.'))
    const dataStart = localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true)
    const raw = bytes.subarray(dataStart, dataStart + compressedSize)
    let data: Uint8Array
    if (method === 0) data = raw.slice()
    else if (method === 8) data = await inflateRaw(raw)
    else throw new Error(txa('{v1}: desteklenmeyen sıkıştırma.', { v1: name }))
    if (data.length !== size) throw new Error(txa('{v1} açılamadı.', { v1: name }))
    entries.push({ name, data })
  }
  return entries
}
