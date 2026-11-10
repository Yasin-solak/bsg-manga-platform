/**
 * Uncompressed ZIP writer contract.
 *
 * A chapter has 40 pages; downloading one by one means 40 browser windows. A broken archive
 * only shows when the user tries to open the file and the work done up to then
 * is wasted, so the produced archive is READ BACK here, not just
 * checked for structure.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')

const source = readFileSync(path.join(rootDir, 'src/lib/zipStore.ts'), 'utf8')
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
})
const shim = { exports: {} }
new Function('module', 'exports', 'require', outputText)(shim, shim.exports, () => ({}))
const zip = shim.exports

/** Reads the produced archive back like a ZIP reader. */
function readZip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const eocd = bytes.length - 22
  assert.equal(view.getUint32(eocd, true), 0x06054b50, 'arsiv sonu imzasi')
  const count = view.getUint16(eocd + 10, true)
  let offset = view.getUint32(eocd + 16, true)

  const entries = []
  for (let index = 0; index < count; index += 1) {
    assert.equal(view.getUint32(offset, true), 0x02014b50, 'merkezi dizin imzasi')
    const flags = view.getUint16(offset + 8, true)
    const method = view.getUint16(offset + 10, true)
    const crc = view.getUint32(offset + 16, true)
    const size = view.getUint32(offset + 24, true)
    const nameLength = view.getUint16(offset + 28, true)
    const extraLength = view.getUint16(offset + 30, true)
    const commentLength = view.getUint16(offset + 32, true)
    const local = view.getUint32(offset + 42, true)
    const name = new TextDecoder().decode(bytes.slice(offset + 46, offset + 46 + nameLength))

    assert.equal(view.getUint32(local, true), 0x04034b50, 'yerel baslik imzasi')
    const dataStart = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true)
    entries.push({ name, flags, method, crc, data: bytes.slice(dataStart, dataStart + size) })
    offset += 46 + nameLength + extraLength + commentLength
  }
  return entries
}

const files = [
  { name: 'sayfa-01-tr.png', data: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 255, 7]) },
  { name: 'ikinci sayfa-tr.png', data: new Uint8Array([1, 2, 3, 4, 5]) },
  { name: 'ucuncu-tr.png', data: new Uint8Array(0) },
]
const archive = zip.createZip(files, new Date(2026, 7, 4, 12, 30, 0))
const readBack = readZip(archive)

// 1) Round trip: names and BYTES must be kept exactly. An empty file is valid too.
assert.equal(readBack.length, files.length)
files.forEach((file, index) => {
  assert.equal(readBack[index].name, file.name, 'dosya adi korunmali')
  assert.deepEqual([...readBack[index].data], [...file.data], 'icerik birebir korunmali')
  assert.equal(readBack[index].crc, zip.crc32(file.data), 'CRC icerikle uyusmali')
})

// 2) The name must be written with the UTF-8 flag: Turkish names should not break in old tools.
assert.ok(readBack.every((entry) => (entry.flags & 0x0800) !== 0), 'UTF-8 bayragi kurulmali')

// 3) NO compression. PNG goes in; PNG is already compressed, deflate only
// grows the time and barely lowers the size.
assert.ok(readBack.every((entry) => entry.method === 0), 'store yontemi kullanilmali')

// 4) CRC must really derive from content. A fixed or broken table makes the archive look
// openable while broken files come out.
assert.equal(zip.crc32(new TextEncoder().encode('123456789')), 0xcbf43926, 'bilinen CRC32 vektoru')
assert.notEqual(zip.crc32(new Uint8Array([1, 2, 3])), zip.crc32(new Uint8Array([1, 2, 4])))

// 5) An empty archive must be valid too: a call with no pages must not crash.
const empty = readZip(zip.createZip([], new Date(2026, 7, 4)))
assert.equal(empty.length, 0)

console.log('PASS zip writer contract verified')
