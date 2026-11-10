import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import ts from 'typescript'
import { activeLocaleShim } from './i18n-source.mjs'

const require = createRequire(import.meta.url)
const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

// Tasks phase 2: due date, overdue warning, contribution and credit suggestion.
const migration = read('supabase/migrations/20260928141105_translation_studio_v3_tasks_v2.sql')
assert.match(migration, /add column due_at timestamptz,\s+add column overdue_notified_at timestamptz;/)
assert.match(migration, /elsif p_action = 'update' then[\s\S]{0,400}'Görevi düzenlemek için proje yönetimi izni gerekir\.'/, 'bulk date/note for project managers')
assert.match(migration, /overdue_notified_at = case when p \? 'due_at' then null else t\.overdue_notified_at end/, 'on a date change the overdue warning resets')
assert.match(migration, /t\.due_at < now\(\)\s+and t\.overdue_notified_at is null and t\.assignee_id is not null/, 'only overdue, unfinished and unwarned tasks')
assert.match(migration, /update public\.translation_page_tasks set overdue_notified_at = now\(\) where id = v_task\.id;/, 'one warning per task')
assert.match(migration, /v_task\.assigned_by <> v_task\.assignee_id/, 'the assigner is told too (no repeat for self-assignment)')
assert.match(migration, /select cron\.schedule\('tl-task-overdue', '\*\/30 \* \* \* \*'/, 'scan every 30 minutes')
assert.match(migration, /if not app_private\.tl_can_project\(p_project_id\) then\s+raise exception 'Bu projeyi görme iznin yok\.'/, 'contributions with view permission')
assert.match(migration, /\(1, 'ceviri', 'Çeviri'\), \(2, 'temizlik', 'Temizlik'\), \(3, 'dizgi', 'Dizgi'\), \(4, 'kontrol', 'Kontrol'\)/, 'credit text in stage order')
assert.doesNotMatch(migration, /pg_catalog\.(extract|greatest|least)\(/)

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
const now = Date.parse('2026-09-28T12:00:00Z')
assert.equal(exports.isTaskOverdue({ dueAt: '2026-09-28T11:00:00Z', status: 'devam' }, now), true)
assert.equal(exports.isTaskOverdue({ dueAt: '2026-09-28T11:00:00Z', status: 'tamam' }, now), false, 'a finished task does not count as overdue')
assert.equal(exports.isTaskOverdue({ dueAt: '2026-09-28T13:00:00Z', status: 'bekliyor' }, now), false)
assert.equal(exports.isTaskOverdue({ dueAt: null, status: 'bekliyor' }, now), false)

const screen = read('src/pages/translationStudio/editor/TasksScreen.tsx')
assert.match(screen, /data-testid='tl-task-due'/)
assert.match(screen, /data-testid=\{overdue \? 'tl-task-overdue' : undefined\}/, 'an overdue task is marked')
assert.match(screen, /data-testid='tl-contributions'/)
assert.match(screen, /navigator\.clipboard\.writeText\(contributions\.credits\)/, 'kredi metni kopyalanir')
assert.match(read('src/pages/translationStudio/StepStart.tsx'), /isTaskOverdue\(task\) \? txa\('Gecikti'\)/)

console.log('PASS translation studio tasks 2 (due date, overdue warning, contribution, credit)')
