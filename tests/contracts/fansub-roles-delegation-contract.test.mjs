import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import ts from 'typescript'
import { activeLocaleShim } from './i18n-source.mjs'

const require = createRequire(import.meta.url)
const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

// --- DB: devredilebilir rol yonetimi (sira modeli) --------------------------------------
const migration = read('supabase/migrations/20260928112250_fansub_roles_delegation.sql')
const fix = read('supabase/migrations/20260928112352_fansub_roles_delegation_greatest_fix.sql')

assert.match(migration, /'panel\.kasa', 'panel\.takviye', 'ekip\.roller',/, 'new permission: Manage roles')
assert.match(migration, /fm\.role = 'admin'\) then -1/, 'admin rank is -1 (above every role)')
assert.match(migration, /\), 1001\)/, 'rolsuz uye en altta')
assert.match(migration, /app_private\.fansub_can\(p_fansub_id, 'panel\.erisim'\) and app_private\.fansub_can\(p_fansub_id, 'ekip\.roller'\)/, 'delegation comes with panel access')

// A delegate: only roles below, only with their own permissions.
assert.match(migration, /not v_owner and \(v_role\.is_default or v_role\.position <= v_rank\s+or exists \(select 1 from public\.fansub_member_roles own where own\.role_id = v_role\.id and own\.user_id = v_actor\)\)/, 'cannot edit own role, a higher role or the default role')
assert.match(migration, /not x = any\(v_role\.permissions\) and not x = any\(v_mine\)/, 'adds only permissions they hold')
assert.match(migration, /union select perm from pg_catalog\.unnest\(v_role\.permissions\) as perm where not perm = any\(v_mine\)/, 'kendinde olmayan izni silemez de (korunur)')
assert.match(migration, /if not v_owner and not v_permissions <@ v_mine then/, 'in a new role also only own permissions')
assert.match(migration, /v_position <= v_rank then\s+raise exception 'Rolü kendi sıranın üstüne taşıyamazsın\.'/, 'rolu kendi ustune tasiyamaz')
assert.match(migration, /v_user = v_actor or app_private\.fansub_rank\(p_fansub_id, v_user\) <= v_rank/, 'cannot touch roles of self or a higher member')
assert.match(migration, /where mr\.fansub_id = p_fansub_id and mr\.user_id = v_user and not v_owner and r\.position <= v_rank/, 'uyedeki ust roller aynen korunur')
assert.match(migration, /case when v_owner then 'admin' else 'role_manager' end/, 'denetim kaydinda kim yaptigi ayrisir')
assert.match(migration, /'manageable', v_owner or \(not r\.is_default and r\.position > v_rank/, 'per-role editability for the UI')

// GREATEST is not a function in pg_catalog: caught in a live test, fixed in a separate migration.
assert.match(fix, /replace\(v_def, 'pg_catalog\.greatest\(100, v_rank \+ 1\)', 'greatest\(100, v_rank \+ 1\)'\)/)
assert.match(fix, /if v_new = v_def then raise exception/, 'duzeltme sessizce bos gecmez')

// --- Service: templates and snapshot --------------------------------------------------
const exports = {}
const code = ts.transpileModule(read('src/services/fansubRolesService.ts'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
new Function('require', 'exports', code)((name) => { if (name === '@/i18n/activeLocale') return activeLocaleShim;
  if (name === 'zod') return require('zod')
  if (name === '@/services/supabase') return { supabase: {} }
  if (name === '@/services/apiResilience') return {}
  throw new Error(`beklenmeyen import: ${name}`)
}, exports)
const keys = new Set(exports.FANSUB_PERMISSION_KEYS)
assert.ok(keys.has('ekip.roller'))
assert.ok(exports.FANSUB_ROLE_TEMPLATES.length >= 5, 'hazir rol sablonlari')
for (const template of exports.FANSUB_ROLE_TEMPLATES) {
  for (const permission of template.permissions) assert.ok(keys.has(permission), `${template.name}: bilinen izin ${permission}`)
  // A template follows the dependent permission rule: with a sub-permission the base permission exists too.
  const withBases = exports.togglePermission([], template.permissions[0], true)
  for (const permission of template.permissions) {
    const toggled = exports.togglePermission(template.permissions, permission, true)
    assert.deepEqual([...toggled].sort(), [...template.permissions].sort(), `${template.name}: no missing base permission (${permission})`)
  }
  assert.ok(withBases.length >= 1)
}
assert.deepEqual(exports.FANSUB_ROLE_TEMPLATES.find((template) => template.name === 'Temizlikçi').permissions, ['ceviri.gor', 'ceviri.temizlik'], 'cleaner is PS only')

// --- Arayuz -------------------------------------------------------------------------
const panel = read('src/components/fansub/FansubRolesPanel.tsx')
assert.match(panel, /const permissions = \(template\?\.permissions \?\? \[\]\)\.filter\(\(key\) => isOwner \|\| snapshot\?\.myPermissions\.has\(key\)\)/, 'only permissions you can grant, from the template')
assert.match(panel, /disabled=\{!canGrant\(entry\.key\)\}/, 'sende olmayan izin anahtari kilitli')
assert.match(panel, /<fieldset disabled=\{!editable\} className='[^']*'>/, 'a non-editable role is read-only (permission grid locked with fieldset)')
assert.match(panel, /disabled=\{!editable\}\s+onChange=\{\(event\) => setDraft\(\{ \.\.\.draft, name: event\.target\.value \}\)\}/, 'rol adi da kilitli')
assert.match(panel, /disabled=\{busyMember === member\.userId \|\| !canEditMember\(member\) \|\| !role\.manageable\}/, 'ust uye / ust rol cipleri kilitli')
assert.match(panel, /if \(!other \|\| !role\.manageable \|\| !other\.manageable\) return/, 'order changes only among editable roles')
assert.match(read('src/pages/FansubYonetPage.tsx'), /const canManageRoles = isSiteAdmin \|\| myRole === 'admin' \|\| \(permissions\.has\('panel\.erisim'\) && permissions\.has\('ekip\.roller'\)\)/)

console.log('PASS fansub role delegation (rank model, permission limit, templates, UI locks)')
