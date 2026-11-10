import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import ts from 'typescript'
import { untranslate } from './i18n-source.mjs'

/*
 * Pending approval v2 (review desk):
 * - Every rejection passes a confirm dialog; rejecting a new manga / chapter DELETES the record, so the
 * dialog says it clearly ("cannot be undone"); on a revision rejection the published version stays.
 * - Reason: required on a post / fansub application, optional on a revision.
 * - Decisions return success info (the desk moves to the next request).
 * - The list is paged (no "load more" growing downward); the old double window was removed.
 */
const read = (path) => untranslate(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'))
function load(path, mocks = {}) {
  const out = {}
  const code = ts.transpileModule(read(path), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  new Function('require', 'exports', code)((name) => { if (name in mocks) return mocks[name]; throw new Error(`beklenmeyen import: ${name}`) }, out)
  return out
}

const presets = load('src/components/admin/pending/pendingRejectPresets.ts', { './pendingSectionUtils': {} })
const newManga = { id: 'm1', type: 'manga', title: 'Yeni' }
const newChapter = { id: 'c1', type: 'chapter', title: 'Yeni bolum' }
const revision = { id: 'r1', type: 'manga', title: 'Revizyon', revisionId: 'rev-1' }
const fansub = { id: 'f1', type: 'fansub_request', title: 'Ekip' }

assert.equal(presets.pendingRejectConsequence(newManga).destructive, true, 'new manga rejection deletes')
assert.equal(presets.pendingRejectConsequence(newChapter).destructive, true, 'new chapter rejection deletes')
assert.match(presets.pendingRejectConsequence(newManga).text, /geri al\u0131namaz/)
assert.equal(presets.pendingRejectConsequence(revision).destructive, false, 'on revision rejection the published version stays')
assert.equal(presets.pendingRejectReasonMode(fansub), 'required')
assert.equal(presets.pendingRejectReasonMode(revision), 'optional')
assert.equal(presets.pendingRejectReasonMode(newManga), 'none', 'a reason cannot be delivered on a record being deleted')
assert.ok(presets.pendingRejectPresets(fansub).length >= 3, 'fansub application ready-made reasons')

const section = read('src/components/admin/AdminPendingSection.tsx')
assert.match(section, /<PendingDecisionDialog/, 'ret penceresi')
assert.match(section, /onReject=\{\(\) => setRejectItem\(selected\)\}/, 'the Reject button opens the window first')
assert.doesNotMatch(section, /onReject\(item\)/, 'no direct rejection from the row')
assert.match(section, /const PAGE_SIZE = 12/, 'paged list')
assert.doesNotMatch(section, /Daha Fazla Yukle|visibleLimit/, 'no downward-growing list')
assert.match(section, /role="listbox"[\s\S]{0,160}onKeyDown=\{handleListKey\}/, 'listede ok tuslariyla gezinme')
assert.match(section, /lastIndexRef\.current/, 'after a decision the next request in the queue opens')

const dialog = read('src/components/admin/pending/PendingDecisionDialog.tsx')
assert.match(dialog, /mode !== 'required' \|\| trimmed\.length >= 3/, 'a required reason has at least 3 characters')
assert.match(dialog, /'Reddet ve sil'/)

const handlers = read('src/pages/admin/useAdminPendingHandlers.ts')
assert.match(handlers, /async function handleApprove\(item: PendingItem\): Promise<boolean>/)
assert.match(handlers, /async function handleReject\(item: PendingItem, manualReason\?: string\): Promise<boolean>/)

for (const dead of [
  'src/pages/admin/FansubRequestReviewModal.tsx',
  'src/components/admin/pending/AdminPendingQueuePanel.tsx',
  'src/components/admin/pending/AdminPendingItemCard.tsx',
  'src/components/admin/pending/AdminPendingFiltersCard.tsx',
  'src/components/admin/pending/AdminPendingSubTabs.tsx',
]) assert.equal(existsSync(new URL(`../../${dead}`, import.meta.url)), false, `${dead} kaldirildi`)

const detail = read('src/components/admin/pending/AdminPendingDetailContent.tsx')
assert.match(detail, /data-testid="admin-pending-manga-diff"/, 'changed fields in the revision')
assert.match(detail, /changed = MANGA_FIELDS\.filter\(\(field\) => !sameValue/)

console.log('PASS pending approvals v2 (rejection confirm, delete warning, reason, paged desk)')
