import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import * as zod from 'zod'

/*
 * Fansub "Series" fix request: a published series does not change directly, the request
 * goes to pending_content_revisions (apply_content_revision applies on approval).
 */
const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')
const sql = read('supabase/migrations/20261031090000_fansub_manga_revision_request.sql').replace(/^\s*--.*$/gm, '')

assert.match(sql, /create or replace function public\.submit_fansub_manga_revision\(/)
assert.match(sql, /app_private\.fansub_staff_perm\(p_fansub_id, v_actor, 'panel\.mangalar'\)/, 'series permission')
assert.match(sql, /if not coalesce\(v_manga\.is_approved, false\) then/, 'published series only')
assert.doesNotMatch(sql, /update public\.mangas/, 'the live series does not change until approval')
assert.doesNotMatch(sql, /delete from/i, 'the old request is not deleted')
assert.match(sql, /- 'status' - 'author' - 'artist' <> '\{\}'::jsonb/, 'allowed field list')
assert.match(sql, /jsonb_build_object\('source', 'fansub_panel', 'note', v_note\)/, 'reason note meta.note')
assert.match(sql, /revoke all on function public\.submit_fansub_manga_revision\(uuid, uuid, jsonb, text\) from public, anon;/)

// Mapper: changed fields derive from the before/after difference, an empty note is null.
const source = read('src/services/fansubManageService/manga.ts')
const exports = {}
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
new Function('require', 'exports', code)((name) => ({
  zod,
  '../apiResilience': { withAbortSignal: () => {}, withServiceTimeout: () => {} },
  '../supabase': { supabase: {} },
  './shared': { mapMangaRow: () => ({}), normalizeLimit: (v) => v, normalizePage: (v) => v },
})[name] ?? (() => { throw new Error(`beklenmeyen import: ${name}`) })(), exports)

const row = exports.mapFansubMangaRevisionRow({
  id: 'r1',
  target_id: 'm1',
  status: 'garip',
  before_data: { title: 'A', status: 'ongoing', genres: ['Dram'] },
  after_data: { title: 'A', status: 'completed', genres: ['Dram', 'Gizem'] },
  meta: { note: '  ' },
  review_note: null,
  created_at: '2026-10-31T00:00:00Z',
  reviewed_at: null,
})
assert.deepEqual(row.changedFields, ['status', 'genres'])
assert.equal(row.status, 'pending', 'an unknown state counts as pending')
assert.equal(row.note, null)

const dialog = read('src/components/fansub/FansubMangaRevisionDialog.tsx')
assert.match(dialog, /submitFansubMangaRevision\(\{ fansubId, mangaId: manga\.id, changes: payload, note \}\)/)
const section = read('src/components/fansub/FansubManageMangaSection.tsx')
assert.match(section, /<FansubMangaRevisionDialog/, 'the series tab opens the correction window')

console.log('PASS fansub series correction request (live series unchanged, permission, note, matcher)')
