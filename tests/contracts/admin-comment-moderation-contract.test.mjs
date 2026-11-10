import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { untranslate } from './i18n-source.mjs'

/*
 * Admin > Comments (v2, 2026-11-01): comment moderation desk.
 * Protected intent (from the old contract): all sources (community / chapter / manga / list),
 * expression-sticker preview, spoiler (marker + text), removal with reason and notification,
 * restore, member details, chain (reply) effect stated openly.
 * v2: the server searches / filters all comments (the old window scanned the last ~140),
 * real total + source counts, Turkish letter-insensitive signals (text only),
 * notification only to the selected comment's author, desk layout.
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')
const read = (relativePath) => untranslate(readFileSync(path.join(rootDir, relativePath), 'utf8'))
function load(relativePath, mocks = {}) {
  const out = {}
  const code = ts.transpileModule(read(relativePath), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  new Function('require', 'exports', code)((name) => { if (name in mocks) return mocks[name]; throw new Error(`beklenmeyen import: ${name}`) }, out)
  return out
}

for (const relativePath of [
  'src/components/admin/sections/AdminCommentModerationSection.tsx',
  'src/components/admin/sections/comments/AdminCommentBodyPreview.tsx',
  'src/components/admin/sections/comments/adminCommentModerationUtils.ts',
  'src/services/adminCommentModerationService/queries.ts',
  'src/services/adminCommentModerationService/shared.ts',
  'src/services/adminCommentModerationService/mutations.ts',
]) assert.equal(existsSync(path.join(rootDir, relativePath)), true, `${relativePath} bulunamadi`)
for (const removed of [
  'src/components/admin/sections/comments/AdminCommentActorTable.tsx',
  'src/components/admin/sections/comments/AdminCommentActorDetailPanel.tsx',
]) assert.equal(existsSync(path.join(rootDir, removed)), false, `${removed} kullanilmiyordu, kaldirildi`)

const section = read('src/components/admin/sections/AdminCommentModerationSection.tsx')
// The removal dialog is shared: list comments in Lists use the same flow.
const removeDialog = read('src/components/admin/sections/comments/CommentRemoveDialog.tsx')
assert.match(section, /import \{ CommentRemoveDialog \} from '\.\/comments\/CommentRemoveDialog'/)
assert.match(section, /title="Yorumlar"/)
assert.match(section, /listAdminCommentModerationPage\(\{ source, status, signal, search, limit: PAGE_SIZE, offset: page \* PAGE_SIZE \}\)/, 'server pages')
assert.match(section, /flex flex-col gap-4 xl:min-h-0 xl:flex-1/)
assert.match(section, /xl:grid-rows-\[minmax\(0,1fr\)\]/)
assert.match(section, /min-h-0 divide-y divide-border\/50 overflow-y-auto/)
assert.match(section, /id: 'flagged', label: 'Riskli', status: 'active', signal: 'flagged'/)
assert.match(section, /COMMENT_SOURCE_ORDER\.map/)
assert.match(section, /AdminCommentBodyPreview/)
assert.match(section, /FansubIdentityTagChip/)
assert.match(section, /AdminUserDetailModal/)
assert.match(section, /<AdminEntityHoverCard kind="user" entityKey=\{comment\.authorUserId \|\| null\}/)
assert.match(section, /<AdminEntityHoverCard kind="manga" entityKey=\{comment\.mangaId\}>/)
assert.match(section, /onOpenAutoFocus=\{focusSheetContainer\}/)
assert.ok(removeDialog.includes('Kald\u0131r ve bildir'), 'removal with notification')
assert.ok(section.includes('Geri a\u00e7'), 'geri acma')
assert.ok(removeDialog.includes('yan\u0131t\u0131 da gizlenir; yan\u0131t yazanlara bildirim gitmez'), 'chain effect is explicit')
assert.ok(section.includes('Riskli yorum yok'), 'with no risky items it does not silently return to latest comments')
assert.doesNotMatch(section, /windowComments|collectCascadeCommentIds/, 'no window')

const queries = read('src/services/adminCommentModerationService/queries.ts')
assert.match(queries, /supabase\.rpc\('admin_list_moderation_comments'/)
assert.doesNotMatch(queries, /get_admin_comment_moderation_window/)
for (const field of ['activeFansubIdentityTag', 'isSpoiler', 'signals', 'replyCount', 'authorRemovedCount']) {
  assert.match(queries, new RegExp(field), `field: ${field}`)
}

const migration = read('supabase/migrations/20261101140000_admin_comment_moderation_v2.sql')
assert.match(migration, /if not app_private\.can_manage_moderation_state\(\) then/)
assert.match(migration, /revoke all on function public\.admin_list_moderation_comments\(text, text, text, text, integer, integer\) from public, anon;/)
assert.match(migration, /app_private\.comment_moderation_signals\(b\.body, b\.is_spoiler\)/, 'signal only from text')
assert.doesNotMatch(migration, /v_scan_limit/, 'no window limit')

// Sinyaller: Turkce harf katlama, ekli kokler, masum kelimeler, satir ici spoiler.
const shared = read('src/services/adminCommentModerationService/shared.ts')
assert.match(shared, /comment\.isSpoiler \|\| SPOILER_PATTERN/)
const { detectAdminCommentSignals } = load('src/services/adminCommentModerationService/shared.ts', {
  '@/lib/fansubSupporterAssetTokens': { FANSUB_SUPPORTER_ASSET_TOKEN_PATTERN_SOURCE: ':fse_[a-z0-9_]+:' },
})
const signalsOf = (body, isSpoiler = false) => detectAdminCommentSignals({ body, isSpoiler })
assert.deepEqual(signalsOf('Sen tam bir GER\u0130ZEKALISIN'), ['abuse'])
assert.deepEqual(signalsOf('pi\u00e7 kurusu'), ['abuse'])
assert.deepEqual(signalsOf('bu b\u00f6l\u00fcm\u00fcn sonu\u00e7 k\u0131sm\u0131'), [], 'result is not a spoiler')
assert.deepEqual(signalsOf('olumlu d\u00fc\u015f\u00fcnelim'), [], 'positive is not a spoiler')
assert.deepEqual(signalsOf('malzeme listesi'), [], 'material is not an insult')
assert.deepEqual(signalsOf('||Liora casus||'), ['spoiler'])
assert.deepEqual(signalsOf('finali \u00e7ok iyiydi'), ['spoiler'])
assert.deepEqual(signalsOf('indirimli coinler https://x.co'), ['links', 'spam'])

const mutations = read('src/services/adminCommentModerationService/mutations.ts')
assert.match(mutations, /comment\.remove/)
assert.match(mutations, /if \(!isActive && targetIds\.has\(comment\.id\)\) \{/, 'no notification to reply authors')
assert.match(mutations, /sendCommentModerationNotification/)
const presets = read('src/services/notificationService/presets.ts')
assert.ok(presets.includes("title: 'Yorumun kald\u0131r\u0131ld\u0131'"), 'notification in Turkish')
assert.match(presets, /bypassPreferences: true/)

const utils = read('src/components/admin/sections/comments/adminCommentModerationUtils.ts')
assert.match(utils, /commentRouteActionLabel/)
assert.match(utils, /commentBodyKindLabel/)
// Old community post comments were removed; sources are manga / chapter / list.
assert.doesNotMatch(utils, /'community'/)
assert.ok(utils.includes("'Liste'"))

assert.match(read('src/pages/admin/adminNavigation.ts'), /id: 'comments'/)
assert.match(read('src/pages/admin/adminRoutes.ts'), /comments: 'yorumlar'/)
assert.match(read('src/pages/AdminPage.tsx'), /activeSection === 'comments'/)

console.log('PASS admin comment moderation v2 contract')
