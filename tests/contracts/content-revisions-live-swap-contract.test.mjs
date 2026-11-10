import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'

/*
 * On a pending revision the OLD version stays live: a change to a published series/chapter is not written
 * to the live row, it waits in pending_content_revisions. It applies on approval and the previous version
 * is archived in before_data (not deleted); rejection does not touch the live row; reverting from archive
 * is site admin only.
 */
const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')
const sql = read('supabase/migrations/20260929190000_content_revisions_live_swap.sql')
const fn = (name) => {
  const start = sql.indexOf(`function ${name}(`)
  assert.ok(start >= 0, `${name} tanimli`)
  return sql.slice(start, sql.indexOf('$function$;', start))
}

assert.doesNotMatch(sql, /create table/i, 'no parallel second version table; the existing revision table extends')
// Production lacks 037's functions/triggers: the migration must be self-sufficient.
assert.doesNotMatch(sql, /public\.(manga|chapter)_revision_snapshot\(/, '037 snapshot fonksiyonlarina dayanilmaz')
assert.doesNotMatch(sql, /set search_path = public\b/, 'new functions have an empty search_path')
const snapshotBodies = readdirSync(new URL('../../supabase/migrations/', import.meta.url)).sort()
  .map((file) => read(`supabase/migrations/${file}`))
  .flatMap((source) => [...source.matchAll(/create or replace function app_private\.content_revision_snapshot\([\s\S]*?\$function\$;/g)].map((match) => match[0]))
assert.ok(snapshotBodies.length >= 1)
assert.equal(new Set(snapshotBodies).size, 1, 'content_revision_snapshot is identical in each migration (independent of apply order)')
assert.match(fn('app_private.apply_content_revision'), /if not app_private\.can_manage_moderation_state\(\) then/, 'the live row only with admin permission (consistent with approval guards)')
assert.doesNotMatch(sql, /pg_catalog\.(greatest|extract)\b/)

// --- Gonderim: canli satir degismez ------------------------------------------------------
const submit = fn('public.submit_chapter_revision')
assert.match(submit, /if not coalesce\(v_chapter\.is_approved, false\) then/, 'only a published chapter goes to revision')
assert.match(submit, /app_private\.fansub_staff_bolumler\(v_chapter\.fansub_id\)/, 'panel chapters permission')
assert.match(submit, /insert into public\.pending_content_revisions[\s\S]*'edit', v_before, v_after, 'pending'/)
assert.doesNotMatch(submit, /update public\.chapters/, 'the old version stays published until approval')
assert.doesNotMatch(submit, /is_approved\s*=\s*false/, 'the chapter is not hidden from readers')

// --- Karar ----------------------------------------------------------------------------------
const approve = fn('public.approve_content_revision')
assert.match(approve, /if not app_private\.can_manage_moderation_state\(\) then/)
assert.match(approve, /perform app_private\.apply_content_revision\(v_revision\.target_type, v_revision\.target_id, v_revision\.before_data, v_revision\.after_data\)/)
assert.match(approve, /set status = 'approved'/)
const reject = fn('public.reject_content_revision')
assert.doesNotMatch(reject, /apply_content_revision|update public\.(chapters|mangas)|delete from/, 'red canli icerige dokunmaz, silmez')
const apply = fn('app_private.apply_content_revision')
assert.match(apply, /where \(p_after -> key\) is distinct from \(p_before -> key\)/, 'only changed fields are applied')
assert.doesNotMatch(apply, /delete from/i, 'onceki surum silinmez')
assert.match(apply, /page_dimensions = case when 'page_dimensions' = any\(v_changed\)/)

// --- Archive and revert -----------------------------------------------------------------------
const restore = fn('public.restore_content_revision')
assert.match(restore, /if not app_private\.is_admin\(\) then/, 'rollback is site admin only')
assert.match(restore, /v_source\.status <> 'approved' or v_source\.change_action <> 'edit'/, 'only an archived (approved) version')
assert.match(restore, /apply_content_revision\(v_source\.target_type, v_source\.target_id, v_current, v_source\.before_data\)/, 'the previous archived version returns to live')
assert.match(restore, /'restored_from', v_source\.id/, 'zincir korunur')
assert.match(restore, /'project_id', coalesce\(v_source\.meta->'previous_project_id', 'null'::jsonb\)/, 'the studio project is also relinked or archived')
const list = fn('public.admin_list_content_revisions')
assert.match(list, /p_scope = 'pending' and r\.status = 'pending'\s+and coalesce\(m\.is_approved, c\.is_approved, false\)/, 'pending: only revisions of published content')
assert.match(list, /p_scope = 'archive' and r\.status = 'approved'/)

// --- Klasik akis (fansub paneli) ----------------------------------------------------------------
const chapters = read('src/services/fansubManageService/chapters.ts')
assert.match(chapters, /if \(currentRow\?\.is_approved === true && currentRow\?\.is_active !== false\) \{\s+const revision = await submitLiveChapterRevision/, 'a page change on a published chapter becomes a revision')
assert.match(chapters, /if \(await isChapterLive\(fansubId, chapterId\)\) \{\s+return submitLiveChapterRevision/, 'title/publish time changes too')
assert.match(chapters, /supabase\.rpc\('submit_chapter_revision'/)
assert.match(read('src/pages/fansubYonet/FansubYonetChaptersTab.tsx'), /result\.status === 'pending_revision'/)

// --- Admin: Pending Approval and Manga Control ---------------------------------------------------
const handlers = read('src/pages/admin/useAdminPendingHandlers.ts')
assert.match(handlers, /if \(item\.revisionId\) await approveContentRevision\(item\.revisionId\)\s+else if \(item\.type === 'manga'\) await approveManga/)
assert.match(handlers, /if \(item\.revisionId\) await rejectContentRevision\(item\.revisionId, reason\)\s+else if \(item\.type === 'manga'\) await rejectManga/, 'rejecting a live series revision does not delete the series')
assert.match(read('src/services/mangaService/moderation.pending.ts'), /const live = await listLiveContentRevisions\(\)/)
assert.match(read('src/components/admin/pending/AdminPendingDetailContent.tsx'), /data-testid="admin-pending-live-revision"/)
const service = read('src/services/contentRevisionService.ts')
for (const rpc of ['admin_list_content_revisions', 'approve_content_revision', 'reject_content_revision', 'restore_content_revision']) {
  assert.ok(service.includes(`supabase.rpc('${rpc}'`), `${rpc} cagrilir`)
}
const section = read('src/components/admin/MangaManagementSection.tsx')
assert.match(section, /\{workspace === 'revisions' \? <div className="xl:min-h-0 xl:flex-1 xl:overflow-y-auto"><ContentRevisionsPanel \/><\/div> : null\}/, 'Mangas > Revisions and archive')
const panel = read('src/components/admin/mangaManagement/ContentRevisionsPanel.tsx')
assert.match(panel, /data-testid="admin-content-revisions"/)
assert.match(panel, /data-testid="admin-content-revision-restore"/)

console.log('PASS content revisions: old version published until approval, archived on approval, rollback')
