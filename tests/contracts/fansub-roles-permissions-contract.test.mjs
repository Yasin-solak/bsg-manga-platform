import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import ts from 'typescript'

const require = createRequire(import.meta.url)

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

function load(path, mocks = {}) {
  const exports = {}
  const code = ts.transpileModule(read(path), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  new Function('require', 'exports', code)((name) => {
    if (name === '@/i18n/activeLocale') return { intlLocale: () => 'tr-TR', txa: (text, vars = {}) => text.replace(/\{(\w+)\}/g, (whole, key) => (key in vars ? String(vars[key]) : whole)) }
    if (name in mocks) return mocks[name]
    throw new Error(`beklenmeyen import: ${name}`)
  }, exports)
  return exports
}

const migration = read('supabase/migrations/20260927200034_fansub_roles_permissions_v1.sql')

// --- Catalog: the DB and UI carry the same permission list ----------------------------------------
// Catalog: the LATEST migration defining the catalog (new permissions arrive in later migrations).
const catalogSource = readdirSync(new URL('../../supabase/migrations/', import.meta.url)).sort()
  .map((file) => read(`supabase/migrations/${file}`))
  .filter((source) => /create or replace function app_private\.fansub_permission_catalog\(\)/.test(source)).at(-1)
const sqlCatalog = [...catalogSource.match(/fansub_permission_catalog\(\)\s*returns text\[\][\s\S]*?array\[([\s\S]*?)\]::text\[\]/)[1].matchAll(/'([a-z.]+)'/g)].map((match) => match[1])
const roles = load('src/services/fansubRolesService.ts', { zod: require('zod'), '@/services/supabase': { supabase: {} }, '@/services/apiResilience': {} })
assert.deepEqual([...roles.FANSUB_PERMISSION_KEYS].sort(), [...sqlCatalog].sort(), 'the DB catalog and UI permission list match')
assert.ok(sqlCatalog.includes('ceviri.temizlik') && sqlCatalog.includes('ceviri.metin') && sqlCatalog.includes('ceviri.gor'), 'translation: view / text / cleanup (PS) are separate permissions')

// --- Bagimli izinler -------------------------------------------------------------------
assert.deepEqual(roles.togglePermission([], 'ceviri.temizlik', true).sort(), ['ceviri.gor', 'ceviri.temizlik'], 'alt izin temel izni de acar')
assert.deepEqual(roles.togglePermission(['ceviri.gor', 'ceviri.metin', 'panel.erisim'], 'ceviri.gor', false).sort(), ['panel.erisim'], 'temel izin kapaninca bagli izinler kapanir')
assert.deepEqual(roles.togglePermission(['panel.erisim', 'panel.kasa'], 'panel.kasa', false), ['panel.erisim'])

// --- DB guvenligi -----------------------------------------------------------------------
assert.match(migration, /revoke all on public\.fansub_roles from anon, authenticated;/, 'roles only via RPC')
assert.match(migration, /revoke all on public\.fansub_member_roles from anon, authenticated;/)
assert.match(migration, /check \(permissions <@ app_private\.fansub_permission_catalog\(\)\)/, 'bilinmeyen izin saklanamaz')
assert.match(migration, /if not \(app_private\.is_admin\(\) or app_private\.is_fansub_admin\(p_fansub_id\)\) then\s+raise exception 'Rolleri yalnız fansub admini yönetebilir\.'/, 'only the fansub admin manages roles')
assert.match(migration, /if v_member_role = 'admin' then raise exception/, 'admine rol atanmaz')
assert.match(migration, /r\.id = rid and r\.fansub_id = p_fansub_id and not r\.is_default/, 'baska fansubun rolu atanamaz')
assert.match(migration, /raise exception 'Varsayılan rol silinemez\.'/)
assert.match(migration, /insert into public\.fansub_audit_logs[\s\S]{0,200}'fansub_member_roles_set'/, 'rol atamalari denetim kaydina yazilir')
assert.match(migration, /then app_private\.fansub_permission_catalog\(\)\s+when not exists/, 'the fansub admin has all permissions, a non-member none')

// --- Backward compatibility: moderators continue with the same rights -----------------------------------
assert.match(migration, /create or replace function app_private\.is_fansub_staff\(p_fansub_id uuid\)[\s\S]{0,260}'panel\.erisim' = any\(app_private\.fansub_user_permissions\(p_fansub_id, app_private\.current_public_user_id\(\)\)\)/, 'staff = panel access permission')
assert.match(migration, /p_fansub_id, 'Moderatör', '#5b8def', 10, false, 'moderator',/, 'her fansuba Moderator rolu')
assert.doesNotMatch(migration.match(/'Moderatör'[\s\S]*?\]::text\[\]/)[0], /ceviri\.yayinla/, 'a moderator cannot publish, as before')
assert.match(migration, /where fm\.role = 'moderator'\s+on conflict do nothing;/, 'existing moderators get the Moderator role')
assert.match(migration, /create trigger fansub_members_sync_legacy_role after insert or update of role on public\.fansub_members/, 'one who becomes moderator by invite also gets the role')
assert.match(migration, /create trigger fansub_roles_seed after insert on public\.fansubs/, 'a new fansub is born with roles')

// --- Arayuz ---------------------------------------------------------------------------
const nav = load('src/pages/fansubYonet/fansubStudioNavigation.ts', { 'lucide-react': new Proxy({}, { get: () => () => null }) })
const perms = new Set(['panel.erisim', 'panel.bolumler'])
assert.equal(nav.canOpenFansubTab('bolumler', perms, false), true)
assert.equal(nav.canOpenFansubTab('kasa', perms, false), false, 'a tab without permission is closed')
assert.equal(nav.canOpenFansubTab('bolumler', new Set(['panel.bolumler']), false), false, 'a sub permission is useless without panel access')
assert.equal(nav.canOpenFansubTab('roller', new Set(roles.FANSUB_PERMISSION_KEYS), false), false, 'the roles tab is not delegated by permission')
assert.equal(nav.canOpenFansubTab('roller', new Set(), true), true)
const items = nav.buildFansubStudioNavItems({ pendingChapters: 0, pendingPosts: 0, pendingJoinRequests: 0, showBoostManageTab: false, permissions: perms, showRolesTab: false })
assert.deepEqual(items.map((item) => item.id), ['genel', 'bolumler'], 'the sidebar shows only permitted tabs')

const app = read('src/App.tsx')
assert.match(app, /path='fansub\/:id\/yonet'[\s\S]{0,120}<RequireFansubRoleRoute allowedRoles=\{\['admin'\]\} requiredPermission='panel\.erisim'>/, 'panel rotasi izinle korunur')
const guard = read('src/components/common/RequireFansubRoleRoute.tsx')
assert.match(guard, /\? currentFansubRole === 'admin' \|\| permissionGranted/)
const page = read('src/pages/FansubYonetPage.tsx')
assert.match(page, /const canManageContent = isSiteAdmin \|\| permissions\.has\('panel\.erisim'\)/)
assert.match(page, /const canManageRoles = isSiteAdmin \|\| myRole === 'admin'/)
assert.match(page, /if \(isSiteAdmin \|\| canOpenFansubTab\(activeTab, permissions, canManageRoles\)\) return/, 'a forbidden tab cannot be entered by hash')

console.log('PASS fansub role and permission system (catalog, dependent permissions, DB security, moderator compatibility, panel tabs)')
