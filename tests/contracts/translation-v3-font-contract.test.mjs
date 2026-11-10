import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { detectFont, fontName, handleTranslationFontGet, handleTranslationFontPost } from '../../functions/api/ceviri/font.js'

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')
const FANSUB = '21910000-0000-4000-8000-000000000001'
const FONT = '99999999-9999-4999-8999-999999999999'
const env = { VITE_SUPABASE_URL: 'https://db', VITE_SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service' }

// File signature: the first bytes, not the extension or client MIME.
const pad = (head) => new Uint8Array([...head, ...new Array(12).fill(0)])
assert.equal(detectFont(pad([0x77, 0x4f, 0x46, 0x32])).mimeType, 'font/woff2')
assert.equal(detectFont(pad([0x4f, 0x54, 0x54, 0x4f])).mimeType, 'font/otf')
assert.equal(detectFont(pad([0x00, 0x01, 0x00, 0x00])).mimeType, 'font/ttf')
assert.equal(detectFont(pad([0x89, 0x50, 0x4e, 0x47])), null, 'PNG font diye kabul edilmez')
assert.equal(fontName('Balon Yazısı-Bold.woff2', 'x'), 'Balon Yazısı-Bold')
assert.equal(fontName('<script>.ttf', 'Özel font'), 'script')

function fakeClient(role, state) {
  const from = (table) => {
    const q = { table, op: 'select', payload: null, filters: {} }
    const api = {
      select() { return api }, eq(c, v) { q.filters[c] = v; return api }, abortSignal() { return api },
      upsert(p) { q.op = 'upsert'; q.payload = p; return api },
      single() { state.writes.push({ role, ...q }); return Promise.resolve({ data: { id: FONT, name: q.payload?.name, mime_type: q.payload?.mime_type }, error: null }) },
      maybeSingle() { return Promise.resolve({ data: q.filters.id === FONT ? { object_key: `fonts/${FANSUB}/${'c'.repeat(64)}.woff2`, mime_type: 'font/woff2' } : null, error: null }) },
    }
    return api
  }
  return {
    from,
    rpc: (name, args) => ({ abortSignal() { return this }, then(resolve) { resolve({ data: name === 'tl_can_manage_fansub' && args.p_fansub_id === FANSUB && state.allowed, error: null }) } }),
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) },
  }
}

const upload = async (allowed, bytes) => {
  const state = { writes: [], allowed, puts: [] }
  const form = new FormData()
  form.set('fansub_id', FANSUB)
  form.set('file', new File([bytes], 'Balon.woff2'))
  const response = await handleTranslationFontPost(new Request('https://x/api/ceviri/font', {
    method: 'POST', headers: { authorization: 'Bearer t' }, body: form,
  }), { ...env, TYPESET_RAW_BUCKET: { put: async (key) => { state.puts.push(key) } } }, {
    createClient: (_url, key) => fakeClient(key === 'service' ? 'service' : 'user', state),
    assertUploadRateLimit: async () => {},
  })
  return { response, state }
}

const denied = await upload(false, pad([0x77, 0x4f, 0x46, 0x32]))
assert.equal(denied.response.status, 403)
assert.equal(denied.state.puts.length, 0, 'an unauthorized upload does not write to storage')

const wrongType = await upload(true, pad([0x89, 0x50, 0x4e, 0x47]))
assert.equal(wrongType.response.status, 415)

const ok = await upload(true, pad([0x77, 0x4f, 0x46, 0x32]))
assert.equal(ok.response.status, 201, await ok.response.clone().text())
assert.match(ok.state.puts[0], new RegExp(`^fonts/${FANSUB}/[0-9a-f]{64}\\.woff2$`))
assert.equal(ok.state.writes[0].role, 'service', 'only the service writes the font row')

const served = await handleTranslationFontGet(new Request(`https://x/api/ceviri/font?id=${FONT}`), {
  ...env, TYPESET_RAW_BUCKET: { get: async (key) => ({ body: key }) },
}, { createClient: () => fakeClient('service', { writes: [] }) })
assert.equal(served.status, 200)
assert.equal(served.headers.get('content-type'), 'font/woff2')
assert.match(served.headers.get('cache-control'), /immutable/)

// Style key custom:<id>; publish render and the reader load the font first.
assert.match(read('src/lib/translationLettering.ts'), /isCustomFontKey\(key\)\) return \{ name: customFontName\(key\)/)
assert.match(read('src/pages/translationStudio/editor/finalRender.ts'), /ensureCustomFont\(key\)/)
assert.match(read('src/components/translation/TranslatedTextBox.tsx'), /ensureCustomFont\(style\.font\)/)

console.log('PASS translation studio v3 team fonts (signature, permission, service write, read)')
