import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// English text entered from the panel: since the table is public only text in public use
// can be saved; writes go through an admin RPC and land in the audit record.
const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

const sql = read('supabase/migrations/20261104120000_i18n_text_overrides.sql')
assert.match(sql, /enable row level security/, 'RLS on')
assert.match(sql, /revoke all on public\.i18n_text_overrides from anon, authenticated/, 'no direct writes')
assert.doesNotMatch(sql, /for (insert|update|delete|all)\b/i, 'no write policy')
assert.match(sql, /e\.audience = 'all'/, 'ozel kitleli duyuru listelenmez')
assert.match(sql, /e\.status = 'published'/, 'taslak duyuru listelenmez')
assert.match(sql, /p\.hide_until_launch/, 'a product hidden on exit is not listed')
assert.match(sql, /revoke all on function public\.i18n_public_source_rows\(\) from public, anon, authenticated/, 'the source list is closed externally')
const save = sql.slice(sql.indexOf('create function public.admin_i18n_save_text'))
assert.match(save, /if not public\.is_admin\(\)/, 'saving requires admin')
assert.match(save, /i18n_public_source_rows\(\) r where r\.source_text = p_source_text/, 'yayinda olmayan metin kaydedilemez')
assert.match(save, /create_admin_audit_log/, 'saving lands in the audit')

const locale = read('src/i18n/activeLocale.ts')
assert.match(locale, /enOverrides\[text\] \?\? enDictionary\[text\] \?\? text/, 'a panel entry overrides the dictionary')
assert.match(locale, /await import\('\.\/enOverrides'\)/, 'a Turkish reader does not load it')
const loader = read('src/i18n/enOverrides.ts')
assert.match(loader, /FIRST_LOAD_WAIT_MS/, 'first open does not wait on the network forever')
assert.match(loader, /await import\('@\/services\/supabase'\)/)

const section = read('src/components/admin/sections/AdminTextTranslationsSection.tsx')
assert.match(section, /lookupEnDictionary/, 'eksik tespiti koddaki sozluge bakar')
assert.match(read('src/pages/admin/adminRoutes.ts'), /text_translations: 'metin-cevirileri'/)

const content = read('src/components/announcements/AnnouncementContent.tsx')
assert.match(content, /text=\{txa\(b\.text\)\}/, 'duyuru metni cevrilir')

// Canliya yazan e2e'ler filtresiz kosuda hesap acmamali.
for (const spec of ['manga-comment-report', 'chapter-credit-management', 'comments-verification-test', 'comprehensive-backend-test']) {
  assert.match(read(`tests/e2e/${spec}.spec.ts`), /test\.skip\(process\.env\.E2E_ALLOW_LIVE_ACCOUNTS !== '1'/, `${spec} requires explicit permission`)
}

// A selector based on text silently breaks when the language changes or the text is fixed (the sidebar account chip broke this way).
const homeCss = read('src/components/home/desktop/desktop-home.css')
assert.doesNotMatch(homeCss, /\[aria-label[*^$]?=/, 'CSS does not select by visible text')
assert.match(homeCss, /\.dh-account>\[data-account-part="user"\]/, 'the account chip is selected by data attribute')
assert.match(read('src/components/layout/AccountTopBarActions.tsx'), /data-account-part="user"/)
assert.match(read('src/components/notifications/NotificationTrigger.tsx'), /data-account-part="bell"/)

// A letter scan cannot see ASCII-looking Turkish ("Profilim", "takip"): visible database names and the menu are translated.
const accountMenu = read('src/components/layout/AccountTopBarActions.tsx')
for (const word of ['Profilim', 'Envanter', 'Bakiye', 'Coin Kodu']) {
  assert.match(accountMenu, new RegExp(`txa\\('${word}'\\)`), `the account menu gets translated: ${word}`)
}
assert.match(read('src/pages/profile/ProfileTasksPanel.tsx'), /txa\(task\.title\)/, 'the completed task name gets translated')
assert.match(read('src/pages/profile/ProfileCollectionTabs.tsx'), /txa\(level\.title\)/, 'seviye adi cevrilir')
