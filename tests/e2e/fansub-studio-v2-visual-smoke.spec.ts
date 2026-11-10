import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'

/*
 * Fansub studio v2 visual smoke: admin RPCs are fed fake data,
 * sidebar + overview + server tab are drawn on desktop and mobile.
 */
const FANSUB_ID = 'b33e2830-8cb6-4fe3-9467-9795ef28b109'
const OUT_DIR = path.resolve('test-results/fansub-studio-v2')
const json = (body: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString()

async function mockStudio(page: Page) {
  await page.addInitScript(() => {
    window.__BSGMANGA_E2E__ = {
      mockAuthUser: {
        id: '11111111-1111-1111-1111-111111111111',
        authUserId: '11111111-1111-1111-1111-111111111111',
        username: 'yonetici',
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=yonetici',
        role: 'user',
        isBanned: false,
        isActive: true,
        stones: 8000,
        ownedItems: { frames: ['default'], backgrounds: [], patterns: [], premium: [] },
        frameType: 'default',
        birthDate: '1998-04-12',
        onboardingCompletedAt: '2026-04-01T09:00:00.000Z',
        premiumExpiresAt: null,
      },
    }
  })
  await page.route('**/rest/v1/rpc/get_my_fansub_permissions', (route) => route.fulfill(json([
    'panel.erisim', 'panel.mangalar', 'panel.bolumler', 'panel.topluluk', 'panel.duyurular', 'panel.kredi',
    'panel.gorevler', 'panel.ifadeler', 'panel.uyelik', 'panel.istatistik', 'panel.kasa', 'panel.takviye', 'ekip.roller',
    'ceviri.gor', 'ceviri.proje',
  ])))
  await page.route('**/rest/v1/fansub_members?select=role*', (route) => route.fulfill(json({ role: 'admin' })))
  await page.route('**/rest/v1/rpc/get_fansub_manage_analytics_summary', (route) => route.fulfill(json({
    overview: { followerCount: 1284, totalViews: 48210, totalDonationAmount: 3400, totalDonationCount: 21, totalMangaCount: 6, totalChapterCount: 142, totalPostCount: 9, lastDonationAt: daysAgo(2) },
    momentum: { newFollowers7d: 37, newFollowers30d: 140, newChapters7d: 4, newChapters30d: 15, newPosts7d: 0, newPosts30d: 1, donationCount7d: 2, donationCount30d: 6, donationAmount7d: 300, donationAmount30d: 1200 },
    statuses: { mangas: { approved: 6, pending: 0, active: 6, inactive: 0 }, chapters: { approved: 138, pending: 3, scheduled: 2 }, posts: { approved: 9, pending: 0, rejected: 0 } },
    topMangas: [],
    recentActivity: [
      { id: 'a1', action: 'chapter.approve', resourceType: 'chapter', summary: 'Gece Yolcusu 42. bolumu onayladi', createdAt: daysAgo(0.1), actor: { id: 'u1', username: 'mira', role: 'moderator' } },
      { id: 'a2', action: 'member.role', resourceType: 'member', summary: 'kuzey kullanicisini Cevirmen rolune aldi', createdAt: daysAgo(0.6), actor: { id: 'u2', username: 'yonetici', role: 'admin' } },
      { id: 'a3', action: 'notice.create', resourceType: 'notice', summary: 'Yeni duyuru: Hafta sonu cift bolum', createdAt: daysAgo(1.4), actor: { id: 'u2', username: 'yonetici', role: 'admin' } },
      { id: 'a4', action: 'manga.update', resourceType: 'manga', summary: 'Sis Sehri serisinin kapagini guncelledi', createdAt: daysAgo(3), actor: { id: 'u1', username: 'mira', role: 'moderator' } },
    ],
  })))
  await page.route('**/rest/v1/rpc/get_fansub_manage_overview_cockpit', (route) => route.fulfill(json({
    pipeline: { draft: 4, pending: 3, scheduled: 2, published: 131, problem: 1 },
    approvalQueue: [],
    upcoming: [
      { id: 'c1', mangaTitle: 'Gece Yolcusu', mangaSlug: 'gece-yolcusu', coverImageUrl: null, chapterNumber: 43, title: 'Son durak', publishAt: new Date(Date.now() + 5 * 3_600_000).toISOString() },
      { id: 'c2', mangaTitle: 'Sis Sehri', mangaSlug: 'sis-sehri', coverImageUrl: null, chapterNumber: 18, title: null, publishAt: new Date(Date.now() + 2 * 86_400_000).toISOString() },
    ],
    team: { total: 9, admins: 1, moderators: 2, members: 6, tags: [{ tag: 'translator', count: 3 }, { tag: 'editor', count: 2 }] },
    community: { commentsToday: 0, likesToday: 0, reactionsToday: 0, postsToday: 0, openReports: 0 },
  })))
  await page.route('**/rest/v1/rpc/get_fansub_manage_community_v2', (route) => route.fulfill(json({
    enabled: false,
    canCreate: false,
    adminCount: 1,
    server: { id: '560fe6dd-3e24-4ce6-b946-f372c86ab729', name: 'Karanlik Koridor', joinMode: 'open', archivedAt: null, createdAt: '2026-09-19T16:22:32Z', isMember: true, isOwner: true },
    stats: { members: 212, newMembers7d: 14, banned: 1, messages7d: 486, chatters7d: 41, channels: 6, roles: 3, pendingJoinRequests: 2, openReports: 1, activeInvites: 2 },
    channels: [
      { id: '269bda84-7392-4725-aecd-b35e53b5ad53', name: 'genel-sohbet', category: 'Sohbet', isPrivate: false, archived: false, mangaTitle: null, messages7d: 280, lastMessageAt: daysAgo(0.01) },
      { id: '269bda84-7392-4725-aecd-b35e53b5ad54', name: 'gece-yolcusu', category: 'Seriler', isPrivate: false, archived: false, mangaTitle: 'Gece Yolcusu', messages7d: 160, lastMessageAt: daysAgo(0.2) },
      { id: '269bda84-7392-4725-aecd-b35e53b5ad55', name: 'ekip-sohbeti', category: 'Ekip', isPrivate: true, archived: false, mangaTitle: null, messages7d: 46, lastMessageAt: daysAgo(1) },
      { id: '269bda84-7392-4725-aecd-b35e53b5ad56', name: 'eski-duyurular', category: '', isPrivate: false, archived: true, mangaTitle: null, messages7d: 0, lastMessageAt: daysAgo(40) },
    ],
    daily: Array.from({ length: 14 }, (_, i) => ({ day: daysAgo(13 - i).slice(0, 10), messages: [12, 30, 22, 41, 38, 25, 60, 54, 47, 70, 66, 58, 81, 74][i] })),
  })))
  await page.route('**/rest/v1/rpc/get_runtime_feature_flags', (route) => route.fulfill(json([
    { key: 'boost.system', is_enabled: true },
    { key: 'boost.fansub_manage_tab', is_enabled: true },
    { key: 'translation.studio_v3', is_enabled: true },
    { key: 'rewards.fansub_tasks', is_enabled: true },
  ])))
  await page.route('**/rest/v1/rpc/get_public_fansub_boost_snapshot', (route) => route.fulfill(json([{
    fansub_id: FANSUB_ID, active_power: 0, tier_level: 0, active_supporter_count: 0, active_grant_count: 0,
    active_monthly_supporter_count: 0, active_mega_supporter_count: 0, active_top_supporter_count: 0,
    capabilities: { tierKey: 'core', tierLabel: 'Core', tierLevel: 0, canManagePinnedNotice: true, canUseSpecialNotifications: true, hasChapterEndCredit: true },
    last_grant_expires_at: null, current_tier_floor_power: 0, next_tier_level: 1, next_tier_required_power: 3, next_tier_remaining_power: 3, tier_progress_percent: 0,
  }])))
  // Announcement targets: one series, empty chapter / post / list.
  await page.route('**/rest/v1/mangas?select=id%2Cfansub_id%2Ctitle*', (route) => route.fulfill({ ...json([
    { id: 'm1', fansub_id: FANSUB_ID, title: 'Gece Yolcusu', slug: 'gece-yolcusu', description: '', status: 'ongoing', genres: [], cover_image_url: null, last_chapter_number: 43, total_views: 1200, rating: 0, total_ratings: 0, is_approved: true, is_active: true, created_at: daysAgo(90), updated_at: daysAgo(1) },
  ]), headers: { 'content-range': '0-0/1' } }))
  await page.route('**/rest/v1/manga_follows?select=manga_id*', (route) => route.fulfill(json([])))
  await page.route('**/rest/v1/rpc/list_fansub_manage_chapters', (route) => route.fulfill(json({ items: [], total: 0, page: 1, limit: 50 })))
  await page.route('**/rest/v1/rpc/list_fansub_manage_posts', (route) => route.fulfill(json({ items: [], total: 0, page: 1, limit: 50 })))
  await page.route('**/rest/v1/user_manga_lists?*', (route) => route.fulfill({ ...json([]), headers: { 'content-range': '*/0' } }))
  // Chapter edit window: a fake 6-page chapter.
  await page.route('**/rest/v1/chapters?select=id%2Cfansub_id%2Cmanga_id%2Cchapter_number%2Ctitle%2Cpages*', (route) => route.fulfill(json({
    id: 'c-edit', fansub_id: FANSUB_ID, manga_id: 'm1', chapter_number: 12, title: 'Sis', is_approved: true, is_active: true, updated_at: daysAgo(1),
    pages: Array.from({ length: 6 }, (_, i) => `https://api.dicebear.com/7.x/shapes/svg?seed=sayfa${i}`),
  })))
  await page.route('**/rest/v1/rpc/get_fansub_member_activity', (route) => route.fulfill(json({
    taskTotals: { ceviri: { open: 2, done: 14 }, dizgi: { open: 0, done: 5 } },
    tasks: [
      { id: 'tk1', stage: 'ceviri', status: 'bekliyor', isOpen: true, dueAt: daysAgo(-1), updatedAt: daysAgo(0.2), completedAt: null, pageNumber: 4, projectId: 'p1', chapterNumber: 43, seriesTitle: 'Gece Yolcusu' },
      { id: 'tk2', stage: 'dizgi', status: 'tamam', isOpen: false, dueAt: null, updatedAt: daysAgo(2), completedAt: daysAgo(2), pageNumber: 7, projectId: 'p1', chapterNumber: 42, seriesTitle: 'Gece Yolcusu' },
    ],
    projectsCreated: 3, pageVersions: 128, pageVersions30d: 22,
    recentActions: [{ id: 'ra1', action: 'chapter.approve', summary: 'Gece Yolcusu 42. bolumu onayladi', createdAt: daysAgo(0.1) }],
    history: [{ role: 'member', teamTag: 'cevirmen', joinedAt: daysAgo(120), leftAt: null, leftReason: 'active' }],
  })))
  await page.route('**/rest/v1/rpc/list_fansub_roles', (route) => route.fulfill(json({
    roles: [
      { id: 'r1', name: 'Proje sorumlusu', color: '#f46a6a', position: 1, is_default: false, system_key: null, permissions: ['panel.erisim', 'panel.bolumler', 'ceviri.gor', 'ceviri.proje', 'ceviri.metin', 'ceviri.yayinla'], member_count: 1, manageable: true },
      { id: 'r2', name: 'Çevirmen', color: '#5b8def', position: 2, is_default: false, system_key: null, permissions: ['ceviri.gor', 'ceviri.metin'], member_count: 2, manageable: true },
      { id: 'r0', name: 'Üye', color: null, position: 1000, is_default: true, system_key: 'member', permissions: ['ceviri.gor'], member_count: 0, manageable: true },
    ],
    assignments: [{ user_id: '33333333-3333-3333-3333-333333333333', role_ids: ['r2'] }],
    can_manage: true, is_owner: true, my_rank: -1, my_user_id: '11111111-1111-1111-1111-111111111111', my_permissions: [],
  })))
  const quest = (slug: string, title: string, description: string, kind: string, group: string, tier: number, metric: string, target: number, progress: number, coin: number, extra: Record<string, unknown> = {}) => ({
    quest_id: `q-${slug}`, slug, title, description, audience: 'fansub', kind, metric_key: metric, target_value: target, progress_value: progress,
    is_completed: progress >= target, is_claimed: false, is_claimable: progress >= target, is_locked: false, reward_kind: 'coin', coin_reward: coin,
    badge_id: null, badge_name: null, badge_image_url: null, reward_item_id: null, reward_item_name: null, reward_item_type: null, reward_item_image: null,
    boost_credit: 0, gate_metric_key: null, gate_min_value: null, gate_progress_value: null, gate_met: true, task_group: group, tier_level: tier,
    unlock_quest_id: null, unlock_quest_title: null, period_key: kind === 'weekly' ? '2026-W44' : 'lifetime', claimed_at: null, sort_order: tier, starts_at: null, ends_at: null,
    ...extra,
  })
  const done = { is_claimed: true, is_claimable: false }
  await page.route('**/rest/v1/rpc/list_quests', (route) => route.fulfill(json([
    quest('w1', 'Haftanın bölümleri', 'Bu hafta 2 bölüm yayınla.', 'weekly', 'haftalik', 1, 'week_chapters_published', 2, 2, 80),
    quest('w2', 'Stüdyo mesaisi', 'Çeviri Stüdyosu sayfa görevlerinden bu hafta 20 tanesini bitirin.', 'weekly', 'haftalik', 1, 'week_studio_pages_done', 20, 13, 100),
    quest('w3', 'Ekip işi', 'Bu hafta en az 3 farklı üye stüdyoda görev bitirsin.', 'weekly', 'haftalik', 1, 'week_active_contributors', 3, 1, 120),
    quest('w4', 'Yeni yüzler', 'Bu hafta 5 yeni takipçi kazan.', 'weekly', 'haftalik', 1, 'week_new_followers', 5, 5, 60, { ...done, claimed_at: daysAgo(1) }),
    quest('w5', 'Haber ver', 'Bu hafta profiline bir duyuru ekle.', 'weekly', 'haftalik', 1, 'week_notices_published', 1, 0, 30),
    quest('a1', 'İlk çeviri', 'Toplam 3 bölüm yayınla.', 'achievement', 'ceviri', 1, 'chapters_published', 3, 142, 100, done),
    quest('a2', 'Çeviri ustası', 'Toplam 25 bölüm yayınla.', 'achievement', 'ceviri', 2, 'chapters_published', 25, 142, 500, done),
    quest('a3', 'Çeviri efsanesi', 'Toplam 100 bölüm yayınla.', 'achievement', 'ceviri', 3, 'chapters_published', 100, 142, 3000),
    quest('s1', 'İlk stüdyo bölümü', 'Stüdyoda hazırlanan ilk bölümü yayınla.', 'achievement', 'studyo', 1, 'studio_chapters_published', 1, 0, 200),
    quest('s2', 'Isınma turu', 'Stüdyoda 25 sayfa görevi bitirin.', 'achievement', 'studyo', 1, 'studio_pages_done', 25, 19, 150),
    quest('s3', 'Atölye', 'Stüdyoda 250 sayfa görevi bitirin.', 'achievement', 'studyo', 2, 'studio_pages_done', 250, 19, 800, { is_locked: true }),
    quest('b1', 'İlk takipçiler', 'Fansubun 10 takipçiye ulaşsın.', 'achievement', 'buyume', 1, 'followers_count', 10, 1284, 120, done),
    quest('b2', 'Popüler fansub', 'Fansubun 100 takipçiye ulaşsın.', 'achievement', 'buyume', 2, 'followers_count', 100, 1284, 600, done),
    quest('b3', 'Süper fansub', 'Fansubun 500 takipçiye ulaşsın.', 'achievement', 'buyume', 3, 'followers_count', 500, 1284, 5000, done),
    quest('e1', 'Ekip düzeni', 'Roller ve izinler sekmesinde en az 2 rol tanımla.', 'achievement', 'ekip', 1, 'roles_defined', 2, 3, 80),
    quest('e2', 'Ekip kurucu', 'Ekibin 3 üyeye ulaşsın.', 'achievement', 'ekip', 1, 'members_count', 3, 9, 100, done),
    quest('t1', 'İlk duyuru', 'Profiline ilk duyuruyu ekle.', 'achievement', 'topluluk', 1, 'notices_published', 1, 0, 50),
  ])))
  await page.route('**/rest/v1/rpc/tl_assignable_members', (route) => route.fulfill(json([
    { user_id: '00000000-0000-4000-8000-00000000a001', username: 'site_owner', avatar_url: null, stages: ['temizlik', 'ceviri', 'dizgi', 'kontrol'] },
    { user_id: '33333333-3333-3333-3333-333333333333', username: 'kuzey', avatar_url: null, stages: ['ceviri', 'kontrol'] },
    { user_id: '22222222-2222-2222-2222-222222222222', username: 'mira', avatar_url: null, stages: ['temizlik', 'ceviri', 'dizgi', 'kontrol'] },
  ])))
  await page.route('**/rest/v1/translation_projects?select=*', (route) => route.fulfill(json([
    { id: '44444444-4444-4444-4444-444444444444', fansub_id: FANSUB_ID, manga_id: '77777777-7777-7777-7777-777777777771', series_draft_id: null, chapter_number: 43, chapter_title: 'Son durak', source_language: 'ja', target_language: 'tr', stage: 'edit', version: 3, updated_at: daysAgo(0.2), revision_of: null, mangas: { title: 'Gece Yolcusu', cover_image_url: null, is_mature: false }, translation_series_drafts: null, translation_pages: [{ count: 18 }] },
    { id: '55555555-5555-5555-5555-555555555555', fansub_id: FANSUB_ID, manga_id: '77777777-7777-7777-7777-777777777772', series_draft_id: null, chapter_number: 18, chapter_title: null, source_language: 'ja', target_language: 'tr', stage: 'scan', version: 1, updated_at: daysAgo(1), revision_of: null, mangas: { title: 'Sis Şehri', cover_image_url: null, is_mature: false }, translation_series_drafts: null, translation_pages: [{ count: 22 }] },
  ])))
  const PAGE_ID = (i: number) => `66666666-6666-6666-6666-${String(i).padStart(12, '0')}`
  await page.route('**/rest/v1/translation_pages?select=*', (route) => route.fulfill(json(Array.from({ length: 18 }, (_, i) => ({
    id: PAGE_ID(i), page_index: i, file_name: `${i + 1}.png`, raw_status: 'ready', width: 900, height: 1300, scan_stage: 'read', scan_error: null, version: 1,
  })))))
  await page.route('**/rest/v1/translation_page_tasks?select=*', (route) => route.fulfill(json([
    ...[0, 1, 2, 3].map((i) => ({ id: `tk-a${i}`, page_id: PAGE_ID(i), stage: 'ceviri', assignee_id: '22222222-2222-2222-2222-222222222222', status: i < 2 ? 'tamam' : 'devam', note: null, due_at: null, updated_at: daysAgo(1) })),
    ...[4, 5].map((i) => ({ id: `tk-b${i}`, page_id: PAGE_ID(i), stage: 'ceviri', assignee_id: '33333333-3333-3333-3333-333333333333', status: 'bekliyor', note: null, due_at: null, updated_at: daysAgo(1) })),
  ])))
  await page.route('**/rest/v1/fansubs?select=coin_balance*', (route) => route.fulfill(json({ coin_balance: 32955 })))
  await page.route('**/rest/v1/fansub_transactions?select=id*', (route) => route.fulfill(json([
    { id: 't1', fansub_id: FANSUB_ID, amount: 5000, type: 'donation', description: 'Okur bagisi', created_at: daysAgo(1) },
    { id: 't2', fansub_id: FANSUB_ID, amount: -250, type: 'purchase', description: 'Neon cerceve', created_at: daysAgo(1.2) },
    { id: 't3', fansub_id: FANSUB_ID, amount: 645, type: 'reward_task', description: 'Haftalik gorev', created_at: daysAgo(9) },
    { id: 't4', fansub_id: FANSUB_ID, amount: 11000, type: 'redeem', description: 'Kampanya kodu', created_at: daysAgo(70) },
  ])))
  await page.route('**/rest/v1/fansub_join_requests?select=id%2Cfansub_id*', (route) => route.fulfill(json([
    { id: 'j1', fansub_id: FANSUB_ID, requester_user_id: 'r1', message: 'Dizgide yardim edebilirim', status: 'pending', created_at: daysAgo(0.3), updated_at: daysAgo(0.3), requester: { id: 'r1', username: 'ayaz', avatar_url: null } },
  ])))
}

test.use({ video: 'off', trace: 'off', ...(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {}) })

test.describe('Fansub studio v2', () => {
  test('overview and server tab render', async ({ page }) => {
    test.setTimeout(240_000)
    await mockStudio(page)
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.goto(`/tr/fansub/${FANSUB_ID}/yonet?e2e=1`)
    await expect(page.getByTestId('studio-overview')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByTestId('studio-kpis')).toBeVisible()
    await page.waitForTimeout(1500)
    await page.screenshot({ path: path.join(OUT_DIR, 'overview-desktop.png'), fullPage: true })

    await page.getByTestId('fansub-studio-nav-topluluk').click()
    await expect(page.getByTestId('studio-community')).toBeVisible()
    await page.waitForTimeout(800)
    await page.screenshot({ path: path.join(OUT_DIR, 'community-desktop.png'), fullPage: true })

    for (const tab of ['mangalar', 'bolumler', 'kapanis-kredisi', 'ifadeler', 'uyelik', 'roller', 'takviye', 'gorevler', 'istatistikler', 'kasa', 'duyurular']) {
      const navItem = page.getByTestId(`fansub-studio-nav-${tab}`)
      if (!(await navItem.count())) continue
      await navItem.click()
      await page.waitForTimeout(1500)
      await page.screenshot({ path: path.join(OUT_DIR, `tab-${tab}.png`) })
    }

    // Ekip uyesi ayrinti paneli.
    await page.getByTestId('fansub-studio-nav-uyelik').click()
    await page.waitForTimeout(1200)
    const memberButton = page.getByRole('button', { name: /ayrıntıları$/ }).first()
    if (await memberButton.count()) {
      await memberButton.click()
      await page.waitForTimeout(1200)
      await page.screenshot({ path: path.join(OUT_DIR, 'member-detail.png') })
      // Studio task assign window from the member panel.
      await page.getByTestId('member-task-assign-open').click()
      await expect(page.getByTestId('member-task-assign-dialog')).toBeVisible()
      await page.getByRole('button', { name: /Gece Yolcusu/ }).click()
      await expect(page.getByTestId('member-task-pages')).toBeVisible()
      await page.getByRole('radio', { name: 'Çeviri' }).click()
      await page.getByRole('button', { name: /^Boştakiler/ }).click()
      await page.waitForTimeout(500)
      await page.screenshot({ path: path.join(OUT_DIR, 'member-task-assign.png') })
      await page.getByRole('button', { name: 'İptal' }).click()
      await expect(page.getByTestId('member-task-assign-dialog')).toBeHidden()
      await page.keyboard.press('Escape')
      await page.waitForTimeout(600)
    }

    // Bolum duzenleme penceresi.
    await page.getByTestId('fansub-studio-nav-bolumler').click()
    await page.waitForTimeout(800)
    const editButton = page.getByRole('button', { name: /düzenle$/ }).first()
    if (await editButton.count()) {
      await editButton.click()
      await page.waitForTimeout(1500)
      await page.screenshot({ path: path.join(OUT_DIR, 'chapter-edit-dialog.png') })
      await page.keyboard.press('Escape')
    }
    // Gorevler: haftalik + yolculuklar.
    await page.getByTestId('fansub-studio-nav-gorevler').click()
    await expect(page.getByTestId('studio-weekly-quests')).toBeVisible()
    await expect(page.getByTestId('studio-chain-studyo')).toBeVisible()
    await page.screenshot({ path: path.join(OUT_DIR, 'tasks-full.png'), fullPage: true })

    await page.getByTestId('fansub-studio-nav-duyurular').click()
    await page.waitForTimeout(800)

    // Announcement window: a new announcement from an empty slot.
    const addNotice = page.getByRole('button', { name: /Duyuru ekle/ }).first()
    if (await addNotice.isEnabled()) {
      await addNotice.click()
      await page.getByLabel('Başlık').first().fill('Hafta sonu çift bölüm')
      await page.waitForTimeout(600)
      await page.screenshot({ path: path.join(OUT_DIR, 'notice-dialog.png') })
      await page.keyboard.press('Escape')
    }

    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(`/tr/fansub/${FANSUB_ID}/yonet?e2e=1`)
    await expect(page.getByTestId('studio-overview')).toBeVisible({ timeout: 30_000 })
    await page.waitForTimeout(1200)
    await page.screenshot({ path: path.join(OUT_DIR, 'overview-mobile.png'), fullPage: true })
  })
})
