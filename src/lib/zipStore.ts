/**
 * Sikistirmasiz (store) ZIP yazici.
 *
 * **Neden kutuphane yok.** Bir bolum 40 sayfa; tek tek indirmek 40 tarayici
 * penceresi demek. Tek dosya sart. Ama iceri PNG giriyor ve PNG zaten
 * sikistirilmis — ustune deflate uygulamak isi yavaslatir, boyutu neredeyse
 * hic dusurmez. Sikistirmasiz ZIP'in tamami ~70 satir; bunun icin bagimlilik
 * eklemek gereksiz.
 *
 * **UTF-8 bayragi.** Sayfa adlarinda Turkce harf olabilir; genel amac bayraginin
 * 11. biti kurulmazsa eski araclar adlari bozuk gosterir.
 *
 * Modul tarayici bilmez: girdi de cikti da bayt dizisi.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let index = 0; index < 256; index += 1) {
    let value = index
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    }
    table[index] = value >>> 0
  }
  return table
})()

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (let index = 0; index < bytes.length; index += 1) {
    crc = CRC_TABLE[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

export interface ZipEntry {
  name: string
  data: Uint8Array
}

/** MS-DOS zaman damgasi: 2 saniyelik cozunurluk, 1980 baslangicli. */
function dosDateTime(date: Date): { time: number; date: number } {
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
    date: ((Math.max(1980, date.getFullYear()) - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  }
}

const LOCAL_SIGNATURE = 0x04034b50
const CENTRAL_SIGNATURE = 0x02014b50
const END_SIGNATURE = 0x06054b50
/** Genel amac bayragi: ad ve yorum UTF-8. */
const UTF8_FLAG = 0x0800
/** Sikistirma yontemi 0 = store. */
const METHOD_STORE = 0

export function createZip(entries: ZipEntry[], now: Date = new Date()): Uint8Array {
  const encoder = new TextEncoder()
  const named = entries.map((entry) => ({
    name: encoder.encode(entry.name),
    data: entry.data,
    crc: crc32(entry.data),
  }))

  const localSize = named.reduce((sum, entry) => sum + 30 + entry.name.length + entry.data.length, 0)
  const centralSize = named.reduce((sum, entry) => sum + 46 + entry.name.length, 0)
  const output = new Uint8Array(localSize + centralSize + 22)
  const view = new DataView(output.buffer)
  const { time, date } = dosDateTime(now)

  let offset = 0
  const offsets: number[] = []

  for (const entry of named) {
    offsets.push(offset)
    view.setUint32(offset, LOCAL_SIGNATURE, true)
    view.setUint16(offset + 4, 20, true)
    view.setUint16(offset + 6, UTF8_FLAG, true)
    view.setUint16(offset + 8, METHOD_STORE, true)
    view.setUint16(offset + 10, time, true)
    view.setUint16(offset + 12, date, true)
    view.setUint32(offset + 14, entry.crc, true)
    view.setUint32(offset + 18, entry.data.length, true)
    view.setUint32(offset + 22, entry.data.length, true)
    view.setUint16(offset + 26, entry.name.length, true)
    view.setUint16(offset + 28, 0, true)
    output.set(entry.name, offset + 30)
    output.set(entry.data, offset + 30 + entry.name.length)
    offset += 30 + entry.name.length + entry.data.length
  }

  const centralStart = offset
  named.forEach((entry, index) => {
    view.setUint32(offset, CENTRAL_SIGNATURE, true)
    view.setUint16(offset + 4, 20, true)
    view.setUint16(offset + 6, 20, true)
    view.setUint16(offset + 8, UTF8_FLAG, true)
    view.setUint16(offset + 10, METHOD_STORE, true)
    view.setUint16(offset + 12, time, true)
    view.setUint16(offset + 14, date, true)
    view.setUint32(offset + 16, entry.crc, true)
    view.setUint32(offset + 20, entry.data.length, true)
    view.setUint32(offset + 24, entry.data.length, true)
    view.setUint16(offset + 28, entry.name.length, true)
    view.setUint16(offset + 30, 0, true)
    view.setUint16(offset + 32, 0, true)
    view.setUint16(offset + 34, 0, true)
    view.setUint16(offset + 36, 0, true)
    view.setUint32(offset + 38, 0, true)
    view.setUint32(offset + 42, offsets[index], true)
    output.set(entry.name, offset + 46)
    offset += 46 + entry.name.length
  })

  view.setUint32(offset, END_SIGNATURE, true)
  view.setUint16(offset + 4, 0, true)
  view.setUint16(offset + 6, 0, true)
  view.setUint16(offset + 8, named.length, true)
  view.setUint16(offset + 10, named.length, true)
  view.setUint32(offset + 12, centralSize, true)
  view.setUint32(offset + 16, centralStart, true)
  view.setUint16(offset + 20, 0, true)

  return output
}
