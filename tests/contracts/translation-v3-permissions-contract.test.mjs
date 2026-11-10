import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

function load(path, mocks = {}) {
  const exports = {}
  const code = ts.transpileModule(read(path), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  new Function('require', 'exports', code)((name) => {
    if (name in mocks) return mocks[name]
    throw new Error(`beklenmeyen import: ${name}`)
  }, exports)
  return exports
}

const migration = read('supabase/migrations/20260927201811_translation_studio_v3_permissions.sql')

// --- DB: okuma "gor", yazma ilgili izin ---------------------------------------------------
assert.match(migration, /create or replace function app_private\.tl_can_fansub\(p_fansub_id uuid\)[\s\S]{0,200}app_private\.tl_perm\(p_fansub_id, 'ceviri\.gor'\)/, 'read gate is view permission')
assert.match(migration, /app_private\.is_admin\(\)\s+or \(app_private\.is_feature_enabled\('translation\.studio_v3', false\)\s+and app_private\.fansub_can\(p_fansub_id, p_permission\)\)/, 'site admin always; for a team flag + permission')
for (const table of ['translation_projects', 'translation_pages', 'translation_items', 'translation_item_texts', 'translation_page_cleanup', 'translation_glossary', 'translation_series_drafts']) {
  assert.match(migration, new RegExp(`drop policy if exists ${table}_staff on public\\.${table};`), `${table}: the old "for all" policy is gone`)
  assert.match(migration, new RegExp(`create policy ${table}_read on public\\.${table} for select`), `${table}: ayri okuma politikasi`)
}
const writePolicy = (name, permission) => assert.match(migration, new RegExp(`create policy ${name}[^;]*'${permission.replace('.', '\\.')}'`), `${name} -> ${permission}`)
writePolicy('translation_item_texts_write', 'ceviri.metin')
writePolicy('translation_item_texts_update', 'ceviri.metin')
writePolicy('translation_page_cleanup_insert', 'ceviri.temizlik')
writePolicy('translation_page_cleanup_update', 'ceviri.temizlik')
writePolicy('translation_items_insert', 'ceviri.dizgi')
writePolicy('translation_items_delete', 'ceviri.dizgi')
writePolicy('translation_pages_insert', 'ceviri.proje')
writePolicy('translation_projects_insert', 'ceviri.proje')
writePolicy('translation_glossary_insert', 'ceviri.kaynak')
writePolicy('translation_style_presets_staff_insert', 'ceviri.kaynak')
writePolicy('translation_fonts_staff_delete', 'ceviri.kaynak')

// Item update is per column: a cleaner cannot move the area, a translator cannot change style.
assert.match(migration, /create trigger translation_items_permission_guard before update on public\.translation_items/)
assert.match(migration, /if app_private\.tl_is_service\(\) then return new; end if;/, 'worker (servis rolu) muaf')
assert.match(migration, /or new\.style is distinct from old\.style[\s\S]{0,200}'ceviri\.dizgi'/, 'konum/stil -> dizgi')
assert.match(migration, /new\.source_text is distinct from old\.source_text\s+and not \(app_private\.tl_perm\(v_fansub, 'ceviri\.metin'\) or app_private\.tl_perm\(v_fansub, 'ceviri\.dizgi'\)\)/, 'kaynak metin -> metin ya da dizgi')
assert.match(migration, /new\.cleanup is distinct from old\.cleanup\s+and not \(app_private\.tl_perm\(v_fansub, 'ceviri\.temizlik'\) or app_private\.tl_perm\(v_fansub, 'ceviri\.dizgi'\)\)/, 'temizleme turu -> temizlik ya da dizgi')

// Publish: a permitted member can open an unapproved chapter; moderation cannot be skipped.
assert.match(migration, /\(app_private\.is_fansub_admin\(fansub_id\) or app_private\.fansub_can\(fansub_id, 'ceviri\.yayinla'\)\)\s+and \(coalesce\(is_approved, false\) = false\)/, 'publish permission opens an unapproved chapter')
assert.match(migration, /chapters for insert to authenticated/)

// --- Worker'lar ----------------------------------------------------------------------------
const http = read('functions/_shared/translation-http.js')
assert.match(http, /export async function requireStudioPermission\(db, fansubId, permissions\)/)
assert.match(http, /db\.rpc\('tl_has_permission', \{ p_fansub_id: fansubId, p_permission: permission \}\)/, 'permission is asked with the user JWT client')
const workerPermission = (file, expected) => assert.match(read(`functions/api/ceviri/${file}`), new RegExp(`await requireStudioPermission\\(db, project\\.fansub_id, ${expected}\\)`), `${file} -> ${expected}`)
workerPermission('scan.js', "'ceviri\\.proje'")
workerPermission('translate.js', "'ceviri\\.proje'")
workerPermission('raw.js', "'ceviri\\.proje'")
workerPermission('clean.js', "'ceviri\\.yayinla'")
workerPermission('reread.js', "\\['ceviri\\.metin', 'ceviri\\.dizgi'\\]")
assert.match(read('functions/_shared/storage-upload-chapter-page.js'), /rpc\('fansub_can', \{ p_fansub_id: fansubId, p_permission: 'ceviri\.yayinla' \}\)/, 'publish permission uploads the chapter page')

// --- Arayuz: erisim -------------------------------------------------------------------------
const model = { PAINT_TOOLS: ['onarim', 'firca', 'geri', 'silgi', 'damga'], SELECT_TOOLS: ['secKutu', 'secKement', 'degnek'] }
const access = load('src/pages/translationStudio/studioAccess.ts', { './editor/editorModel': model })
const cleaner = access.studioAccessFrom(new Set(['ceviri.gor', 'ceviri.temizlik']))
assert.deepEqual(cleaner, { view: true, project: false, text: false, layout: false, clean: true, resources: false, publish: false, ai: true })
assert.equal(access.toolAllowed('firca', cleaner), true, 'temizlikci firca kullanir')
assert.equal(access.toolAllowed('degnek', cleaner), true)
assert.equal(access.toolAllowed('ekle', cleaner), false, 'a cleaner cannot draw areas')
assert.equal(access.toolAllowed('sec', cleaner), true, 'secim/gezinme herkese')
const translator = access.studioAccessFrom(new Set(['ceviri.gor', 'ceviri.metin']))
assert.equal(access.toolAllowed('onarim', translator), false, 'cevirmen PS araclarini gormez')

const screen = read('src/pages/translationStudio/editor/EditorScreen.tsx')
assert.match(screen, /const tools = useMemo\(\(\) => TOOLS\.filter\(\(entry\) => entry === 'sep' \|\| toolAllowed\(entry\.id, access\)\), \[access\]\)/)
assert.match(screen, /if \(access\.layout && selectedItems\.length && \(key === 'delete'/, 'dizgi izni olmadan Delete oge silmez')
assert.match(screen, /canMove=\{access\.layout\}/)
assert.match(read('src/pages/translationStudio/editor/EditorCanvas.tsx'), /if \(!canMove\) \{ onSelect\(item\.id\); return \}/, 'a user without typesetting selects an item but cannot move it')
const panels = read('src/pages/translationStudio/editor/EditorPanels.tsx')
assert.match(panels, /<fieldset disabled=\{!access\.text\} className='flex flex-col gap-2 disabled:opacity-60'>/, 'translation text is tied to the text permission')
assert.match(panels, /<fieldset disabled=\{!access\.layout\} className='flex flex-col gap-2\.5 border-t/, 'yazi stili dizgi iznine bagli')
assert.match(panels, /<fieldset disabled=\{!\(access\.clean \|\| access\.layout\)\}/, 'temizleme turu temizlik ya da dizgi')
const page = read('src/pages/translationStudio/TranslationStudioPage.tsx')
assert.match(page, /const baseAccess = isSiteAdmin \|\| isMockFansub \? FULL_STUDIO_ACCESS : studioAccessFrom\(permissions\)/)
assert.match(page, /canPublish=\{access\.publish\}/)
assert.match(page, /canEdit=\{access\.text\}/)
assert.match(read('src/App.tsx'), /path='fansub\/:id\/studyo\/\*'[\s\S]{0,120}requiredPermission='ceviri\.gor'/, 'the studio route with view permission')

console.log('PASS translation studio permissions (DB policies, column protection, worker checks, UI access)')
