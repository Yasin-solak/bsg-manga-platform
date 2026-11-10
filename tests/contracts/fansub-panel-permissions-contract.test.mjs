import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

// Panel tab permissions apply on the server too: a tab hidden in the UI has its RPC closed too.
const migration = read('supabase/migrations/20260928111825_fansub_panel_permissions.sql')
const nav = read('src/pages/fansubYonet/fansubStudioNavigation.ts')

// Eski public surumu kolon tabanliydi; artik izin tabanli surume baglidir.
assert.match(migration, /create or replace function public\.is_fansub_staff\(p_fansub_id uuid\)[\s\S]{0,160}select app_private\.is_fansub_staff\(p_fansub_id\);/)
// Sekme izni her zaman panel erisimiyle birlikte aranir.
assert.match(migration, /select 'panel\.erisim' = any\(perms\) and p_permission = any\(perms\)/)

const tabs = [...migration.matchAll(/'(uyelik|topluluk|ifadeler|kredi|bolumler|duyurular|gorevler|istatistik)'/g)].map((match) => match[1])
for (const tab of ['uyelik', 'topluluk', 'ifadeler', 'kredi', 'bolumler', 'duyurular', 'gorevler', 'istatistik']) {
  assert.ok(tabs.includes(tab), `server permission for the ${tab} tab`)
  assert.match(nav, new RegExp(`: 'panel\\.${tab}'`), `${tab}: UI and server use the same permission key`)
}

// Expected surfaces: sample mappings, and the migration stops itself if any are missing.
const expect = (name, tab) => assert.match(migration, new RegExp(`'${name.replace(/\./g, '\\.')}', '${tab}'`), `${name} -> ${tab}`)
expect('app_private.send_fansub_invite', 'uyelik')
expect('app_private.review_fansub_join_request', 'uyelik')
expect('app_private.upsert_fansub_pinned_notice', 'duyurular')
expect('app_private.upsert_fansub_chapter_credit_settings', 'kredi')
expect('app_private.update_fansub_chapter_for_review', 'bolumler')
expect('app_private.soft_delete_fansub_supporter_asset', 'ifadeler')
expect('public.fansub_invites.fansub_invites_insert_staff_or_admin', 'uyelik')
expect('public.manga_monthly_views.manga_monthly_views_select_admin_or_fansub_staff', 'istatistik')
assert.match(migration, /if v_done < 24 then\s+raise exception 'beklenen 24 fonksiyon/, 'the migration does not apply if there is an unmatched function')
assert.match(migration, /if v_done < 19 then\s+raise exception 'beklenen 19 politika/)
// Yalniz cagri adi degisir; argumanlar korunur.
assert.match(migration, /regexp_replace\(v_def, '\(app_private\\\.\|public\\\.\)\?is_fansub_staff\\\(',/)

console.log('PASS fansub panel permissions on the server (tab -> RPC / policy, old staff version permission based)')
