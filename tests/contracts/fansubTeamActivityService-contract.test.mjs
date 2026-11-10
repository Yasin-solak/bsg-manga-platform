import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

/*
 * Team members <-> translation studio: member summary and contribution history are read only,
 * needing panel.uyelik permission (or site admin); the mapper is safe on broken data.
 */
const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')
const sql = read('supabase/migrations/20261031100000_fansub_team_studio_activity.sql').replace(/^\s*--.*$/gm, '')
for (const fn of ['get_fansub_team_studio_overview', 'get_fansub_member_activity']) {
  const start = sql.indexOf(`function public.${fn}(`)
  assert.ok(start >= 0, `${fn} tanimli`)
  const body = sql.slice(start, sql.indexOf('$function$;', start))
  assert.match(body, /app_private\.is_admin\(\) or app_private\.fansub_staff_uyelik\(p_fansub_id\)/, `${fn}: panel.uyelik izni`)
  assert.match(body, /\bstable\b/, `${fn}: read only`)
  assert.doesNotMatch(body, /\b(insert into|update public|delete from)\b/i, `${fn}: no writes`)
  assert.match(sql, new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from public, anon;`))
}
assert.match(sql, /where p like 'ceviri\.%'/, 'translation studio permissions only')

const source = read('src/services/fansubTeamActivityService.ts')
const exports = {}
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
new Function('require', 'exports', code)((name) => ({ '@/services/supabase': { supabase: {} }, '@/services/apiResilience': { withAbortSignal: () => {}, withServiceTimeout: () => {} } })[name] ?? (() => { throw new Error(`beklenmeyen import: ${name}`) })(), exports)

const overview = exports.mapTeamStudioOverview([
  { userId: 'u1', roles: [{ id: 'r1', name: 'Çevirmen', color: '#fff' }, { name: 'kimliksiz' }], studioPermissions: ['ceviri.gor', 5], openTasks: '2', overdueTasks: null },
  { roles: [] },
])
assert.equal(overview.length, 1, 'kimliksiz uye atlanir')
assert.equal(overview[0].roles.length, 1)
assert.deepEqual(overview[0].studioPermissions, ['ceviri.gor'])
assert.equal(overview[0].openTasks, 2)
assert.equal(overview[0].overdueTasks, 0)

const activity = exports.mapTeamMemberActivity({ taskTotals: { ceviri: { open: '1', done: 3 } }, tasks: [{ id: 't1', isOpen: true, chapterNumber: '12.5' }] })
assert.deepEqual(activity.taskTotals.ceviri, { open: 1, done: 3 })
assert.equal(activity.tasks[0].chapterNumber, 12.5)
assert.equal(activity.tasks[0].seriesTitle, 'Seri')
assert.deepEqual(exports.mapTeamMemberActivity(null).tasks, [])

const panel = read('src/components/fansub/FansubMembershipPanel.tsx')
assert.match(panel, /<FansubMemberDetailSheet/, 'uyeye tiklayinca ayrinti paneli')
console.log('PASS team members translation studio summary and contribution history')
