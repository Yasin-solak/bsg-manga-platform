import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { untranslate } from './i18n-source.mjs'

/*
 * Admin v2 desk layout and info cards (user feedback 2026-10-31):
 * - On desk pages (Pending approval, Support, Legal), list and tabs vanished on scroll:
 * at xl and up content is fixed to screen height (AdminPageShell
 * fill), list and details scroll inside; no sticky / 100vh calculated details.
 * - A fansub application shows the team's uploaded avatar on the row and title.
 * - Clicking chapter pages opens a large preview (arrows + keyboard).
 * - An info card on hovering a fansub / user / series name (admin_entity_card;
 * site admin only).
 */
const read = (path) => untranslate(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'))

const shell = read('src/components/admin/shared/AdminPageShell.tsx')
assert.match(shell, /fill = false/, 'fill is off by default (other pages scroll the document)')
assert.match(shell, /fill && 'xl:flex xl:h-svh xl:min-h-0 xl:flex-col'/, 'the desk is pinned to screen height')

const page = read('src/pages/AdminPage.tsx')
assert.match(page, /const DESK_SECTIONS: ReadonlySet<AdminSection> = new Set<AdminSection>\(\['pending', 'community', 'comments', 'lists', 'announcements', 'mangas', 'fansubs', 'users', 'coin_codes', 'support', 'legal_requests', 'diagnostics']\)/)
assert.match(page, /fill=\{fillDesk\}/)

const desks = {
  pending: read('src/components/admin/AdminPendingSection.tsx'),
  support: read('src/components/admin/sections/AdminSupportSection.tsx'),
  legal: read('src/components/admin/sections/AdminLegalRequestsSection.tsx'),
  // Community v2: section shell + tab desks (Servers / Reports) together.
  community: ['AdminCommunitySection.tsx', 'community/CommunityServersDesk.tsx', 'community/CommunityReportsDesk.tsx'].map((file) => read(`src/components/admin/sections/${file}`)).join(String.fromCharCode(10)),
  comments: read('src/components/admin/sections/AdminCommentModerationSection.tsx'),
  lists: read('src/components/admin/AdminMangaListsSection.tsx'),
  announcements: read('src/components/admin/announcements/AnnouncementManager.tsx'),
  mangas: read('src/components/admin/MangaManagementSection.tsx'),
}
for (const [name, source] of Object.entries(desks)) {
  assert.match(source, /flex flex-col gap-4 xl:min-h-0 xl:flex-1/, `${name}: the section fills the remaining height`)
  assert.match(source, /xl:grid-rows-\[minmax\(0,1fr\)\]/, `${name}: izgara satiri kabuga sigar`)
  assert.match(source, /min-h-0 divide-y divide-border\/50 overflow-y-auto/, `${name}: liste kendi icinde kayar`)
  assert.doesNotMatch(source, /xl:sticky|max-h-\[calc\(100vh/, `${name}: no sticky / 100vh computed detail`)
}
assert.match(desks.pending, /import \{ focusSheetContainer, useDeskLayout \} from '\.\/shared\/useDeskLayout'/, 'shared desk breakpoint')
assert.match(desks.support, /import \{ focusSheetContainer, useDeskLayout \} from '\.\.\/shared\/useDeskLayout'/)
// When the drawer opens on a narrow screen focus is on the drawer: the first item (info card trigger) does not open by itself.
for (const name of ['pending', 'support', 'community', 'comments', 'lists', 'announcements', 'mangas']) {
  assert.match(desks[name], /onOpenAutoFocus=\{focusSheetContainer\}/, `${name}: cekmece odagi`)
}
assert.match(desks.pending, /scrollIntoView\(\{ block: 'nearest' \}\)/, 'the row selected with arrow keys stays visible')

// Fansub basvurusu avatari (satir + baslik).
assert.match(desks.pending, /const src = item\.requestedAvatar/)
assert.match(desks.pending, /\{item\.type === 'fansub_request' \? <PendingThumb item=\{item\} large \/> : null\}/)

// Sayfa onizlemesi.
const detail = read('src/components/admin/pending/AdminPendingDetailContent.tsx')
assert.match(detail, /<PendingPageLightbox pages=\{pages\}/)
assert.match(detail, /onClick=\{\(\) => onOpen\(offset \+ index\)\}/, 'clicking a small image opens it large')
assert.doesNotMatch(detail, /max-h-\[260px\]/, 'no nested scrolling')
const lightbox = read('src/components/admin/pending/PendingPageLightbox.tsx')
assert.match(lightbox, /event\.key === 'ArrowLeft'/)
assert.match(lightbox, /event\.key === 'ArrowRight'/)
// Basvuru formu ham degerleri Turkce.
assert.match(detail, /experienced: 'Deneyimli'/)
assert.match(detail, /labeled\(AGE_POLICY_LABEL, meta\.ageRatingPolicy\)/)

// Bilgi karti.
const service = read('src/services/adminEntityCardService.ts')
assert.match(service, /supabase\.rpc\('admin_entity_card', \{ p_kind: kind, p_key: trimmed \}\)/)
assert.match(service, /value\.catch\(\(\) => \{ cache\.delete\(cacheKey\) \}\)/, 'an error does not stay in cache')
const migration = read('supabase/migrations/20261101120000_admin_entity_card.sql')
assert.match(migration, /if not app_private\.can_manage_moderation_state\(\) then/, 'site admin only')
assert.match(migration, /revoke all on function public\.admin_entity_card\(text, text\) from public, anon;/)
assert.match(migration, /u\.auth_user_id = v_id/, 'support requests carry the auth identity')
for (const [path, pattern] of [
  ['src/components/admin/AdminPendingSection.tsx', /<AdminEntityHoverCard kind=\{author\.kind\} entityKey=\{author\.key\}/],
  ['src/components/admin/pending/AdminPendingDetailContent.tsx', /<AdminEntityHoverCard kind="manga" entityKey=\{d\?\.mangaId \|\| d\?\.mangaSlug\}>/],
  ['src/components/admin/sections/AdminSupportSection.tsx', /<AdminEntityHoverCard kind="user" entityKey=\{row\.user_id\}/],
  ['src/components/admin/reports/ReportQueueTable.tsx', /<AdminEntityHoverCard kind="user" entityKey=\{report\.reporter_id\}/],
  ['src/components/admin/AdminSeriesRequestsSection.tsx', /<AdminEntityHoverCard kind="fansub" entityKey=\{draft\.fansubId\}>/],
]) assert.match(read(path), pattern, `${path}: info card`)

// Rapor hedef sutununda kimlik oneki yerine konum.
assert.doesNotMatch(read('src/components/admin/reports/ReportQueueTable.tsx'), /target_id\.slice\(0, 8\)/)

console.log('PASS admin desk layout v2 (screen height, avatar, page preview, info card)')
