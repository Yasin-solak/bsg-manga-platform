import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { resolveImportSource } from '../../functions/api/ceviri/import.js'

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')
const sql = read('supabase/migrations/20260929180000_translation_studio_v3_my_series.sql')
const fn = (name) => {
  const start = sql.indexOf(`function ${name}(`)
  assert.ok(start >= 0, `${name} tanimli`)
  return sql.slice(start, sql.indexOf('$function$;', start))
}

// --- Serilerimiz: okuma ceviri.gor, klasik akis serileri dahil -------------------------------
const series = fn('public.tl_fansub_series')
assert.match(series, /if p_fansub_id is null or not app_private\.tl_can_fansub\(p_fansub_id\) then/, 'read permission gate')
assert.match(series, /select m\.id from public\.mangas m where m\.fansub_id = p_fansub_id/, 'series uploaded without the studio are listed too')
assert.match(series, /select p\.manga_id from public\.translation_projects p where p\.fansub_id = p_fansub_id/, 'series with a studio project')
assert.match(series, /r\.status = 'pending'/, 'pending revision badge')
assert.match(series, /'is_mature', r\.is_mature/, '+18 badge')
assert.doesNotMatch(sql, /pg_catalog\.(greatest|extract)\b/, 'pg_catalog.greatest/extract yazilmaz')
assert.match(fn('public.tl_fansub_series_chapters'), /app_private\.tl_can_fansub\(p_fansub_id\)/)
// Live has no snapshot functions/triggers of 037; the migration does not rely on them.
assert.doesNotMatch(sql, /public\.(manga|chapter)_revision_snapshot\(/, '037 snapshot fonksiyonlarina dayanilmaz')
assert.doesNotMatch(sql, /update public\.(chapters|mangas)\s/, 'canli satira yazilmaz (onayli satir korumalari)')
const snapshotBodies = readdirSync(new URL('../../supabase/migrations/', import.meta.url)).sort()
  .map((file) => read(`supabase/migrations/${file}`))
  .flatMap((source) => [...source.matchAll(/create or replace function app_private\.content_revision_snapshot\([\s\S]*?\$function\$;/g)].map((match) => match[0]))
assert.ok(snapshotBodies.length >= 1)
assert.equal(new Set(snapshotBodies).size, 1, 'content_revision_snapshot is identical in each migration (independent of apply order)')

// --- Revision project: a copy without touching the live project and chapter ---------------------------------
assert.match(sql, /add column if not exists revision_of uuid references public\.chapters\(id\)/)
assert.match(sql, /where manga_id is not null and revision_of is null and stage <> 'archived';/, 'live project uniqueness excludes revision/archive')
assert.match(sql, /translation_projects_revision_open_unique[\s\S]{0,120}\(revision_of\) where revision_of is not null/, 'one open revision per chapter')
assert.match(fn('app_private.tl_project_revision_guard'), /revizyon projesi yalniz sunucu tarafindan acilir/, 'the client cannot write revision_of')
const open = fn('public.tl_open_chapter_revision')
assert.match(open, /app_private\.tl_perm\(v_chapter\.fansub_id, 'ceviri\.proje'\)/, 'project management permission')
assert.match(open, /if not coalesce\(v_chapter\.is_approved, false\) then/, 'only a published chapter opens for revision')
assert.match(open, /where chapter_id = p_chapter_id and stage in \('published', 'scheduled'\)/, 'the live project of the studio chapter is the source')
for (const table of ['translation_pages', 'translation_page_cleanup', 'translation_items', 'translation_item_texts']) {
  // The copy comes from the same table's own row; a single FROM with the source table (cross join lateral).
  assert.match(open, new RegExp(`insert into public\\.${table}\\s+select (?:\\* from|copied\\.\\* from public\\.${table} \\w+\\s+cross join lateral) jsonb_populate_record\\(null::public\\.${table}`), `${table} kopyalanir`)
}
// A second FROM after jsonb_populate_record(...) is a syntax error (caught live).
assert.doesNotMatch(open, /jsonb_populate_record\([^;]*\)\)\s+from public\./, 'no two FROMs in the copy query')
assert.match(open, /perform set_config\('request\.jwt\.claim\.role', coalesce\(v_prev_role, ''\), true\);\s+return v_project;/, 'servis rolu islem sonunda geri alinir')
assert.doesNotMatch(open, /update public\.(chapters|translation_projects)/, 'the live chapter and project do not change')
assert.match(fn('public.tl_revision_import_ref'), /join public\.chapters c on c\.id = project\.revision_of[\s\S]*page\.raw_status = 'empty'/, 'source reference from the DB, only an empty page')

// --- Republishing = revision; the live record does not change --------------------------------------------
const submit = fn('public.tl_submit_chapter_revision')
assert.match(submit, /app_private\.tl_perm\(v_project\.fansub_id, 'ceviri\.yayinla'\)/, 'yayin izni')
assert.match(submit, /insert into public\.pending_content_revisions[\s\S]*'chapter', v_chapter\.id[\s\S]*'edit'[\s\S]*'pending'/, 'mevcut revizyon tablosuna edit kaydi')
assert.match(submit, /jsonb_build_object\('source', 'studio', 'project_id', v_project\.id\)/)
assert.doesNotMatch(submit, /update public\.chapters/, 'the old version stays published until approval')
const manga = fn('public.tl_submit_manga_revision')
assert.match(manga, /p_changes - 'title' - 'description' - 'genres' - 'cover_image_url' - 'is_mature' <> '\{\}'::jsonb/, 'only allowed fields')
assert.match(manga, /app_private\.tl_perm\(p_fansub_id, 'ceviri\.proje'\) or app_private\.fansub_staff_bolumler\(p_fansub_id\)/, 'series edit permission')
assert.doesNotMatch(manga, /update public\.mangas/, 'series info does not change until approval')

// --- Decision -> project: the old project is not deleted, it is archived ------------------------------------------
const sync = fn('app_private.tl_revision_project_sync')
assert.match(sync, /set chapter_id = null, stage = 'archived'/, 'the old project is archived')
assert.match(sync, /set revision_of = null, chapter_id = new\.target_id, stage = 'published'/, 'revizyon projesi canliya gecer')
assert.match(sync, /jsonb_build_object\('previous_project_id', v_live\)/, 'the previous project is saved for rollback')
assert.doesNotMatch(sync, /delete from/i)
assert.match(sql, /before insert or update of status on public\.pending_content_revisions/)

// --- Import: the source is only the chapter store -----------------------------------------------
const env = { VITE_SUPABASE_URL: 'https://db.supabase.co', VITE_CHAPTER_PAGE_PUBLIC_BASE_URL: 'https://cdn.example.com/' }
assert.deepEqual(resolveImportSource('chapter-pages://manga-1/ch-2/page-001/a.webp', env), { kind: 'bucket', path: 'manga-1/ch-2/page-001/a.webp' })
assert.deepEqual(resolveImportSource('https://cdn.example.com/manga-1/p.webp?x=1', env), { kind: 'bucket', path: 'manga-1/p.webp' })
assert.deepEqual(resolveImportSource('https://db.supabase.co/storage/v1/object/public/chapter-pages/a/b.png', env), { kind: 'fetch', url: 'https://db.supabase.co/storage/v1/object/public/chapter-pages/a/b.png' })
assert.equal(resolveImportSource('https://evil.example.com/a.png', env), null, 'bilinmeyen host okunmaz')
assert.equal(resolveImportSource('chapter-pages://../secret', env), null)
const importer = read('functions/api/ceviri/import.js')
assert.match(importer, /requireStudioPermission\(db, project\.fansub_id, 'ceviri\.proje'\)/)
assert.match(importer, /db\.rpc\('tl_revision_import_ref', \{ p_page_id: pageId \}\)/, 'the client cannot give a URL')
assert.match(read('functions/api/ceviri/raw.js'), /export async function storeRawPage/, 'upload and import use the same write path')

// --- Istemci ----------------------------------------------------------------------------------
const service = read('src/services/translationSeriesService.ts')
assert.match(service, /supabase\.rpc\('tl_fansub_series', \{ p_fansub_id: fansubId \}\)/)
assert.match(service, /supabase\.rpc\('tl_open_chapter_revision', \{ p_chapter_id: chapterId \}\)/)
assert.match(service, /supabase\.rpc\('tl_submit_chapter_revision'/)
assert.match(service, /supabase\.rpc\('tl_submit_manga_revision'/)
const publish = read('src/pages/translationStudio/editor/StepPublish.tsx')
assert.match(publish, /if \(isRevision\) \{[\s\S]*submitChapterRevision\([\s\S]*return\s+\}\s+const chapter = await createChapter\(/, 'a revision does not open a new chapter')
assert.match(publish, /data-testid='tl-publish-revision-note'/)
const page = read('src/pages/translationStudio/TranslationStudioPage.tsx')
assert.match(page, /parts\[0\] === 'seri' && parts\[1\] && UUID\.test\(parts\[1\]\)/, 'series detail route')
assert.match(page, /<RevisionImport /)
assert.match(read('src/pages/translationStudio/StudioMySeries.tsx'), /data-testid='tl-my-series'/)
const detail = read('src/pages/translationStudio/SeriesDetailScreen.tsx')
for (const testId of ['tl-series-detail', 'tl-series-new-chapter', 'tl-series-edit-open', 'tl-series-open-revision']) {
  assert.ok(detail.includes(`data-testid='${testId}'`), `${testId} exists`)
}
assert.match(read('src/services/translationStudioService.ts'), /\.is\('revision_of', null\)\.neq\('stage', 'archived'\)/, 'the existing work search does not mix in revisions')

console.log('PASS translation studio my series (series list, revision project, send to approval)')
