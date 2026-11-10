import assert from 'node:assert/strict'
import { File } from 'node:buffer'
import { normalizeUploadFile } from '../../functions/_shared/media-file-normalization.js'

async function run(name, fn) {
  try {
    await fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    console.error(error)
    process.exitCode = 1
  }
}

await run('worker upload normalizasyonu sahte image/png MIME degerine guvenmez', async () => {
  const spoofedFile = new File(['<script>alert(1)</script>'], 'avatar.png', {
    type: 'image/png',
  })

  const normalized = await normalizeUploadFile(spoofedFile)

  assert.equal(normalized.mimeType, 'application/octet-stream')
  assert.equal(normalized.extension, 'bin')
  assert.equal(normalized.mediaKind, 'unknown')
})

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode)
}
