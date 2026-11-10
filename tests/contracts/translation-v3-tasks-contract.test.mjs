import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import ts from 'typescript'
import { activeLocaleShim } from './i18n-source.mjs'

const require = createRequire(import.meta.url)
const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

// --- DB: page tasks ------------------------------------------------------------------
const migration = read('supabase/migrations/20260928113822_translation_studio_v3_page_tasks.sql')
assert.match(migration, /constraint translation_page_tasks_unique unique \(page_id, stage\)/, 'stage is unique per page')
assert.match(migration, /revoke all on public\.translation_page_tasks from anon, authenticated;\s+grant select on public\.translation_page_tasks to authenticated;/, 'writes via RPC only')
assert.match(migration, /using \(\(select app_private\.tl_can_project\(project_id\)\)\)/, 'reads with studio view permission')
assert.match(migration, /when 'temizlik' then array\['ceviri\.temizlik'\]/, 'temizlik -> temizlik izni')
assert.match(migration, /when 'kontrol' then array\['ceviri\.metin', 'ceviri\.dizgi'\]/)
assert.match(migration, /if not app_private\.tl_perm\(v_project\.fansub_id, 'ceviri\.proje'\) then\s+raise exception 'Görev atamak için proje yönetimi izni gerekir\.'/, 'assigning requires project management')
assert.match(migration, /not app_private\.tl_user_can_stage\(v_project\.fansub_id, v_assignee, v_stage\)/, 'izni olmayan uyeye atanmaz')
assert.match(migration, /if not \(v_task\.assignee_id = v_actor or app_private\.tl_perm\(v_project\.fansub_id, 'ceviri\.proje'\)\)/, 'the owner or a manager changes the state')
assert.match(migration, /v_task\.stage in \('temizlik', 'ceviri'\) and t\.stage = 'dizgi'[\s\S]{0,260}o\.stage in \('temizlik', 'ceviri'\) and o\.status <> 'tamam'/, 'typesetting is told when cleanup and translation finish')
assert.match(migration, /v_task\.stage = 'dizgi' and t\.stage = 'kontrol'/)
assert.match(migration, /'route_hint', p_route/, 'the notification leads straight to the page')
assert.match(migration, /extract\(epoch from now\(\)\)::bigint/, 'EXTRACT sema onekisiz (SQL yapisi)')
assert.doesNotMatch(migration, /pg_catalog\.(extract|greatest|least)\(/, 'SQL constructs are not written with pg_catalog')

// With the flag off the site admin must be able to assign tasks to themselves too (caught in a live test).
assert.match(read('supabase/migrations/20260928134857_translation_studio_v3_tasks_admin_assignee.sql'), /or exists \(select 1 from public\.users u where u\.id = p_user_id and u\.role = 'admin'\)/)

// --- Servis -------------------------------------------------------------------------------
const exports = {}
const code = ts.transpileModule(read('src/services/translationTaskService.ts'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
new Function('require', 'exports', code)((name) => { if (name === '@/i18n/activeLocale') return activeLocaleShim;
  if (name === 'zod') return require('zod')
  if (name === '@/services/supabase') return { supabase: {} }
  if (name === '@/services/apiResilience') return {}
  throw new Error(`beklenmeyen import: ${name}`)
}, exports)
assert.equal(exports.nextTaskStatus('bekliyor'), 'devam')
assert.equal(exports.nextTaskStatus('devam'), 'tamam')
assert.equal(exports.nextTaskStatus('tamam'), 'bekliyor')
assert.deepEqual(exports.TL_TASK_STAGES.map((stage) => stage.key), ['temizlik', 'ceviri', 'dizgi', 'kontrol'])

// --- Arayuz -------------------------------------------------------------------------------
const tasks = read('src/pages/translationStudio/editor/TasksScreen.tsx')
assert.match(tasks, /\{access\.project && \(\s+<div className='flex flex-none flex-wrap items-center gap-2 border-b[^']*' data-testid='tl-task-assign-bar'>/, 'the assign bar only for project managers')
assert.match(tasks, /const canChange = mine \|\| access\.project/, 'the state button only for the owner or a manager')
assert.match(tasks, /const stageMembers = members\.filter\(\(member\) => member\.stages\.includes\(stage\)\)/, 'the member list follows stage permission')
const bar = read('src/pages/translationStudio/editor/PageTaskBar.tsx')
assert.match(bar, /\{mine && \(/, 'on the editor bar actions only for your own task')
const page = read('src/pages/translationStudio/TranslationStudioPage.tsx')
assert.match(page, /gorevler: 'gorevler'/)
assert.match(page, /screen === 'incele' \|\| screen === 'gorevler' \? 'duzenle' : screen/)
assert.match(page, /myTasks=\{myTasks\.filter\(\(task\) => task\.fansubId === fansub\.id\)\}/, 'at start only this fansub tasks')
assert.match(read('src/pages/translationStudio/StepStart.tsx'), /data-testid='tl-my-tasks'/)

console.log('PASS translation studio tasks (assign permission, stage permission, order notice, UI)')
