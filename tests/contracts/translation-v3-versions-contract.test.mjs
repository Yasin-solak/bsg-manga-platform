import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

// Page version history: built from DB state on the server, a reversible restore on the client.
const migration = read('supabase/migrations/20260928140442_translation_studio_v3_page_versions.sql')
assert.match(migration, /revoke all on public\.translation_page_versions from anon, authenticated;/, 'via RPC only')
assert.match(migration, /'translation_item_texts', coalesce\(/, 'a version also contains translation texts')
assert.match(migration, /select coalesce\(c\.strokes, '\[\]'::jsonb\) into v_strokes from public\.translation_page_cleanup c/, 'temizlik izleri de surumde')
assert.match(migration, /order by created_at desc offset 30/, 'last 30 versions per page')
assert.match(migration, /pg_column_size\(items\) \+ pg_catalog\.pg_column_size\(strokes\) < 4000000/, 'surum boyutu sinirli')
assert.match(migration, /tl_perm\(v_fansub, 'ceviri\.metin'\) or app_private\.tl_perm\(v_fansub, 'ceviri\.dizgi'\)\s+or app_private\.tl_perm\(v_fansub, 'ceviri\.temizlik'\)/, 'saving needs an edit permission')
assert.match(migration, /if v_row\.id is null or not app_private\.tl_can_page\(v_row\.page_id\) then/, 'read with view permission')
assert.match(migration, /'Sürüm silmek için proje yönetimi izni gerekir\.'/)
assert.match(migration, /create trigger translation_page_tasks_done_version after update of status on public\.translation_page_tasks/, 'automatic version when a task finishes')
assert.doesNotMatch(migration, /pg_catalog\.(extract|greatest|least)\(/, 'SQL constructs are not written with pg_catalog')

const service = read('src/services/translationEditorService.ts')
assert.match(service, /z\.object\(\{ items: z\.array\(itemRowSchema\), strokes: z\.array\(z\.unknown\(\)\) \}\)\.parse\(data\)/, 'surum ogeleri editor semasindan gecer')
const hook = read('src/pages/translationStudio/editor/useEditorPage.ts')
assert.match(hook, /const restore = useCallback\(async \(target: Snapshot\) => \{\s+snapshot\(\)\s+await applySnapshot\(target\)/, 'restore is pushed to history (Ctrl+Z)')
const menu = read('src/pages/translationStudio/editor/VersionsMenu.tsx')
assert.match(menu, /await onFlush\(\)\s+await savePageVersion/, 'kaydetmeden once bekleyen yazimlar bosaltilir')
assert.match(menu, /await onFlush\(\)\s+const snapshot = await getPageVersion/, 'before restoring too')
assert.match(read('src/pages/translationStudio/editor/EditorScreen.tsx'), /<VersionsMenu pageId=\{page\.id\}[^>]*canDelete=\{access\.project\}/)

console.log('PASS translation studio page versions (server snapshot, permissions, reversible restore)')
