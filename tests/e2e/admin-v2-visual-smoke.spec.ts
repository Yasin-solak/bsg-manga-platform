import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'

/**
 * Admin panel v2 visual smoke: sidebar (wide / collapsed / search /
 * mobile) and section pages. The session is mocked, the data layer is fed by a network
 * interceptor; not one request or write goes to live.
 */
const OUT_DIR = path.join('test-results', 'admin-v2')
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString()
const json = (body: unknown, headers: Record<string, string> = {}) => ({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(body) })
const headCount = (count: number) => ({ status: 200, contentType: 'application/json', headers: { 'content-range': `0-0/${count}`, 'access-control-expose-headers': 'content-range' }, body: '' })

async function mockAdmin(page: Page) {
  await page.addInitScript(() => {
    window.__BSGMANGA_E2E__ = {
      mockAuthUser: {
        id: 'admin-v2-user',
        authUserId: 'admin-v2-user',
        username: 'site_owner',
        avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=site_owner',
        role: 'admin',
        isBanned: false,
        isActive: true,
        stones: 0,
        ownedItems: { frames: ['default'], backgrounds: [], patterns: [], premium: [] },
        frameType: 'default',
        birthDate: '1998-04-12',
        onboardingCompletedAt: '2026-08-01T09:00:00.000Z',
        premiumExpiresAt: null,
      },
    }
  })
  // Yakala-hepsini ONCE: taklit edilmemis cagri canliya gitmez.
  await page.route('**/rest/v1/**', (route) => route.fulfill(json([])))
  await page.route('**/auth/v1/**', (route) => route.fulfill(json({})))
  await page.route('**/rest/v1/rpc/current_app_role', (route) => route.fulfill(json('admin')))
  await page.route('**/rest/v1/support_requests?*', (route) => (route.request().method() === 'HEAD' ? route.fulfill(headCount(7)) : route.fulfill(json([]))))
  await page.route('**/rest/v1/translation_series_drafts?*', (route) => (route.request().method() === 'HEAD' ? route.fulfill(headCount(3)) : route.fulfill(json([]))))
  await page.route('**/rest/v1/legal_requests?*', (route) => route.fulfill(json([
    { id: 'l1', request_type: 'dmca', status: 'new', priority: 'high', full_name: 'Hak Sahibi', email: 'hak@example.com', target_url: 'https://bsgmanga.com/manga/ornek', description: 'Telif ihlali bildirimi', created_at: daysAgo(0.4), updated_at: daysAgo(0.4) },
    { id: 'l2', request_type: 'copyright', status: 'new', priority: 'normal', full_name: 'Yayinevi', email: 'yayin@example.com', target_url: 'https://bsgmanga.com/manga/ornek-2', description: 'Lisansli seri', created_at: daysAgo(1.2), updated_at: daysAgo(1.2) },
  ])))
}

const UUID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const PAGE = (seed: string) => `https://api.dicebear.com/7.x/shapes/svg?seed=${seed}`

async function mockPendingQueue(page: Page) {
  await page.route('**/rest/v1/mangas?select=id%2Cfansub_id*is_approved=eq.false*', (route) => route.fulfill(json([
    { id: UUID(1), fansub_id: UUID(90), title: 'Gece Yolcusu', slug: 'gece-yolcusu', description: 'Son trenle sehre donen bir yolcunun hikayesi.', author: 'Aoi Tanaka', artist: 'Aoi Tanaka', status: 'ongoing', genres: ['Dram', 'Gizem'], cover_image_url: null, is_approved: false, is_active: true, last_chapter_number: 0, total_views: 0, rating: null, total_ratings: 0, release_date: null, created_at: daysAgo(2.5), updated_at: daysAgo(2.5), fansub: { name: 'Karanlik Koridor' } },
  ])))
  await page.route('**/rest/v1/chapters?select=id%2Cmanga_id*is_approved=eq.false*', (route) => route.fulfill(json([
    { id: UUID(2), manga_id: UUID(3), fansub_id: UUID(90), chapter_number: 18, title: 'Sisli liman', pages: [PAGE('a'), PAGE('b'), PAGE('c'), PAGE('d')], publish_at: null, is_approved: false, is_active: true, created_at: daysAgo(0.3), updated_at: daysAgo(0.3), manga: { title: 'Sis Sehri', slug: 'sis-sehri', cover_image_url: null }, fansub: { name: 'Karanlik Koridor' } },
    { id: UUID(4), manga_id: UUID(3), fansub_id: UUID(90), chapter_number: 19, title: null, pages: [PAGE('e'), PAGE('f')], publish_at: null, is_approved: false, is_active: true, created_at: daysAgo(0.1), updated_at: daysAgo(0.1), manga: { title: 'Sis Sehri', slug: 'sis-sehri', cover_image_url: null }, fansub: { name: 'Karanlik Koridor' } },
  ])))
  await page.route('**/rest/v1/rpc/admin_list_content_revisions', (route) => route.fulfill(json([
    {
      id: UUID(5), target_type: 'manga', target_id: UUID(3), status: 'pending', created_at: daysAgo(1.1), reviewed_at: null, review_note: null,
      before_data: { title: 'Sis Sehri', slug: 'sis-sehri', status: 'ongoing', genres: ['Dram'], description: 'Limanda kaybolan bir kiz.', author: 'Mei', artist: 'Mei', is_mature: false },
      after_data: { title: 'Sis Sehri', slug: 'sis-sehri', status: 'completed', genres: ['Dram', 'Gizem'], description: 'Limanda kaybolan bir kiz ve onu arayan kardesi.', author: 'Mei', artist: 'Mei', is_mature: false },
      meta: { source: 'fansub_panel', note: 'Seri tamamlandi; turler eksikti.' }, requested_by: null, reviewed_by: null, fansub_name: 'Karanlik Koridor',
      manga_id: UUID(3), manga_title: 'Sis Sehri', manga_slug: 'sis-sehri', manga_cover: null, chapter_number: null, restored: false,
    },
  ])))
}

/** Makes the queue longer than the screen (the desk should scroll inside) + fansub applications + info card. */
async function mockPendingExtras(page: Page) {
  await page.route('**/rest/v1/chapters?select=id%2Cmanga_id*is_approved=eq.false*', (route) => route.fulfill(json([
    { id: UUID(2), manga_id: UUID(3), fansub_id: UUID(90), chapter_number: 18, title: 'Sisli liman', pages: [PAGE('a'), PAGE('b'), PAGE('c'), PAGE('d')], publish_at: null, is_approved: false, is_active: true, created_at: daysAgo(0.3), updated_at: daysAgo(0.3), manga: { title: 'Sis Sehri', slug: 'sis-sehri', cover_image_url: null }, fansub: { name: 'Karanlik Koridor' } },
    ...Array.from({ length: 8 }, (_, index) => ({
      id: UUID(30 + index), manga_id: UUID(3), fansub_id: UUID(90), chapter_number: 19 + index, title: null, pages: [PAGE(`p${index}a`), PAGE(`p${index}b`)], publish_at: null, is_approved: false, is_active: true, created_at: daysAgo(0.5 + index * 0.4), updated_at: daysAgo(0.5 + index * 0.4), manga: { title: 'Sis Sehri', slug: 'sis-sehri', cover_image_url: null }, fansub: { name: 'Karanlik Koridor' },
    })),
  ])))
  const request = (n: number, name: string, slug: string, avatar: string | null, username: string, age: number) => ({
    id: UUID(n), requester_user_id: UUID(n + 40), requested_name: name, requested_slug: slug, requested_avatar_url: avatar, requested_description: 'Haftalik duzenli ceviri yapan ekip.', requested_primary_color: '#1d4ed8', requested_secondary_color: '#93c5fd',
    status: 'pending', review_note: null, reviewed_by: null, reviewed_at: null, created_fansub_id: null, is_active: true,
    request_meta: { teamSize: 6, experienceLevel: 'experienced', ageRatingPolicy: 'teen', contentTypes: ['manga', 'webtoon'], weeklyReleaseGoal: 3, dmcaAccepted: true, dmcaAcceptedAt: daysAgo(age) },
    created_at: daysAgo(age), updated_at: daysAgo(age), requester: { id: UUID(n + 40), username, avatar_url: null },
  })
  await page.route('**/rest/v1/fansub_requests?*', (route) => route.fulfill(json([
    request(40, 'Mavi Fener Ceviri', 'mavi-fener-ceviri', 'https://api.dicebear.com/7.x/shapes/svg?seed=mavi-fener', 'okurdeniz', 0.3),
    request(41, 'Gece Kusu Scans', 'gece-kusu-scans', null, 'kuroneko', 1.2),
  ])))
  await mockEntityCard(page)
}

/** Info card (admin_entity_card): fansub / user / series. */
async function mockEntityCard(page: Page) {
  await page.route('**/rest/v1/rpc/admin_entity_card', (route) => {
    const body = (route.request().postDataJSON() ?? {}) as { p_kind?: string }
    if (body.p_kind === 'fansub') return route.fulfill(json({ kind: 'fansub', id: UUID(90), name: 'Karanlik Koridor', slug: 'karanlik-koridor', avatar_url: null, description: 'Gece yarisi yayinlanan gerilim serileri.', is_active: true, is_verified: true, created_at: daysAgo(200), member_count: 4, follower_count: 34, manga_count: 5, chapter_count: 48, last_chapter_at: daysAgo(2), admins: ['site_owner'] }))
    if (body.p_kind === 'user') return route.fulfill(json({ kind: 'user', id: UUID(80), username: 'okurdeniz', display_name: 'Deniz', avatar_url: null, role: 'user', created_at: daysAgo(160), last_login_at: daysAgo(1), is_banned: false, ban_until: null, is_premium: true, fansubs: [{ name: 'Kuzey Panel', slug: 'kuzey-panel', role: 'member' }], comment_count: 12, reports_received: 0, reports_pending: 0, reports_filed: 2 }))
    return route.fulfill(json({ kind: 'manga', id: UUID(3), title: 'Sis Sehri', slug: 'sis-sehri', cover_image_url: null, status: 'ongoing', series_type: 'manga', is_mature: false, is_approved: true, is_active: true, created_at: daysAgo(90), genres: ['Dram', 'Gizem'], total_views: 18425, fansub_name: 'Karanlik Koridor', chapter_count: 17, last_chapter_at: daysAgo(6), follower_count: 230 }))
  })
}

/** Belge kabuktan uzun olmamali: uzarsa yapiskan kenar cubugu en altta yukari itilir. */
async function documentOverflow(page: Page) {
  return page.evaluate(() => {
    const wrapper = document.querySelector('[data-slot="sidebar-wrapper"]')
    return document.documentElement.scrollHeight - Math.ceil(wrapper?.getBoundingClientRect().height ?? 0)
  })
}

async function mockSeriesRequests(page: Page) {
  await page.route('**/rest/v1/translation_series_drafts?select=*', (route) => route.fulfill(json([
    { id: UUID(11), fansub_id: UUID(90), title: 'Sis Şehri', original_title: 'Kiri no Machi', source_language: 'ja', genres: ['Dram', 'Gizem'], cover_object_key: null, created_at: daysAgo(1.5), is_mature: false, fansubs: { name: 'Karanlik Koridor' }, translation_projects: [{ chapter_number: 1 }, { chapter_number: 2 }] },
    { id: UUID(12), fansub_id: UUID(91), title: 'Ay Işığı Kafesi', original_title: 'Gekkou no Ori', source_language: 'ja', genres: ['Romantik', 'Fantastik', 'Okul'], cover_object_key: null, created_at: daysAgo(0.4), is_mature: true, fansubs: { name: 'Gece Kuslari' }, translation_projects: [{ chapter_number: 1 }] },
  ])))
  await page.route('**/rest/v1/mangas?select=id%2Ctitle%2Cslug%2Ccover_image_url%2Cgenres%2Coriginal_lang*', (route) => {
    const url = decodeURIComponent(route.request().url())
    const rows = url.includes('Sis') || url.includes('Kiri')
      ? [{ id: UUID(3), title: 'Sis Sehri', slug: 'sis-sehri', cover_image_url: null, genres: ['Dram'], original_lang: 'ja', fansub_id: UUID(90), is_mature: false }]
      : []
    return route.fulfill(json(rows))
  })
}

async function mockSupport(page: Page) {
  const OWNER = '99999999-9999-4999-8999-999999999999'
  const rows = [
    { id: UUID(21), user_id: OWNER, subject: 'Bolum sayfalari yuklenmiyor', message: 'Sis Sehri 18. bolumde 4. sayfadan sonrasi bos geliyor, telefondan da denedim.', category: 'technical', status: 'open', admin_response: null, created_at: daysAgo(0.2), responded_at: null, technical: null, account_context: null, support_attachments: [{ request_id: UUID(21) }] },
    { id: UUID(22), user_id: OWNER, subject: 'Coin satin aldim ama hesaba gecmedi', message: 'Dun aksam 500 coin paketi aldim, odeme cekildi ama bakiyem ayni.', category: 'payment', status: 'open', admin_response: null, created_at: daysAgo(0.9), responded_at: null, technical: null, account_context: null, support_attachments: [] },
    { id: UUID(23), user_id: OWNER, subject: 'Kullanici adimi degistirmek istiyorum', message: 'Kayit olurken yanlis yazmisim, degistirebilir miyim?', category: 'account', status: 'open', admin_response: null, created_at: daysAgo(2.5), responded_at: null, technical: null, account_context: null, support_attachments: [] },
  ]
  await page.route('**/rest/v1/support_requests?*', (route) => {
    const url = route.request().url()
    if (route.request().method() === 'HEAD') {
      const count = url.includes('status=eq.open') ? 4 : url.includes('status=eq.answered') ? 12 : 3
      return route.fulfill(headCount(count))
    }
    return route.fulfill(json(rows, { 'content-range': `0-${rows.length - 1}/${rows.length}`, 'access-control-expose-headers': 'content-range' }))
  })
  await page.route('**/rest/v1/rpc/admin_support_identities', (route) => route.fulfill(json([{ user_id: OWNER, username: 'okur_mira' }])))
}

/** Community v2 (community_v2_admin): 4 servers (fansub, room, long-named room, archive), 2 open reports, 1 resolved. */
async function mockCommunity(page: Page) {
  const person = (n: number, username: string) => ({ id: UUID(n), username, avatar_url: null })
  const serverRow = (n: number, name: string, extra: Record<string, unknown> = {}) => ({
    id: UUID(n), name, avatar_url: null, join_mode: 'open', kind: 'room', archived_at: null, created_at: daysAgo(40), fansub: null,
    owner: person(80, 'okurdeniz'), members_active: 12, members_banned: 0, channels: 3, messages_7d: 48, last_message_at: daysAgo(0.1), reports_open: 0, ...extra,
  })
  const servers = [
    serverRow(601, 'Karanlik Koridor', { kind: 'fansub', fansub: { id: UUID(90), name: 'Karanlik Koridor', slug: 'karanlik-koridor' }, members_active: 19, messages_7d: 41, reports_open: 2 }),
    serverRow(602, 'Gece Okurlari', { members_active: 7, messages_7d: 120, last_message_at: daysAgo(0.02) }),
    serverRow(603, 'cokuzunsunucuadi'.repeat(6), { members_active: 3, messages_7d: 2, last_message_at: daysAgo(9) }),
    serverRow(604, 'Eski Okuma Kulubu', { archived_at: daysAgo(12), members_active: 4, messages_7d: 0, last_message_at: daysAgo(60) }),
  ]
  const detail = (row: (typeof servers)[number]) => ({
    id: row.id, name: row.name, description: 'Yeni bolum duyurulari, teoriler ve sohbet.', rules: null, avatar_url: null, banner_url: null,
    join_mode: row.join_mode, archived_at: row.archived_at, created_at: row.created_at, version: 3, kind: row.kind,
    fansub: row.fansub ? { ...row.fansub, is_active: true } : null, owner: row.owner,
    members: { active: row.members_active, timeout: 1, banned: 1, left: 2 }, messages_total: 900, messages_7d: row.messages_7d,
    storage_bytes: 7_340_032, invites_active: 2, join_requests: 0, reports_open: row.reports_open,
    channels: [
      { id: UUID(701), name: 'genel', category: 'Sohbet', topic: null, is_private: false, archived_at: null, slowmode_seconds: 0, series: null, messages: 640, last_message_at: daysAgo(0.1) },
      { id: UUID(702), name: 'sis-sehri', category: 'Seriler', topic: null, is_private: false, archived_at: null, slowmode_seconds: 30, series: { id: UUID(3), title: 'Sis Sehri', slug: 'sis-sehri' }, messages: 220, last_message_at: daysAgo(0.4) },
      { id: UUID(703), name: 'ekip', category: 'Seriler', topic: null, is_private: true, archived_at: null, slowmode_seconds: 0, series: null, messages: 40, last_message_at: daysAgo(3) },
    ],
    roles: [
      { id: UUID(711), name: '@everyone', color: '#94a3b8', position: 0, is_default: true, permissions: 4, members: row.members_active },
      { id: UUID(712), name: 'Moderator', color: '#f59e0b', position: 2, is_default: false, permissions: 9, members: 2 },
    ],
    audit: [
      { id: 3, action: 'member.timeout', created_at: daysAgo(0.5), details: { site_admin: true, label: 'kuroneko', minutes: 60 }, actor_username: 'site_owner', site_admin: true },
      { id: 2, action: 'report.resolved', created_at: daysAgo(2), details: {}, actor_username: 'okurdeniz', site_admin: false },
      { id: 1, action: 'server.automatic', created_at: daysAgo(40), details: {}, actor_username: null, site_admin: false },
    ],
  })
  const members = [
    { user_id: UUID(80), username: 'okurdeniz', display_name: 'Deniz', avatar_url: null, nickname: null, state: 'active', joined_at: daysAgo(40), timeout_until: null, last_message_at: daysAgo(0.1), is_owner: true, roles: [{ name: 'Moderator', color: '#f59e0b' }] },
    { user_id: UUID(81), username: 'kuroneko', display_name: null, avatar_url: null, nickname: null, state: 'active', joined_at: daysAgo(20), timeout_until: new Date(Date.now() + 3_600_000).toISOString(), last_message_at: daysAgo(0.6), is_owner: false, roles: [] },
    { user_id: UUID(82), username: 'mira', display_name: 'Mira', avatar_url: null, nickname: null, state: 'active', joined_at: daysAgo(10), timeout_until: null, last_message_at: daysAgo(1), is_owner: false, roles: [] },
  ]
  const report = (n: number, status: string, body: string, extra: Record<string, unknown> = {}) => ({
    id: UUID(n), reason: 'spam', note: null, status, version: 1, created_at: daysAgo((n - 800) / 10), reviewed_at: null, resolution_note: null, reviewer_username: null,
    server: { id: UUID(601), name: 'Karanlik Koridor', avatar_url: null }, channel: { id: UUID(701), name: 'genel' }, reporter: person(82, 'mira'),
    message: { id: UUID(n + 100), body, created_at: daysAgo((n - 800) / 10 + 0.01), edited_at: null, deleted_at: null, attachments: 0, author: { ...person(81, 'kuroneko'), display_name: null }, author_state: { state: 'active', timeout_until: null, is_owner: false }, reports_on_message: 1 },
    ...extra,
  })
  const spam = report(801, 'open', 'Bedava 5000 coin icin hemen tikla https://bedava-coin.example.com/kampanya', { note: 'Ayni mesaji uc kanala atti.' })
  spam.message.reports_on_message = 3
  const reports = [
    spam,
    report(802, 'open', 'oha'.repeat(120), { reason: 'harassment' }),
    report(803, 'resolved', 'Eski reklam mesaji', { reviewed_at: daysAgo(1), reviewer_username: 'okurdeniz', resolution_note: 'Mesaj kaldirildi.' }),
  ]

  await page.route('**/rest/v1/rpc/community_v2_admin', (route) => {
    const body = (route.request().postDataJSON() ?? {}) as { p_action?: string, p_payload?: Record<string, unknown> }
    const payload = body.p_payload ?? {}
    if (body.p_action === 'overview') return route.fulfill(json({ enabled: false, servers: 4, fansub_servers: 1, rooms: 3, archived: 1, members_active: 42, messages_7d: 211, reports_open: 2, queued: 0 }))
    if (body.p_action === 'servers') {
      const kind = payload.kind as string
      const rows = servers.filter((row) => (kind === 'archived' ? row.archived_at : kind === 'fansub' ? row.kind === 'fansub' : kind === 'room' ? row.kind === 'room' && !row.archived_at : true))
      return route.fulfill(json({ total: rows.length, rows }))
    }
    if (body.p_action === 'server') return route.fulfill(json(detail(servers.find((row) => row.id === payload.server_id) ?? servers[0])))
    if (body.p_action === 'members') return route.fulfill(json({ total: members.length, rows: members }))
    if (body.p_action === 'reports') {
      const rows = reports.filter((row) => row.status === payload.status)
      return route.fulfill(json({ total: rows.length, counts: { open: 2, resolved: 1, dismissed: 0 }, rows }))
    }
    return route.fulfill(json(null))
  })
  await page.route('**/rest/v1/rpc/community_v2_operations', (route) => route.fulfill(json({
    enabled: false,
    config: { rooms_per_owner: 3, members_per_server: 5000, storage_bytes_per_server: 524_288_000, joins_per_minute: 30, audit_days: 180, report_days: 90, expired_invite_days: 30, version: 2 },
    jobs: [
      { job: 'notifications', last_success_at: daysAgo(1), last_failure_at: null, error_code: null, processed: 0, duration_ms: 12 },
      { job: 'maintenance', last_success_at: new Date().toISOString(), last_failure_at: null, error_code: null, processed: 4, duration_ms: 40 },
    ],
    queued: 0, oldest_queued_at: null, pending_reports: 2, servers: 4,
  })))
}

/** Yorumlar: 3 riskli (hakaret + 3 yanit, baglanti + spam, spoiler), kirilmayan metinli yanit, 22 normal, 1 kaldirilan. */
async function mockComments(page: Page) {
  const row = (n: number, extra: Record<string, unknown>) => ({
    id: UUID(n), source: 'manga', entityId: UUID(3), mangaId: UUID(3) as string | null, routeHint: `/manga/${UUID(3)}`,
    contextTitle: 'Sis Sehri', contextSubtitle: 'Manga yorumu', authorUserId: UUID(80), authorUsername: 'okurdeniz',
    authorAvatarUrl: null, activeFansubIdentityTag: null, parentId: null as string | null, body: 'Guzel bolumdu', isSpoiler: false, isActive: true,
    isPinned: false, likesCount: n % 5, dislikesCount: 0, createdAt: daysAgo((n - 600) / 20), updatedAt: daysAgo((n - 600) / 20),
    signals: [] as string[], replyCount: 0, authorRemovedCount: 0, ...extra,
  })
  const rows = [
    row(601, { body: 'Sen tam bir gerizekalisin, ceviriyi de berbat etmissiniz', signals: ['abuse'], authorUsername: 'kuroneko', replyCount: 3, authorRemovedCount: 2 }),
    row(602, { source: 'chapter', mangaId: UUID(3), contextTitle: 'Sis Sehri', contextSubtitle: 'Bolum 18 - Sisli liman', routeHint: `/manga/${UUID(3)}/bolum/18`, body: 'Bedava coin icin kanala gel https://t.me/ornek', signals: ['links', 'spam'] }),
    row(603, { source: 'manga', mangaId: UUID(3), contextTitle: 'Sis Sehri', contextSubtitle: 'Manga yorumu', body: '||kardesi yasiyor|| bence', isSpoiler: true, signals: ['spoiler'] }),
    row(604, { source: 'list', contextTitle: 'Hafta sonu listem', contextSubtitle: 'Liste yorumu', routeHint: `/listeler/${UUID(700)}`, body: 'oha'.repeat(60), parentId: UUID(601) }),
    ...Array.from({ length: 22 }, (_, index) => row(610 + index, { body: `Guzel bolumdu, emeginize saglik #${index + 1}` })),
    row(640, { isActive: false, body: 'Kaldirilmis eski yorum', signals: ['abuse'] }),
  ]
  await page.route('**/rest/v1/rpc/admin_list_moderation_comments', (route) => {
    const body = route.request().postDataJSON() as { p_source: string, p_status: string, p_signal: string, p_search: string | null, p_limit: number, p_offset: number }
    const needle = (body.p_search || '').toLowerCase()
    const searched = rows.filter((item) => !needle || `${item.body} ${item.authorUsername} ${item.contextTitle}`.toLowerCase().includes(needle))
    const filtered = searched.filter((item) => (
      (body.p_status === 'all' || (body.p_status === 'active') === item.isActive)
      && (body.p_signal === 'all' || (body.p_signal === 'flagged' ? item.signals.length > 0 : item.signals.includes(body.p_signal)))
    ))
    const scoped = filtered.filter((item) => body.p_source === 'all' || item.source === body.p_source)
    const counted = searched.filter((item) => body.p_source === 'all' || item.source === body.p_source)
    const bySource = (source: string) => filtered.filter((item) => item.source === source).length
    return route.fulfill(json({
      rows: scoped.slice(body.p_offset, body.p_offset + body.p_limit),
      total: scoped.length,
      sources: { all: filtered.length, chapter: bySource('chapter'), manga: bySource('manga'), list: bySource('list') },
      counts: { active: counted.filter((item) => item.isActive).length, removed: counted.filter((item) => !item.isActive).length, flagged: counted.filter((item) => item.isActive && item.signals.length > 0).length },
    }))
  })
}

/** Lists: 20 lists (1 empty + coverless, 1 private), an inactive manga and a removed comment in the first list. */
async function mockLists(page: Page) {
  const owner = (username: string) => ({ id: UUID(800 + username.length), username, avatar_url: null })
  const listRow = (n: number, extra: Record<string, unknown>) => ({
    id: UUID(n), owner_id: UUID(809), title: `Liste ${n}`, description: 'Hafta sonu okunacaklar', is_public: true, cover_manga_id: UUID(3) as string | null,
    items_count: 2, ratings_count: 2, rating_avg: 4.5, comments_count: 0, created_at: daysAgo((n - 700) * 3), updated_at: daysAgo(n - 700),
    owner: owner('okurdeniz'), cover_manga: { id: UUID(3), title: 'Sis Sehri', slug: 'sis-sehri', cover_image_url: PAGE('kapak') } as Record<string, unknown> | null, ...extra,
  })
  const rows = [
    listRow(701, { title: 'Hafta sonu okunacaklar', items_count: 3, comments_count: 3 }),
    listRow(702, { title: 'Bos kalan liste', items_count: 0, cover_manga_id: null, cover_manga: null, description: '' }),
    listRow(703, { title: 'Gizli favorilerim', is_public: false, owner: owner('kuroneko') }),
    ...Array.from({ length: 17 }, (_, index) => listRow(710 + index, { title: `Okuma listesi #${index + 1}` })),
  ]
  await page.route('**/rest/v1/rpc/get_admin_list_control_overview', (route) => route.fulfill(json({
    generatedAt: new Date().toISOString(), total: 20, publicLists: 19, privateLists: 1, emptyLists: 1, withoutCover: 1, owners: 2, itemsTotal: 40,
    commentsTotal: 3, commentsInactive: 1, commentsSpoiler: 0, listsWithInactiveComments: 1, ratingsTotal: 40, ratingAverage: 4.5, counterDrift: 1,
    newListsCurrent: 3, newListsPrevious: 2, newListsDelta: 1, newListsDeltaPercent: 50,
  })))
  await page.route('**/rest/v1/rpc/get_admin_list_control_view_page', (route) => {
    const body = route.request().postDataJSON() as { p_view: string }
    const ids = body.p_view === 'empty' ? [UUID(702)] : [UUID(701)]
    return route.fulfill(json({ ids, total: ids.length }))
  })
  await page.route('**/rest/v1/user_manga_lists?*', (route) => {
    const url = decodeURIComponent(route.request().url())
    const single = url.match(/[?&]id=eq\.([0-9a-f-]{36})/)
    if (single) return route.fulfill(json(rows.filter((row) => row.id === single[1])))
    const inList = url.match(/id=in\.\(([^)]*)\)/)
    let result = inList ? rows.filter((row) => inList[1].split(',').includes(row.id)) : rows
    if (url.includes('is_public=eq.false')) result = result.filter((row) => !row.is_public)
    if (url.includes('cover_manga_id=is.null')) result = result.filter((row) => !row.cover_manga_id)
    const offset = Number(url.match(/offset=(\d+)/)?.[1] ?? 0)
    const limit = Number(url.match(/limit=(\d+)/)?.[1] ?? result.length)
    const pageRows = inList ? result : result.slice(offset, offset + limit)
    return route.fulfill(json(pageRows, { 'content-range': `${offset}-${offset + pageRows.length - 1}/${result.length}`, 'access-control-expose-headers': 'content-range' }))
  })
  const manga = (n: number, title: string, active = true) => ({ id: UUID(n), title, slug: null, cover_image_url: PAGE(title), is_active: active, is_approved: true })
  await page.route('**/rest/v1/user_manga_list_items?*', (route) => {
    const url = decodeURIComponent(route.request().url())
    if (!url.includes(UUID(701))) {
      return route.fulfill(json(url.includes(UUID(702)) ? [] : [
        { id: UUID(901), list_id: UUID(710), manga_id: UUID(3), position: 1, note: null, created_at: daysAgo(4), updated_at: daysAgo(4), manga: manga(3, 'Sis Sehri') },
      ]))
    }
    return route.fulfill(json([
      { id: UUID(911), list_id: UUID(701), manga_id: UUID(3), position: 1, note: 'Mutlaka okunmali', created_at: daysAgo(5), updated_at: daysAgo(5), manga: manga(3, 'Sis Sehri') },
      { id: UUID(912), list_id: UUID(701), manga_id: UUID(4), position: 2, note: null, created_at: daysAgo(5), updated_at: daysAgo(5), manga: manga(4, 'Gece Yolcusu', false) },
      { id: UUID(913), list_id: UUID(701), manga_id: UUID(5), position: 3, note: null, created_at: daysAgo(5), updated_at: daysAgo(5), manga: manga(5, 'Kayip Akademi') },
    ]))
  })
  await page.route('**/rest/v1/user_manga_list_comments?*', (route) => {
    const url = decodeURIComponent(route.request().url())
    if (!url.includes(UUID(701))) return route.fulfill(json([]))
    const comment = (n: number, extra: Record<string, unknown>) => ({
      id: UUID(n), list_id: UUID(701), author_id: UUID(80), parent_id: null as string | null, body: 'Guzel liste', is_active: true, likes_count: 1, dislikes_count: 0,
      created_at: daysAgo(n - 920), updated_at: daysAgo(n - 920), author: { id: UUID(80), username: 'okurdeniz', avatar_url: null }, ...extra,
    })
    return route.fulfill(json([
      comment(921, { body: 'Bu listeyi kim yapti, berbat bir secim aptal' }),
      comment(922, { body: 'Bence de, ilk iki seri cok iyi', parent_id: UUID(921), author: { id: UUID(81), username: 'kuroneko', avatar_url: null } }),
      comment(923, { body: 'Kaldirilmis eski yorum', is_active: false }),
    ]))
  })
}

/** Mangas: 26 series (2 awaiting approval, 1 inactive, 1 no cover / description, 1 very long named), chapter and follower counts. */
async function mockMangas(page: Page) {
  const fansub = { id: UUID(90), name: 'Karanlik Koridor', slug: 'karanlik-koridor' }
  const manga = (n: number, extra: Record<string, unknown> = {}) => ({
    id: UUID(n), fansub_id: UUID(90), title: `Seri ${n - 900}`, slug: `seri-${n - 900}`,
    cover_image_url: `https://api.dicebear.com/7.x/shapes/svg?seed=kapak-${n}`, description: 'Liman kentinde gecen gizem.',
    status: 'ongoing', is_approved: true, is_active: true, is_new: false, total_views: 1000 + n * 7, total_ratings: n % 40, rating: 4.2,
    genres: ['Dram', 'Gizem'], series_type: 'manga', is_mature: false, last_chapter_number: 12, created_at: daysAgo((n - 900) * 3), updated_at: daysAgo((n - 900) / 4),
    fansub, ...extra,
  })
  const rows = [
    manga(901, { title: 'Sis Sehri', slug: 'sis-sehri', is_approved: false, created_at: daysAgo(0.4), updated_at: daysAgo(0.1), last_chapter_number: null }),
    manga(902, { title: 'Kizil Esik', is_approved: false, cover_image_url: null, description: '', genres: [], series_type: 'manhwa' }),
    manga(903, { title: 'Golgelerin Muhru', is_active: false, status: 'hiatus' }),
    manga(904, { title: 'cokuzunseriadi'.repeat(8), is_mature: true, status: 'completed' }),
    ...Array.from({ length: 22 }, (_, index) => manga(905 + index)),
  ]
  await page.route('**/rest/v1/rpc/get_admin_manga_control_overview', (route) => route.fulfill(json({
    generatedAt: new Date().toISOString(), total: 26, approved: 24, pending: 2, inactive: 1, withoutFansub: 0, withoutChapters: 1,
    incompleteMeta: 1, pendingChapterSeries: 3, chaptersTotal: 310, chaptersPending: 4, chaptersScheduled: 2, chaptersWithoutFansub: 0,
    newMangasCurrent: 3, newMangasPrevious: 1, newMangasDelta: 2, newMangasDeltaPercent: 200,
  })))
  await page.route('**/rest/v1/mangas?*', (route) => {
    if (!decodeURIComponent(route.request().url()).includes('fansub:fansub_id')) return route.fallback()
    return route.fulfill(json(rows.slice(0, 20), { 'content-range': `0-19/${rows.length}`, 'access-control-expose-headers': 'content-range' }))
  })
  await page.route('**/rest/v1/chapters?*', (route) => {
    if (!decodeURIComponent(route.request().url()).includes('select=manga_id,is_approved,is_active')) return route.fallback()
    return route.fulfill(json(rows.flatMap((row, index) => Array.from({ length: index === 0 ? 0 : 4 }, (_, k) => ({ manga_id: row.id, is_approved: !(index === 2 && k === 0), is_active: true })))))
  })
  await page.route('**/rest/v1/manga_follows?*', (route) => route.fulfill(json(rows.slice(0, 6).flatMap((row, index) => Array.from({ length: 6 - index }, () => ({ manga_id: row.id }))))))
}

/** Fansubs: 23 teams (1 inactive, 1 awaiting correction, 1 very long named); the first team has a community server. */
async function mockFansubs(page: Page) {
  const fansub = (n: number, extra: Record<string, unknown> = {}) => ({
    id: UUID(n), name: `Ekip ${n - 1100}`, slug: `ekip-${n - 1100}`, avatarUrl: `https://api.dicebear.com/7.x/shapes/svg?seed=ekip-${n}`,
    description: 'Gerilim ve gizem serileri ceviren ekip.', isActive: true, mangaCount: n % 9, followerCount: 30 + n % 70, coinBalance: 1200 + n,
    createdAt: daysAgo((n - 1100) * 9), updatedAt: daysAgo(1), memberCount: 4 + n % 6, moderatorCount: 1, manager: { id: UUID(80), username: 'okurdeniz' },
    lastActivityAt: daysAgo((n - 1100) / 3), pendingReviewCount: 0, isVerified: false, trust: null, boostLevel: null, ...extra,
  })
  const rows = [
    fansub(1101, { name: 'Karanlik Koridor', slug: 'karanlik-koridor', isVerified: true, boostLevel: 2, lastActivityAt: daysAgo(0.05) }),
    fansub(1102, { name: 'Kuzey Panel', pendingReviewCount: 2 }),
    fansub(1103, { name: 'Eski Ekip', isActive: false }),
    fansub(1104, { name: 'cokuzunekipadi'.repeat(8) }),
    ...Array.from({ length: 19 }, (_, index) => fansub(1105 + index)),
  ]
  await page.route('**/rest/v1/rpc/get_admin_fansub_management_overview', (route) => route.fulfill(json({
    total: 23, active: 22, moderated: 20, verified: 1, pendingReview: 1, newFansubs: 2, verificationAvailable: true, trustAvailable: false,
  })))
  await page.route('**/rest/v1/rpc/list_admin_fansub_management_page', (route) => {
    const body = (route.request().postDataJSON() ?? {}) as { p_page?: number, p_view?: string }
    const filtered = rows.filter((row) => body.p_view === 'inactive' ? !row.isActive : body.p_view === 'active' ? row.isActive : true)
    const pageNo = body.p_page ?? 1
    return route.fulfill(json({ data: filtered.slice((pageNo - 1) * 20, pageNo * 20), count: filtered.length, page: pageNo, limit: 20 }))
  })
  await page.route('**/rest/v1/rpc/community_v2_admin', (route) => {
    const body = (route.request().postDataJSON() ?? {}) as { p_action?: string, p_payload?: { fansub_id?: string } }
    if (body.p_action !== 'fansub_server') return route.fallback()
    if (body.p_payload?.fansub_id !== UUID(1101)) return route.fulfill(json(null))
    return route.fulfill(json({
      id: UUID(601), name: 'Karanlik Koridor', join_mode: 'open', archived_at: null, created_at: daysAgo(40), members_active: 19, members_timeout: 1,
      members_banned: 1, channels: 3, messages_7d: 41, last_message_at: daysAgo(0.1), reports_open: 2, join_requests: 0,
    }))
  })
}

/** Magaza: 27 urun (1 sorunlu, 2 taslak, 1 arsiv, 1 paket), 23 siparis (1 iade). */
async function mockShop(page: Page) {
  const grant = (n: number) => ({ id: UUID(1300 + n), type: 'frame', identifier: `cerceve-${n}`, name: `Cerceve ${n}`, imageKey: null, assetUrl: null, posterUrl: null })
  const product = (n: number, extra: Record<string, unknown> = {}) => ({
    id: UUID(1200 + n), slug: `urun-${n}`, kind: 'cosmetic', type: 'frame', title: `Gece Cercevesi ${n}`, subtitle: null,
    description: 'Ay isiginda parlayan ince bir cerceve.', rarity: ['common', 'rare', 'epic', 'legendary'][n % 4], basePrice: 400 + n * 25,
    status: 'published', state: 'live', availableFrom: null, availableUntil: null, audience: 'everyone', stockLimit: null, soldCount: n % 5,
    seasonId: null, seasonName: null, cover: null, hero: null, premiumDays: null, bundleMode: 'proportional', giftable: true, hideUntilLaunch: false,
    tags: [], sortWeight: 0, updatedAt: daysAgo(n / 4), createdAt: daysAgo(n * 2), grants: [grant(n)], orders: n % 5, revenue: (n % 5) * 400,
    campaigns: [], issues: [], ...extra,
  })
  const products = [
    product(1, { title: 'Kuzey Isigi', seasonId: UUID(1401), seasonName: 'Kis Sezonu', campaigns: [{ id: UUID(1402), name: 'Kis Lansmani', status: 'published' }], stockLimit: 50, soldCount: 12 }),
    product(2, { title: 'Eksik Gorselli Cerceve', issues: [{ code: 'no_image', level: 'error' }, { code: 'short_description', level: 'warn' }] }),
    product(3, { status: 'draft', state: 'draft', title: 'Taslak Cerceve' }),
    product(4, { status: 'draft', state: 'draft' }),
    product(5, { kind: 'bundle', type: 'bundle', title: 'Gece Paketi', grants: [grant(5), grant(6), grant(7)] }),
    product(6, { state: 'upcoming', availableFrom: daysAgo(-3) }),
    product(7, { title: 'cokuzunurunadi'.repeat(8) }),
    ...Array.from({ length: 19 }, (_, index) => product(8 + index)),
  ]
  const archived = [product(40, { status: 'archived', state: 'archived', title: 'Eski Cerceve' })]
  const settings = { purchases_enabled: true, daily_deal_enabled: false, daily_deal_percent: 20, daily_deal_min_rarity: 'rare', rarity_bands: { common: [100, 600], rare: [400, 1200], epic: [900, 2400], legendary: [2000, 6000] }, refund_window_hours: 48, updated_at: daysAgo(3) }
  await page.route('**/rest/v1/rpc/shop_admin_merch', (route) => route.fulfill(json({
    seasons: [{ id: UUID(1401), slug: 'kis', name: 'Kis Sezonu', tagline: null, description: null, accent: null, banner: null, bannerMobile: null, startsAt: daysAgo(10), endsAt: daysAgo(-50), status: 'published', state: 'live', productCount: 1 }],
    campaigns: [], discounts: [], dailyDeals: [], settings,
  })))
  await page.route('**/rest/v1/rpc/shop_admin_products', (route) => {
    const body = (route.request().postDataJSON() ?? {}) as { p_filter?: string }
    return route.fulfill(json(body.p_filter === 'archived' ? archived : products))
  })
  const person = (n: number) => ({ id: UUID(1500 + n), username: `okur${n}`, avatar: `https://api.dicebear.com/7.x/thumbs/svg?seed=okur${n}` })
  const order = (n: number, extra: Record<string, unknown> = {}) => ({
    id: UUID(1600 + n), code: `MZ-${String(4100 + n)}`, title: `Gece Cercevesi ${n}`, kind: 'cosmetic', productId: UUID(1200 + n), listPrice: 500, paid: 500,
    source: 'list', isGift: false, message: null, status: 'completed', createdAt: daysAgo(n / 2), refundedAt: null, refundReason: null,
    granted: [{ id: UUID(1700 + n), type: 'frame', identifier: `cerceve-${n}` }], premiumDays: null, buyer: person(n), recipient: person(n), ...extra,
  })
  const orders = [
    order(1, { isGift: true, recipient: person(90), message: 'Dogum gunun kutlu olsun!', source: 'discount', paid: 400 }),
    order(2, { status: 'refunded', refundedAt: daysAgo(0.5), refundReason: 'Yanlislikla alindi.' }),
    order(3, { title: 'Premium 30 gun', kind: 'premium', granted: [], premiumDays: 30, paid: 3000, listPrice: 3000 }),
    ...Array.from({ length: 20 }, (_, index) => order(4 + index)),
  ]
  await page.route('**/rest/v1/rpc/shop_admin_orders', (route) => {
    const body = (route.request().postDataJSON() ?? {}) as { p_status?: string | null }
    return route.fulfill(json(orders.filter((row) => !body.p_status || row.status === body.p_status)))
  })
}

/** Oduller: 3 siralama kurali, 3 goruntulenme kademesi, 12 fansub on izlemesi, 2 gecmis dagitim. */
async function mockRewards(page: Page) {
  const stamp = daysAgo(30)
  await page.route('**/rest/v1/fansub_reward_rank_rules?*', (route) => route.fulfill(json([1, 2, 3].map((n) => ({ id: UUID(1800 + n), rank_position: n, coin_reward: 30000 - n * 8000, is_active: true, created_at: stamp, updated_at: stamp })))))
  await page.route('**/rest/v1/fansub_reward_view_tiers?*', (route) => route.fulfill(json([[1, 'Bronz', 50000, 5000], [2, 'Gumus', 150000, 12000], [3, 'Altin', 400000, 25000]].map(([n, label, min, coin]) => ({ id: UUID(1810 + Number(n)), label, min_views: min, coin_reward: coin, is_active: true, created_at: stamp, updated_at: stamp })))))
  const lastMonth = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1)
  const ym = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`
  const twoAgo = new Date(lastMonth.getFullYear(), lastMonth.getMonth() - 1, 1)
  await page.route('**/rest/v1/fansub_monthly_reward_runs?*', (route) => route.fulfill(json([
    { id: UUID(1820), month_start: ym(twoAgo), status: 'completed', started_at: daysAgo(30), completed_at: daysAgo(30), run_by: null, total_fansubs: 5, total_coin: 84000, created_at: daysAgo(30), updated_at: daysAgo(30) },
  ])))
  await page.route('**/rest/v1/rpc/get_fansub_monthly_reward_preview', (route) => route.fulfill(json(Array.from({ length: 12 }, (_, index) => ({
    fansub_id: UUID(1830 + index), fansub_name: index === 2 ? 'cokuzunfansubadi'.repeat(6) : `Ekip ${index + 1}`, total_views: 500000 - index * 38000,
    rank_position: index < 3 ? index + 1 : null, rank_coin_reward: index < 3 ? 30000 - (index + 1) * 8000 : 0,
    tier_coin_reward: index < 4 ? 25000 : index < 8 ? 12000 : 5000, total_coin_reward: (index < 3 ? 30000 - (index + 1) * 8000 : 0) + (index < 4 ? 25000 : index < 8 ? 12000 : 5000),
    tier_labels: [index < 4 ? 'Altin' : index < 8 ? 'Gumus' : 'Bronz'],
  })))))
}

/** Boost: 6 perks, 4 levels, 8 teams; system on, donations off. */
async function mockBoost(page: Page) {
  const caps = [
    ['hasAnalytics', 'İstatistik paneli', 'Stüdyo', 'tier', 1, 12, 9],
    ['canUsePolls', 'Anketler', 'Topluluk', 'tier', 1, 12, 4],
    ['hasChapterEndCredit', 'Bölüm sonu şeridi', 'Okuyucu', 'tier', 2, 6, 3],
    ['canUploadVideoBackground', 'Video arka plan', 'Fansub sayfası', 'tier', 3, 2, 1],
    ['hasVanityUrl', 'Özel adres', 'Fansub sayfası', 'tier', 2, 6, 2],
    ['hasSupporterStreak', 'Destekçi serisi', 'Profil', 'core', null, 40, 40],
  ] as const
  await page.route('**/rest/v1/rpc/get_admin_boost_control_center', (route) => route.fulfill(json({
    generatedAt: daysAgo(0.01),
    policy: { tierThresholds: [3, 6, 12], foundingLimit: 10, streakGraceDays: 3 },
    capabilityPolicies: caps.map(([key, label, where, type, level, eligible, live], index) => ({ capabilityKey: key, label, summary: label, detail: `${label} açıklaması`, where, surfaceGroup: 'genel', placementType: type, tierLevel: level, sortOrder: index, eligibleFansubCount: eligible, liveFansubCount: live })),
    overview: { totalFansubCount: 40, boostedFansubCount: 12, totalActivePower: 96, uniqueActiveSupporterCount: 71, activeGrantCount: 96, grantCount30d: 54, grantedPower30d: 54, donationCount30d: 0, donationAmount30d: 0, activeFoundingSupporterCount: 22, activeStreakSupporterCount: 9, repeatSupporterCount: 17 },
    tiers: [0, 1, 2, 3].map((level) => ({ tierLevel: level, tierLabel: level ? `S${level}` : 'Core', fansubCount: [28, 6, 4, 2][level], totalPower: [0, 24, 30, 42][level], totalSupporters: [0, 20, 25, 26][level] })),
    surfaces: [],
    topFansubs: Array.from({ length: 8 }, (_, index) => ({ fansubId: UUID(1900 + index), name: index === 1 ? 'cokuzunekipadi'.repeat(6) : `Ekip ${index + 1}`, slug: `ekip-${index}`, tierLevel: index < 2 ? 3 : index < 5 ? 2 : 1, activePower: 20 - index * 2, activeSupporterCount: 15 - index, lastGrantAt: daysAgo(index / 2) })),
    health: { expiringGrantCount7d: 5, staleSnapshotCount: 0, missingRewardStateCount: 1, chapterCreditEnabledCount: 3, specialNotificationCount30d: 7, activeVanityCount: 2, lastGrantAt: daysAgo(0.2), lastDonationAt: null },
  })))
  await page.route('**/rest/v1/feature_flags?*', (route) => route.fulfill(json([
    ['boost.system', 'Takviye sistemi', true], ['economy.fansub_donations', 'Fansub bağışı', false], ['boost.fansub_manage_tab', 'Stüdyo sekmesi', true],
  ].map(([key, label, on], index) => ({ id: UUID(1950 + index), key, label, description: '', is_enabled: on, rollout_percent: 100, is_public: false, metadata: {}, updated_by: null, updated_at: daysAgo(3), created_at: daysAgo(30) })))))
}

/** Emoji and stickers: 7 expressions (1 archived), 3 teams. */
async function mockSupporterAssets(page: Page) {
  const actor = (n: number) => ({ userId: UUID(2000 + n), username: `yukleyen${n}`, avatarUrl: null })
  const asset = (n: number, extra: Record<string, unknown> = {}) => ({
    assetId: UUID(2100 + n), fansubId: UUID(2200 + (n % 3)), fansubName: `Ekip ${(n % 3) + 1}`, fansubSlug: `ekip-${n % 3}`, tierLevel: (n % 3) + 1,
    assetKind: n % 2 ? 'sticker' : 'emoji', shortcode: `:ifade${n}:`, label: `Ifade ${n}`, assetRef: `r2://ifade-${n}.webp`, mimeType: 'image/webp',
    width: 128, height: 128, sizeBytes: 18000, presentation: { fitMode: 'contain', scale: 1, offsetX: 0, offsetY: 0, rotation: 0 },
    isActive: true, isArchived: false, quotaLimit: 15, quotaRank: n, isWithinQuota: true, isUsable: true, currentRevisionId: UUID(2300 + n),
    currentRevisionNumber: 1, latestRevisionNumber: 1, currentRevisionCreatedAt: daysAgo(n), currentRevisionCreatedBy: actor(n % 2), createdBy: actor(n % 2),
    updatedBy: null, deletedBy: null, createdAt: daysAgo(n), updatedAt: daysAgo(n), deletedAt: null, ...extra,
  })
  const latest = [...Array.from({ length: 6 }, (_, index) => asset(index + 1)), asset(7, { isArchived: true, isActive: false, isUsable: false })]
  await page.route('**/rest/v1/rpc/get_admin_supporter_asset_control_center', (route) => route.fulfill(json({
    generatedAt: daysAgo(0.01),
    transport: { uploadPath: '/api/supporter-assets', assetRefScheme: 'r2://', bucket: 'supporter-assets' },
    capabilityPolicies: [
      { capabilityKey: 'canUseSupporterEmojiAssets', label: 'Destekçi emojileri', summary: '', detail: '', where: 'Topluluk', surfaceGroup: 'genel', placementType: 'core', tierLevel: null, sortOrder: 1, placementLabel: 'Core', eligibleFansubCount: 40, liveFansubCount: 3 },
      { capabilityKey: 'canUseSupporterStickerAssets', label: 'Destekçi çıkartmaları', summary: '', detail: '', where: 'Topluluk', surfaceGroup: 'genel', placementType: 'tier', tierLevel: 1, sortOrder: 2, placementLabel: 'S1', eligibleFansubCount: 12, liveFansubCount: 2 },
    ],
    tierQuotas: [0, 1, 2, 3].map((level) => ({ tierLevel: level, tierLabel: level ? `S${level}` : 'Core', emojiLimit: [5, 15, 30, 50][level], stickerLimit: [5, 10, 15, 30][level] })),
    overview: { fansubCountWithAssets: 3, totalAssetCount: 7, totalEmojiCount: 4, totalStickerCount: 3, usableAssetCount: 6, quotaOutsideAssetCount: 0, revisedAssetCount: 1, uploadCount30d: 6, editCount30d: 2 },
    health: { quotaOutsideAssetCount: 0, inactiveAssetCount: 0, archivedAssetCount: 1, missingActorCount: 0, missingRevisionCount: 0 },
    topFansubs: [0, 1, 2].map((n) => ({ fansubId: UUID(2200 + n), name: n === 1 ? 'cokuzunekipadi'.repeat(6) : `Ekip ${n + 1}`, slug: `ekip-${n}`, tierLevel: n + 1, emojiCount: 2, stickerCount: 1, totalAssetCount: 3, liveAssetCount: 3, archivedAssetCount: n === 0 ? 1 : 0, usableAssetCount: 3, lastAssetAt: daysAgo(n), lastActivityAt: daysAgo(n), lastActor: actor(n) })),
    latestAssets: latest,
    topUploaders: [0, 1].map((n) => ({ user: actor(n), uploadCount30d: 3 - n, editCount30d: 1, fansubCount30d: 1, lastActivityAt: daysAgo(n) })),
    recentActivity: latest.slice(0, 5).map((row, index) => ({ eventType: index === 0 ? 'edit' : 'upload', eventLabel: index === 0 ? 'Düzenleme' : 'Yükleme', assetId: row.assetId, fansubId: row.fansubId, fansubName: row.fansubName, fansubSlug: row.fansubSlug, assetKind: row.assetKind, label: row.label, shortcode: row.shortcode, occurredAt: daysAgo(index), actor: actor(index % 2) })),
  })))
  await page.route('**/rest/v1/rpc/get_admin_supporter_asset_detail', (route) => route.fulfill(json({ asset: latest[0], revisions: [], recentActivity: [] })))
}

/** Games: 14 days, planned puzzles, all games on. */
async function mockGames(page: Page) {
  const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10)
  await page.route('**/rest/v1/rpc/admin_daily_games_overview', (route) => route.fulfill(json({
    today: day(0),
    settings: { dailyCoinCap: 30, enabled: { cover: true, panel: true, runner: true, match: true }, guessRewards: [10, 8, 6, 4, 2, 1], runAttempts: 3, runnerTiers: [{ score: 1500, coin: 5 }], matchTiers: [{ seconds: 60, coin: 5 }], matchFinishCoin: 2, panelMinSeries: 8, updatedAt: daysAgo(2) },
    puzzles: [-1, 0, 1].flatMap((offset) => (['cover', 'panel'] as const).map((kind) => ({ date: day(offset), kind, mangaId: UUID(2400 + offset + 2), title: `Seri ${offset + 2}`, plays: offset < 1 ? 12 : 0 }))),
    daily: Array.from({ length: 14 }, (_, index) => ({ date: day(-index), coverPlayers: 20 - index, coverSolved: 12 - (index % 5), panelPlayers: 9, runnerRuns: 30, matchRuns: 18, players: 34 - index, coins: 210 - index * 5 })),
    topEarners: [0, 1, 2].map((n) => ({ userId: UUID(2500 + n), username: `oyuncu${n}`, coins: 90 - n * 10 })),
    suspiciousRuns: [],
  })))
  await page.route('**/rest/v1/mangas?*', (route) => route.fulfill(json([{ id: UUID(2403), title: 'Seri 3', slug: 'seri-3' }]), ))
}

/** Duyurular: 2 yayinda (biri baglantili), 1 planli odul, 9 sona ermis, 1 taslak, 1 arsiv, 1 cop kutusunda. */
async function mockAnnouncements(page: Page) {
  const at = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString()
  const item = (n: number, extra: Record<string, unknown>) => {
    const base = {
      id: UUID(n), title: `Duyuru ${n}`, document: [{ type: 'text', text: 'Bu hafta yeni bolumler yayinda. Iyi okumalar!' }], kind: 'news', status: 'published',
      audience: 'all', starts_at: at(-3), ends_at: null as string | null, priority: 0, show_home: true, action: { type: 'none' } as Record<string, unknown>,
      revision: 2, created_at: at(-4), updated_at: at(-(n - 1000) / 10), deleted_at: null as string | null, recipients: [], views: n % 40, accepted: 0, declined: 0,
      claims: 0, rewardLocked: false, clicks: n % 50, linkClicks: 0, responseCount: 0, ...extra,
    }
    return {
      ...base,
      preview: { id: base.id, title: base.title, document: base.document, kind: base.kind, startsAt: base.starts_at, endsAt: base.ends_at, priority: base.priority, action: base.action, references: {}, revision: base.revision, response: null, reward: null },
    }
  }
  const rows = [
    item(1001, { title: 'Yeni okuma deneyimi yayinda', priority: 10, action: { type: 'link', label: 'Incele', url: '/kesfet' }, linkClicks: 12 }),
    item(1002, { title: 'Ceviri ekiplerine cagri', kind: 'system' }),
    item(1003, { title: 'Hafta sonu coin odulu', kind: 'reward', starts_at: at(2), ends_at: at(9), action: { type: 'reward', value: 50, maxClaims: 100 } }),
    ...Array.from({ length: 9 }, (_, index) => item(1010 + index, { title: `Eski etkinlik #${index + 1}`, starts_at: at(-60 - index), ends_at: at(-30 - index) })),
    item(1030, { title: 'Taslak: Kis kampanyasi', status: 'draft' }),
    item(1031, { title: 'Arsivlenen bakim notu', status: 'archived', kind: 'system' }),
    item(1032, { title: 'Yanlislikla acilan duyuru', deleted_at: at(-1) }),
  ]
  const stateOf = (row: (typeof rows)[number]) => {
    if (row.deleted_at) return 'deleted'
    if (row.status !== 'published') return row.status
    if (row.ends_at && Date.parse(row.ends_at) <= Date.now()) return 'ended'
    if (Date.parse(row.starts_at) > Date.now()) return 'scheduled'
    return 'live'
  }
  await page.route('**/rest/v1/rpc/announcement_admin_overview', (route) => {
    const body = route.request().postDataJSON() as { p_state: string, p_query: string, p_offset: number }
    const searched = rows.filter((row) => !body.p_query || row.title.toLowerCase().includes(body.p_query.toLowerCase()))
    const matched = searched.filter((row) => (body.p_state === 'all' ? stateOf(row) !== 'deleted' : stateOf(row) === body.p_state))
    const count = (state: string) => searched.filter((row) => stateOf(row) === state).length
    return route.fulfill(json({
      total: matched.length,
      counts: { live: count('live'), scheduled: count('scheduled'), ended: count('ended'), draft: count('draft'), archived: count('archived'), deleted: count('deleted') },
      items: matched.slice(body.p_offset, body.p_offset + 20),
    }))
  })
}

test.use({ video: 'off', trace: 'off', ...(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {}) })

test.describe('Admin paneli v2', () => {
  test('sidebar: wide, search, collapsed and mobile', async ({ page }) => {
    test.setTimeout(180_000)
    await mockAdmin(page)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/tr/admin?e2e=1')
    const sidebar = page.getByTestId('admin-sidebar').first()
    await expect(sidebar).toBeVisible({ timeout: 30_000 })
    await expect(page.getByTestId('admin-nav-dashboard')).toHaveAttribute('aria-current', 'page')
    await page.waitForTimeout(1500)
    await page.screenshot({ path: path.join(OUT_DIR, 'sidebar-expanded.png') })

    // Ctrl+K quick switch: Turkish letter-insensitive search + Enter to go.
    await page.keyboard.press('Control+k')
    await expect(page.getByTestId('admin-nav-search')).toBeFocused()
    await page.keyboard.type('kullanici')
    await expect(page.getByTestId('admin-nav-users')).toBeVisible()
    await expect(page.getByTestId('admin-nav-pending')).toHaveCount(0)
    await page.screenshot({ path: path.join(OUT_DIR, 'sidebar-search.png'), clip: { x: 0, y: 0, width: 320, height: 420 } })
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/admin\/kullanicilar/)
    await expect(page.getByTestId('admin-nav-users')).toHaveAttribute('aria-current', 'page')

    // Ctrl+B collapses to icon mode.
    await page.keyboard.press('Control+b')
    await page.waitForTimeout(600)
    await page.screenshot({ path: path.join(OUT_DIR, 'sidebar-collapsed.png') })
    await page.keyboard.press('Control+b')

    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/tr/admin/destek?e2e=1')
    await page.getByRole('button', { name: 'Yönetim menüsünü aç' }).click()
    await page.waitForTimeout(600)
    await page.screenshot({ path: path.join(OUT_DIR, 'sidebar-mobile.png') })
  })

  test('genel bakis', async ({ page }) => {
    test.setTimeout(180_000)
    await mockAdmin(page)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/tr/admin?e2e=1')
    await expect(page.getByTestId('admin-dashboard')).toBeVisible({ timeout: 30_000 })
    await page.waitForTimeout(2000)
    expect(await documentOverflow(page)).toBeLessThanOrEqual(1)
    await page.screenshot({ path: path.join(OUT_DIR, 'dashboard-full.png'), fullPage: true })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.waitForTimeout(800)
    await page.screenshot({ path: path.join(OUT_DIR, 'dashboard-mobile.png'), fullPage: true })
  })

  test('pending approvals: review desk', async ({ page }) => {
    test.setTimeout(180_000)
    await mockAdmin(page)
    await mockPendingQueue(page)
    await mockPendingExtras(page)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/tr/admin/onay-bekleyenler?e2e=1')
    await expect(page.getByTestId('admin-pending-list')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByTestId('admin-pending-detail')).toBeVisible()
    await page.waitForTimeout(800)

    // Desk at screen height: the page does not scroll, the long list scrolls inside, tabs stay in place.
    expect(await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)).toBeLessThanOrEqual(1)
    expect(await page.getByTestId('admin-pending-list').evaluate((el) => el.scrollHeight - el.clientHeight)).toBeGreaterThan(0)
    await page.mouse.move(1100, 600)
    await page.mouse.wheel(0, 800)
    await expect(page.getByTestId('admin-pending-tab-all')).toBeInViewport()
    await page.screenshot({ path: path.join(OUT_DIR, 'pending-desk.png') })

    // Fansub application: the avatar uploaded by the team in the row and header.
    const fansubRow = page.getByTestId(`admin-pending-row-fansub_request-${UUID(40)}`)
    await expect(fansubRow.getByTestId('admin-pending-thumb')).toBeVisible()
    await fansubRow.click()
    await expect(page.getByTestId('admin-pending-detail').getByTestId('admin-pending-thumb')).toBeVisible()
    await expect(page.getByTestId('admin-pending-detail')).toContainText('Deneyimli')

    // Bilgi karti: basvuranin adinin uzerine gelince.
    await page.getByTestId('admin-pending-detail').getByTestId('admin-entity-user').first().hover()
    await expect(page.getByTestId('admin-entity-card')).toContainText('okurdeniz')
    await page.waitForTimeout(300)
    await page.screenshot({ path: path.join(OUT_DIR, 'pending-hover-card.png') })
    await page.mouse.move(10, 890)

    // New chapter: clicking a page gives a big preview, arrow navigation (the row is on page 2; reached by search).
    await page.getByLabel('Taleplerde ara').fill('Sisli liman')
    await page.getByTestId(`admin-pending-row-chapter-${UUID(2)}`).click()
    await page.getByTestId('admin-pending-page-thumb').first().click()
    const lightbox = page.getByTestId('admin-pending-page-lightbox')
    await expect(lightbox).toContainText('1 / 4')
    await page.keyboard.press('ArrowRight')
    await expect(lightbox).toContainText('2 / 4')
    await page.waitForTimeout(400)
    await page.screenshot({ path: path.join(OUT_DIR, 'pending-lightbox.png') })
    await page.keyboard.press('Escape')
    await expect(lightbox).toHaveCount(0)

    // Published series revision: only changed fields.
    const search = page.getByLabel('Taleplerde ara')
    await search.fill('Sis Sehri')
    await page.getByTestId(`admin-pending-row-manga-${UUID(5)}`).click()
    await expect(page.getByTestId('admin-pending-manga-diff')).toBeVisible()
    await page.screenshot({ path: path.join(OUT_DIR, 'pending-revision-diff.png') })

    // Yeni manga reddi silme: pencere bunu acikca yazar.
    await search.fill('Gece Yolcusu')
    await page.getByTestId(`admin-pending-row-manga-${UUID(1)}`).click()
    await page.getByTestId('admin-pending-reject').click()
    await expect(page.getByTestId('admin-pending-reject-consequence')).toContainText('geri alınamaz')
    await page.waitForTimeout(400)
    await page.screenshot({ path: path.join(OUT_DIR, 'pending-reject-dialog.png') })
    await page.getByRole('button', { name: 'Vazgeç' }).click()

    await page.setViewportSize({ width: 390, height: 844 })
    await page.waitForTimeout(600)
    await search.fill('Sisli liman')
    await page.getByTestId(`admin-pending-row-chapter-${UUID(2)}`).click()
    await expect(page.getByTestId('admin-pending-detail')).toBeVisible()
    await page.waitForTimeout(500)
    await expect(page.getByTestId('admin-entity-card')).toHaveCount(0)
    await page.screenshot({ path: path.join(OUT_DIR, 'pending-mobile-sheet.png') })
  })

  test('series requests', async ({ page }) => {
    test.setTimeout(180_000)
    await mockAdmin(page)
    await mockSeriesRequests(page)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/tr/admin/seri-talepleri?e2e=1')
    await expect(page.getByTestId(`admin-series-request-${UUID(11)}`)).toBeVisible({ timeout: 30_000 })
    await expect(page.getByTestId('admin-series-request-similar')).toBeVisible()
    await page.waitForTimeout(500)
    await page.screenshot({ path: path.join(OUT_DIR, 'series-requests.png') })
    await page.getByTestId(`admin-series-request-${UUID(12)}`).getByRole('button', { name: /Reddet/ }).click()
    await page.getByRole('button', { name: 'Telif riski' }).click()
    await page.waitForTimeout(400)
    await page.screenshot({ path: path.join(OUT_DIR, 'series-reject-dialog.png') })
  })

  test('raporlar', async ({ page }) => {
    test.setTimeout(180_000)
    await mockAdmin(page)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/tr/admin/raporlar?e2e=1')
    // A fixed wait was not enough under load: report rows come first, then measure.
    await expect(page.locator('[data-testid^="report-row-"]').first()).toBeVisible({ timeout: 30_000 })
    await page.waitForTimeout(800)
    expect(await documentOverflow(page)).toBeLessThanOrEqual(1)
    await page.screenshot({ path: path.join(OUT_DIR, 'reports-full.png'), fullPage: true })
  })

  test('legal requests', async ({ page }) => {
    test.setTimeout(180_000)
    await mockAdmin(page)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/tr/admin/yasal-talepler?e2e=1')
    await page.waitForTimeout(3000)
    await page.screenshot({ path: path.join(OUT_DIR, 'legal-full.png'), fullPage: true })
  })

  test('support requests', async ({ page }) => {
    test.setTimeout(180_000)
    await mockAdmin(page)
    await mockSupport(page)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/tr/admin/destek?e2e=1')
    await expect(page.getByTestId('admin-support-list')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByTestId('admin-support-detail')).toBeVisible()
    await expect(page.getByTestId('admin-support-status-open')).toContainText('4')
    await page.waitForTimeout(600)
    // Desk at screen height: the page does not scroll.
    expect(await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)).toBeLessThanOrEqual(1)
    await page.screenshot({ path: path.join(OUT_DIR, 'support-desk.png') })
  })

  test('community: servers, reports, operations', async ({ page }) => {
    test.setTimeout(180_000)
    await mockAdmin(page)
    await mockCommunity(page)
    await mockEntityCard(page)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/tr/admin/topluluk?e2e=1')
    const detail = page.getByTestId('admin-community-server-detail')
    await expect(page.getByTestId('admin-community-servers-list')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByTestId('admin-community-closed')).toBeVisible()
    await expect(page.getByTestId('admin-community-strip-servers')).toContainText('4')
    await expect(page.getByTestId('admin-community-strip-reports')).toContainText('2')
    // On desk the first server opens by itself; channels and roles are visible.
    await expect(detail).toContainText('Karanlik Koridor')
    await expect(page.getByTestId('admin-community-server-stats')).toContainText('19')
    // Desk at screen height: the page does not scroll.
    expect(await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)).toBeLessThanOrEqual(1)
    await page.screenshot({ path: path.join(OUT_DIR, 'community-servers.png') })

    // Uzun ad yatay tasma yapmaz.
    await page.getByTestId(`admin-community-server-${UUID(603)}`).click()
    expect(await page.getByTestId('admin-community-servers-list').evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1)
    expect(await detail.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1)

    // Members: no action menu for the owner; a restricted member is marked; restriction window.
    await page.getByTestId(`admin-community-server-${UUID(601)}`).click()
    await page.getByTestId('admin-community-server-tab-members').click()
    await expect(page.getByTestId(`admin-community-member-${UUID(80)}`).getByTestId('admin-community-member-more')).toHaveCount(0)
    await page.getByTestId(`admin-community-member-${UUID(82)}`).getByTestId('admin-community-member-more').click()
    await page.getByRole('menuitem').first().click()
    await expect(page.getByTestId('admin-community-member-dialog')).toBeVisible()
    expect(await page.getByTestId('admin-community-member-dialog').evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1)
    await page.screenshot({ path: path.join(OUT_DIR, 'community-member-dialog.png') })
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('admin-community-member-dialog')).toHaveCount(0)

    // Gecmis: site yoneticisi islemleri isaretli.
    await page.getByTestId('admin-community-server-tab-audit').click()
    await expect(page.getByTestId('admin-community-audit')).toBeVisible()
    await page.screenshot({ path: path.join(OUT_DIR, 'community-audit.png') })

    // Arsiv penceresi.
    await page.getByTestId('admin-community-archive').click()
    await expect(page.getByTestId('admin-community-archive-dialog')).toBeVisible()
    await page.keyboard.press('Escape')

    // Reports: the summary cell opens the tab; the first report is selected.
    await page.getByTestId('admin-community-strip-reports').click()
    await expect(page.getByTestId('admin-community-reports-list')).toBeVisible()
    await expect(page.getByTestId('admin-community-report-detail')).toContainText('bedava-coin')
    await page.screenshot({ path: path.join(OUT_DIR, 'community-reports.png') })
    await page.getByTestId(`admin-community-report-${UUID(802)}`).click()
    expect(await page.getByTestId('admin-community-report-message').evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1)
    await page.getByTestId('admin-community-report-delete').click()
    await expect(page.getByTestId('admin-community-report-dialog')).toBeVisible()
    expect(await page.getByTestId('admin-community-report-dialog').evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1)
    await page.screenshot({ path: path.join(OUT_DIR, 'community-report-dialog.png') })
    await page.keyboard.press('Escape')
    await page.getByTestId('admin-community-reports-status-resolved').click()
    await expect(page.getByTestId('admin-community-report-detail')).toContainText('okurdeniz')

    // Operations: quotas and background jobs.
    await page.getByTestId('admin-community-tab-operations').click()
    await expect(page.getByTestId('admin-community-job-notifications')).toBeVisible()
    await page.screenshot({ path: path.join(OUT_DIR, 'community-operations.png') })

    // Mobile: server detail in a panel opening from the right; the info card does not open by itself.
    await page.getByTestId('admin-community-tab-servers').click()
    await page.setViewportSize({ width: 390, height: 844 })
    await page.waitForTimeout(600)
    await page.getByTestId(`admin-community-server-${UUID(602)}`).click()
    await expect(page.getByTestId('admin-community-archive')).toBeVisible()
    await page.waitForTimeout(500)
    await expect(page.getByTestId('admin-entity-card')).toHaveCount(0)
    await page.screenshot({ path: path.join(OUT_DIR, 'community-mobile-sheet.png') })
  })

  test('comments: moderation desk', async ({ page }) => {
    test.setTimeout(180_000)
    await mockAdmin(page)
    await mockComments(page)
    await mockEntityCard(page)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/tr/admin/yorumlar?e2e=1')
    const list = page.getByTestId('admin-comments-list')
    const detail = page.getByTestId('admin-comments-detail')
    await expect(list).toBeVisible({ timeout: 30_000 })
    await expect(detail).toBeVisible()
    // Default view Risky: only the 3 flagged published comments.
    await expect(page.getByTestId('admin-comments-view-flagged')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('admin-comments-view-flagged')).toContainText('3')
    await expect(list.locator('li')).toHaveCount(3)
    await page.waitForTimeout(600)
    expect(await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)).toBeLessThanOrEqual(1)
    await page.screenshot({ path: path.join(OUT_DIR, 'comments-desk.png') })

    // Source tab: chapter comments only.
    await page.getByTestId('admin-comments-source-chapter').click()
    await expect(list.locator('li')).toHaveCount(1)
    await expect(detail).toContainText('Sis Sehri')
    await page.getByTestId('admin-comments-source-all').click()
    await expect(list.locator('li')).toHaveCount(3)

    // Yazar bilgi karti.
    await page.getByTestId(`admin-comments-row-${UUID(601)}`).click()
    await detail.getByTestId('admin-entity-user').first().hover()
    await expect(page.getByTestId('admin-entity-card')).toContainText('okurdeniz')
    await page.waitForTimeout(300)
    await page.screenshot({ path: path.join(OUT_DIR, 'comments-hover.png') })
    await page.mouse.move(10, 890)

    // Removal window: states the chain effect, suggests a reason by signal.
    await page.getByTestId('admin-comments-remove').click()
    const dialog = page.getByTestId('admin-comments-remove-dialog')
    await expect(dialog).toContainText('3 yan')
    await expect(page.getByTestId('admin-comments-remove-confirm')).toBeEnabled()
    await page.waitForTimeout(300)
    await page.screenshot({ path: path.join(OUT_DIR, 'comments-remove-dialog.png') })
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)

    // Published: 26 comments, paged; the list scrolls inside; unbroken text does not overflow.
    await page.getByTestId('admin-comments-view-active').click()
    await expect(list.locator('li')).toHaveCount(20)
    expect(await list.evaluate((el) => el.scrollHeight - el.clientHeight)).toBeGreaterThan(0)
    await page.getByTestId(`admin-comments-row-${UUID(604)}`).click()
    expect(await detail.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1)
    expect(await list.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1)
    await page.screenshot({ path: path.join(OUT_DIR, 'comments-active.png') })

    // Kaldirilan: geri acma.
    await page.getByTestId('admin-comments-view-removed').click()
    await expect(list.locator('li')).toHaveCount(1)
    await expect(page.getByTestId('admin-comments-restore')).toBeVisible()

    // No search results gives a clear empty state.
    await page.getByLabel('Yorumlarda ara').fill('zzzz')
    await expect(page.getByTestId('admin-comments-empty')).toBeVisible()
    await page.getByLabel('Yorumlarda ara').fill('')

    // Mobil: ayrinti cekmecede, karar altta; bilgi karti kendiliginden acilmaz.
    await page.getByTestId('admin-comments-view-flagged').click()
    await page.setViewportSize({ width: 390, height: 844 })
    await page.waitForTimeout(600)
    await page.getByTestId(`admin-comments-row-${UUID(602)}`).click()
    await expect(page.getByTestId('admin-comments-remove')).toBeVisible()
    await page.waitForTimeout(400)
    await expect(page.getByTestId('admin-entity-card')).toHaveCount(0)
    await page.screenshot({ path: path.join(OUT_DIR, 'comments-mobile-sheet.png') })
  })

  test('lists: list desk', async ({ page }) => {
    test.setTimeout(180_000)
    await mockAdmin(page)
    await mockLists(page)
    await mockEntityCard(page)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/tr/admin/listeler?e2e=1')
    const list = page.getByTestId('admin-lists-list')
    const detail = page.getByTestId('admin-lists-detail')
    await expect(list.locator('li')).toHaveCount(15, { timeout: 30_000 })
    await expect(detail).toBeVisible()
    await expect(page.getByTestId('admin-lists-view-all')).toContainText('20')
    await expect(page.getByTestId('admin-lists-counter-drift')).toBeVisible()
    // Ilk liste: pasif manga isaretli (Mangalar varsayilan sekme).
    await expect(page.getByTestId('admin-list-items-panel')).toContainText('Gece Yolcusu')
    await expect(page.getByTestId('admin-list-detail-warnings')).toContainText('pasif')
    await page.waitForTimeout(600)
    expect(await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)).toBeLessThanOrEqual(1)
    expect(await list.locator('ul').evaluate((el) => el.scrollHeight - el.clientHeight)).toBeGreaterThan(0)
    await page.screenshot({ path: path.join(OUT_DIR, 'lists-desk.png') })

    // Comments: removal uses the same window as the Comments page (states the reply effect).
    await page.getByTestId('admin-lists-tab-comments').click()
    await expect(page.getByTestId('admin-list-comments-panel')).toContainText('aptal')
    await page.getByTestId('admin-list-comment-remove').first().click()
    const removeDialog = page.getByTestId('admin-comments-remove-dialog')
    await expect(removeDialog).toContainText('1 yan')
    await page.waitForTimeout(300)
    await page.screenshot({ path: path.join(OUT_DIR, 'lists-comment-remove.png') })
    await page.keyboard.press('Escape')
    await expect(removeDialog).toHaveCount(0)

    // Bilgiler sekmesi.
    await page.getByTestId('admin-lists-tab-meta').click()
    await expect(page.getByTestId('admin-list-meta-panel')).toBeVisible()

    // Empty view: server view, the missing items in detail.
    await page.getByTestId('admin-lists-view-empty').click()
    await expect(list.locator('li')).toHaveCount(1)
    await expect(page.getByTestId('admin-list-detail-warnings')).toContainText('sokak')
    await page.screenshot({ path: path.join(OUT_DIR, 'lists-empty-view.png') })

    // Delete is only in the menu and a confirm window.
    await page.getByTestId('admin-lists-more').click()
    await page.getByTestId('admin-lists-delete').click()
    await expect(page.getByTestId('admin-lists-delete-dialog')).toBeVisible()
    await page.waitForTimeout(300)
    await page.screenshot({ path: path.join(OUT_DIR, 'lists-delete-dialog.png') })
    await page.keyboard.press('Escape')

    // Toplu islem.
    await page.getByTestId('admin-lists-view-all').click()
    await expect(list.locator('li')).toHaveCount(15)
    await list.locator('li input[type="checkbox"]').nth(0).check()
    await list.locator('li input[type="checkbox"]').nth(2).check()
    await page.getByTestId('admin-lists-bulk').click()
    await page.waitForTimeout(300)
    await page.screenshot({ path: path.join(OUT_DIR, 'lists-bulk.png') })
    await page.keyboard.press('Escape')

    // Mobil: ayrinti cekmecede; bilgi karti kendiliginden acilmaz.
    await page.setViewportSize({ width: 390, height: 844 })
    await page.waitForTimeout(600)
    await page.getByTestId(`admin-lists-row-${UUID(703)}`).click()
    await expect(page.getByTestId('admin-lists-toggle-visibility')).toBeVisible()
    await page.waitForTimeout(400)
    await expect(page.getByTestId('admin-entity-card')).toHaveCount(0)
    await page.screenshot({ path: path.join(OUT_DIR, 'lists-mobile-sheet.png') })
  })

  test('mangas: series desk', async ({ page }) => {
    test.setTimeout(180_000)
    await mockAdmin(page)
    await mockMangas(page)
    await mockEntityCard(page)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/tr/admin/mangalar?e2e=1')
    const list = page.getByTestId('admin-manga-list')
    const detail = page.getByTestId('admin-manga-detail')
    await expect(list.locator('li')).toHaveCount(20, { timeout: 30_000 })
    await expect(detail).toContainText('Sis Sehri')
    await expect(page.getByTestId('admin-manga-view-all')).toContainText('26')
    await expect(page.getByTestId('admin-manga-view-pending-chapters')).toContainText('3')
    // Desk at screen height: the page does not scroll; a long name does not overflow horizontally.
    expect(await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)).toBeLessThanOrEqual(1)
    expect(await list.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1)
    await page.screenshot({ path: path.join(OUT_DIR, 'mangas-desk.png') })

    await page.getByTestId(`admin-manga-row-${UUID(904)}`).click()
    expect(await detail.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1)
    await page.getByTestId(`admin-manga-row-${UUID(902)}`).click()
    await expect(page.getByTestId('admin-manga-warnings')).toContainText('Künye eksik')
    await page.screenshot({ path: path.join(OUT_DIR, 'mangas-incomplete.png') })

    // Yayindan kaldirma sonucu soyleyen pencereden gecer.
    await page.getByTestId(`admin-manga-row-${UUID(905)}`).click()
    await page.getByTestId('admin-manga-more').click()
    await page.getByTestId('admin-manga-deactivate').click()
    await expect(page.getByTestId('admin-confirm-dialog')).toContainText('Yayından kaldır')
    await page.screenshot({ path: path.join(OUT_DIR, 'mangas-confirm.png') })
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('admin-confirm-dialog')).toHaveCount(0)

    // Toplu secim cubugu.
    await page.getByRole('checkbox', { name: 'Bu sayfadaki serilerin tümünü seç' }).check()
    await expect(page.getByTestId('admin-manga-bulk')).toContainText('20 seri seçili')
    await page.screenshot({ path: path.join(OUT_DIR, 'mangas-bulk.png') })

    // Mobil: ayrinti sagdan acilan panelde.
    await page.getByRole('checkbox', { name: 'Bu sayfadaki serilerin tümünü seç' }).uncheck()
    await page.setViewportSize({ width: 390, height: 844 })
    await page.waitForTimeout(600)
    await page.getByTestId(`admin-manga-row-${UUID(901)}`).click()
    await expect(page.getByTestId('admin-manga-approve')).toBeVisible()
    await page.waitForTimeout(500)
    await expect(page.getByTestId('admin-entity-card')).toHaveCount(0)
    await page.screenshot({ path: path.join(OUT_DIR, 'mangas-mobile-sheet.png') })
  })

  test('fansubs: team desk', async ({ page }) => {
    test.setTimeout(180_000)
    await mockAdmin(page)
    await mockCommunity(page)
    await mockFansubs(page)
    await mockEntityCard(page)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/tr/admin/fansublar?e2e=1')
    const list = page.getByTestId('admin-fansubs-list')
    const detail = page.getByTestId('admin-fansub-detail')
    await expect(list.locator('li')).toHaveCount(20, { timeout: 30_000 })
    await expect(detail).toContainText('Karanlik Koridor')
    await expect(page.getByTestId('admin-fansubs-view-all')).toContainText('23')
    // Community server summary and a direct link to the Community page.
    await expect(page.getByTestId('admin-fansub-community')).toContainText('19')
    await expect(page.getByTestId('admin-fansub-community-open')).toHaveAttribute('href', `/tr/admin/topluluk?sunucu=${UUID(601)}`)
    expect(await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)).toBeLessThanOrEqual(1)
    expect(await list.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1)
    await page.screenshot({ path: path.join(OUT_DIR, 'fansubs-desk.png') })

    await page.getByTestId(`admin-fansubs-row-${UUID(1104)}`).click()
    expect(await detail.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1)
    await expect(page.getByTestId('admin-fansub-community-none')).toBeVisible()

    // Pasife alma sonucu (uyelikler sonlanir) soyleyen pencereden gecer.
    await page.getByTestId(`admin-fansubs-row-${UUID(1102)}`).click()
    await page.getByTestId('admin-fansub-more').click()
    await page.getByTestId('admin-fansub-deactivate').click()
    await expect(page.getByTestId('admin-confirm-dialog')).toContainText('üyeliği sonlandırılır')
    await page.waitForTimeout(300)
    await page.screenshot({ path: path.join(OUT_DIR, 'fansubs-confirm.png') })
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('admin-confirm-dialog')).toHaveCount(0)

    await page.setViewportSize({ width: 390, height: 844 })
    await page.waitForTimeout(600)
    await page.getByTestId(`admin-fansubs-row-${UUID(1101)}`).click()
    await expect(page.getByTestId('admin-fansub-open-members')).toBeVisible()
    await page.waitForTimeout(500)
    await expect(page.getByTestId('admin-entity-card')).toHaveCount(0)
    await page.screenshot({ path: path.join(OUT_DIR, 'fansubs-mobile-sheet.png') })

    // The Community page opens that server directly with ?sunucu=.
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(`/tr/admin/topluluk?e2e=1&sunucu=${UUID(603)}`)
    await expect(page.getByTestId('admin-community-server-detail')).toContainText('cokuzunsunucuadi', { timeout: 30_000 })
  })

  test('users: user desk', async ({ page }) => {
    test.setTimeout(180_000)
    await mockAdmin(page)
    await mockEntityCard(page)
    await page.setViewportSize({ width: 1440, height: 900 })
    // ?e2e=1: list, summary, preview and actions come from adminUsersE2e fixtures.
    await page.goto('/tr/admin/kullanicilar?e2e=1')
    const list = page.getByTestId('admin-users-list')
    const detail = page.getByTestId('admin-user-detail')
    await expect(list.locator('li')).toHaveCount(10, { timeout: 30_000 })
    await expect(detail).toBeVisible()
    await expect(page.getByTestId('admin-users-view-all')).toContainText('10')
    expect(await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)).toBeLessThanOrEqual(1)
    expect(await list.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1)
    await page.screenshot({ path: path.join(OUT_DIR, 'users-desk.png') })

    // Banned view: ban state in the panel; removal goes through a window stating the result.
    await page.getByTestId('admin-users-view-banned').click()
    await expect(list.locator('li')).toHaveCount(1)
    await expect(page.getByTestId('admin-user-ban-state')).toBeVisible()
    await page.getByTestId('admin-user-ban-state').getByRole('button', { name: 'Banı kaldır' }).click()
    await expect(page.getByTestId('admin-confirm-dialog')).toContainText('moderasyon geçmişinde kalır')
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('admin-confirm-dialog')).toHaveCount(0)

    // Rol degisikligi sonucu anlatan pencereden gecer.
    await page.getByTestId('admin-users-view-all').click()
    await expect(list.locator('li')).toHaveCount(10)
    await page.getByTestId('admin-users-row-71000000-0000-4000-8000-000000000002').click()
    await expect(detail).toContainText('Mert Kaya')
    await page.getByTestId('admin-user-role-admin').click()
    await expect(page.getByTestId('admin-confirm-dialog')).toContainText('tam erişim')
    await page.waitForTimeout(300)
    await page.screenshot({ path: path.join(OUT_DIR, 'users-role-confirm.png') })
    await page.keyboard.press('Escape')

    // Ban window: reason + duration.
    await page.getByTestId('admin-user-more').click()
    await page.getByTestId('admin-user-ban').click()
    const banDialog = page.getByTestId('admin-user-ban-dialog')
    await expect(banDialog).toBeVisible()
    await expect(page.getByTestId('admin-user-ban-confirm')).toBeDisabled()
    await page.getByTestId('admin-user-ban-reason').fill('Spam yorumlar')
    await page.getByTestId('admin-user-ban-duration-30d').click()
    await expect(page.getByTestId('admin-user-ban-confirm')).toBeEnabled()
    await page.waitForTimeout(300)
    await page.screenshot({ path: path.join(OUT_DIR, 'users-ban-dialog.png') })
    await page.keyboard.press('Escape')
    await expect(banDialog).toHaveCount(0)

    // Toplu secim.
    await list.locator('li').nth(2).locator('input[type=checkbox]').check()
    await list.locator('li').nth(3).locator('input[type=checkbox]').check()
    await expect(page.getByTestId('admin-users-bulk')).toContainText('2 seçili')
    await expect(page.getByTestId('admin-users-bulk-ban')).toBeVisible()
    await page.screenshot({ path: path.join(OUT_DIR, 'users-bulk.png') })

    await page.setViewportSize({ width: 390, height: 844 })
    await page.waitForTimeout(600)
    await page.getByTestId('admin-users-row-71000000-0000-4000-8000-000000000002').click()
    await expect(detail).toBeVisible()
    expect(await detail.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1)
    await page.waitForTimeout(400)
    await page.screenshot({ path: path.join(OUT_DIR, 'users-mobile-sheet.png') })
  })

  test('shop: product and order desks', async ({ page }) => {
    test.setTimeout(180_000)
    await mockAdmin(page)
    await mockShop(page)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/tr/admin/magaza?e2e=1&sekme=products')
    const list = page.getByTestId('shop-products-list')
    const detail = page.getByTestId('shop-product-detail')
    await expect(list.locator('li')).toHaveCount(20, { timeout: 30_000 })
    await expect(page.getByTestId('shop-products-view-all')).toContainText('26')
    await expect(page.getByTestId('shop-products-view-issues')).toContainText('1')
    await expect(detail).toContainText('Kuzey Isigi')
    await expect(detail).toContainText('12 / 50')
    expect(await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)).toBeLessThanOrEqual(1)
    expect(await list.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1)
    await page.screenshot({ path: path.join(OUT_DIR, 'shop-products-desk.png') })

    await page.getByTestId(`shop-products-row-${UUID(1202)}`).click()
    await expect(page.getByTestId('shop-product-issues')).toContainText('Görsel eksik')
    await page.getByTestId(`shop-products-row-${UUID(1207)}`).click()
    expect(await detail.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1)

    // Arsivleme sonucu soyleyen pencereden gecer.
    await page.getByTestId('shop-product-more').click()
    await page.getByTestId('shop-product-archive').click()
    await expect(page.getByTestId('admin-confirm-dialog')).toContainText('envanteri etkilenmez')
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('admin-confirm-dialog')).toHaveCount(0)

    await page.getByTestId('shop-products-view-archived').click()
    await expect(list.locator('li')).toHaveCount(1)
    await page.getByTestId('admin-shop-tab-bundles').click()
    await expect(page.getByTestId('shop-products-list').locator('li')).toHaveCount(1)
    await expect(page.getByTestId('shop-product-detail')).toContainText('Paket içeriği')

    await page.getByTestId('admin-shop-tab-orders').click()
    const orders = page.getByTestId('shop-orders-list')
    await expect(orders.locator('li')).toHaveCount(20)
    await expect(page.getByTestId('shop-order-detail')).toContainText('Dogum gunun kutlu olsun')
    expect(await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)).toBeLessThanOrEqual(1)
    await page.screenshot({ path: path.join(OUT_DIR, 'shop-orders-desk.png') })
    await page.getByTestId('shop-order-refund').click()
    await expect(page.getByTestId('shop-order-refund-confirm')).toBeDisabled()
    await page.getByTestId('shop-order-refund-reason').fill('Kullanici talebi')
    await expect(page.getByTestId('shop-order-refund-confirm')).toBeEnabled()
    await page.waitForTimeout(300)
    await page.screenshot({ path: path.join(OUT_DIR, 'shop-refund-dialog.png') })
    await page.keyboard.press('Escape')
    await page.getByTestId(`shop-orders-row-${UUID(1602)}`).click()
    await expect(page.getByTestId('shop-order-refund-state')).toContainText('Yanlislikla')

    // A non-desk tab stays in normal flow.
    await page.getByTestId('admin-shop-tab-overview').click()
    await expect(page.getByTestId('admin-shop-section')).toBeVisible()

    await page.setViewportSize({ width: 390, height: 844 })
    await page.getByTestId('admin-shop-tab-products').click()
    await page.waitForTimeout(600)
    await page.getByTestId(`shop-products-row-${UUID(1201)}`).click()
    await expect(page.getByTestId('shop-product-detail')).toBeVisible()
    expect(await page.getByTestId('shop-product-detail').evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1)
    await page.waitForTimeout(400)
    await page.screenshot({ path: path.join(OUT_DIR, 'shop-mobile-sheet.png') })

    // Light theme: status and rarity colors must stay readable.
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.evaluate(() => localStorage.setItem('bsgmanga-theme', 'light'))
    await page.goto('/tr/admin/magaza?e2e=1&sekme=products')
    await expect(page.getByTestId('shop-products-list').locator('li')).toHaveCount(20, { timeout: 30_000 })
    await page.screenshot({ path: path.join(OUT_DIR, 'shop-products-light.png') })
  })

  test('coin codes: code desk', async ({ page }) => {
    test.setTimeout(180_000)
    await mockAdmin(page)
    await page.setViewportSize({ width: 1440, height: 900 })
    // ?e2e=1: summary, codes and uses come from adminCoinCodesE2e fixtures (32 codes, cursor).
    await page.goto('/tr/admin/coin-kodlari?e2e=1')
    const list = page.getByTestId('coin-codes-list')
    const detail = page.getByTestId('coin-code-detail')
    await expect(list.locator('li')).toHaveCount(20, { timeout: 30_000 })
    await expect(detail).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)).toBeLessThanOrEqual(1)
    expect(await list.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1)
    await page.screenshot({ path: path.join(OUT_DIR, 'coin-codes-desk.png') })

    // Next page with cursor.
    await page.getByRole('button', { name: 'Sonraki sayfa' }).click()
    await expect(list.locator('li')).toHaveCount(12)
    await page.getByRole('button', { name: 'Önceki sayfa' }).click()
    await expect(list.locator('li')).toHaveCount(20)

    // Deactivating asks for a reason.
    await page.getByTestId('coin-codes-view-active').click()
    await page.getByTestId('coin-code-deactivate').click()
    await expect(page.getByRole('dialog')).toContainText('coinler geri alınmaz')
    await page.keyboard.press('Escape')

    // Generate window: a sample in the real format, explicit confirmation at high risk.
    await page.getByTestId('coin-code-generate-open').click()
    const dialog = page.getByTestId('coin-code-generate-dialog')
    await expect(dialog).toBeVisible()
    await expect(page.getByTestId('coin-code-summary')).toContainText(/BSG-[0-9A-F]{8}-[0-9A-F]{4}/)
    await page.getByTestId('coin-code-value').fill('50000')
    await page.getByTestId('coin-code-count').fill('300')
    await expect(page.getByTestId('coin-code-generate-submit')).toBeDisabled()
    await page.getByTestId('coin-code-risk-accept').check()
    await expect(page.getByTestId('coin-code-generate-submit')).toBeEnabled()
    await page.waitForTimeout(300)
    await page.screenshot({ path: path.join(OUT_DIR, 'coin-codes-generate.png') })
    await page.keyboard.press('Escape')

    await page.getByTestId('coin-codes-tab-usages').click()
    await expect(page.getByTestId('coin-usages-list').locator('li')).toHaveCount(18)
    await page.screenshot({ path: path.join(OUT_DIR, 'coin-codes-usages.png') })

    await page.setViewportSize({ width: 390, height: 844 })
    await page.getByTestId('coin-codes-tab-codes').click()
    await page.waitForTimeout(600)
    await list.locator('li').first().locator('button').click()
    await expect(page.getByTestId('coin-code-detail')).toBeVisible()
    expect(await page.getByTestId('coin-code-detail').evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1)
    await page.waitForTimeout(400)
    await page.screenshot({ path: path.join(OUT_DIR, 'coin-codes-mobile-sheet.png') })
  })

  test('rewards: monthly distribution and modules', async ({ page }) => {
    test.setTimeout(180_000)
    await mockAdmin(page)
    await mockRewards(page)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/tr/admin/oduller?e2e=1')
    const monthly = page.getByTestId('rewards-monthly')
    await expect(page.getByTestId('rewards-preview-list').locator('li')).toHaveCount(12, { timeout: 30_000 })
    await page.screenshot({ path: path.join(OUT_DIR, 'rewards-fansub.png'), fullPage: true })

    // Dagitim sonucu soyleyen pencereden gecer.
    await page.getByTestId('rewards-run').click()
    await expect(page.getByTestId('admin-confirm-dialog')).toContainText('bildirim gider')
    await page.keyboard.press('Escape')

    // Bitmemis ay dagitilamaz.
    const now = new Date()
    await page.getByTestId('rewards-month').fill(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)
    await expect(page.getByTestId('rewards-month-open')).toBeVisible()
    await expect(page.getByTestId('rewards-run')).toBeDisabled()
    expect(await monthly.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1)

    for (const tab of ['reading_streak', 'user_tasks', 'fansub_tasks', 'events']) {
      await page.getByTestId(`rewards-tab-${tab}`).click()
      await page.waitForTimeout(500)
      await page.screenshot({ path: path.join(OUT_DIR, `rewards-${tab}.png`), fullPage: true })
    }
  })

  test('boost: perks, teams, state', async ({ page }) => {
    test.setTimeout(180_000)
    await mockAdmin(page)
    await mockBoost(page)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/tr/admin/takviye?e2e=1')
    await expect(page.getByTestId('boost-capabilities').locator('li')).toHaveCount(6, { timeout: 30_000 })
    await page.screenshot({ path: path.join(OUT_DIR, 'boost-capabilities.png'), fullPage: true })

    // Raising the level (fewer teams) goes through a window stating the result.
    await page.getByTestId('boost-capability-select-canUsePolls').click()
    await page.getByRole('option', { name: 'Seviye 3' }).click()
    await expect(page.getByTestId('admin-confirm-dialog')).toContainText('Seviyesi yetmeyen ekipler')
    await page.keyboard.press('Escape')

    await page.getByTestId('boost-tab-fansubs').click()
    await expect(page.getByTestId('boost-top-fansubs').locator('li')).toHaveCount(8)
    expect(await page.getByTestId('boost-top-fansubs').evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1)
    await page.screenshot({ path: path.join(OUT_DIR, 'boost-fansubs.png'), fullPage: true })

    // Sistemi kapatmak onay ister.
    await page.getByTestId('boost-tab-status').click()
    await page.getByTestId('boost-flag-boost.system').getByRole('switch').click()
    await expect(page.getByTestId('admin-confirm-dialog')).toContainText('takviye veremez')
    await page.keyboard.press('Escape')
    await page.screenshot({ path: path.join(OUT_DIR, 'boost-status.png'), fullPage: true })

    await page.setViewportSize({ width: 390, height: 844 })
    await page.getByTestId('boost-tab-capabilities').click()
    await page.waitForTimeout(400)
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1)
    await page.screenshot({ path: path.join(OUT_DIR, 'boost-mobile.png'), fullPage: true })
  })

  test('emoji and stickers: expressions, teams, level', async ({ page }) => {
    test.setTimeout(180_000)
    await mockAdmin(page)
    await mockSupporterAssets(page)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/tr/admin/emoji-cikartma?e2e=1')
    const latest = page.getByTestId('supporter-assets-latest')
    await expect(latest.locator('button')).toHaveCount(6, { timeout: 30_000 })
    await page.screenshot({ path: path.join(OUT_DIR, 'supporter-assets.png'), fullPage: true })

    // Uygunsuz ifade ayrinti penceresinden, sonucu soyleyen onayla kaldirilir.
    await latest.locator('button').first().click()
    await page.getByTestId('supporter-asset-archive').click()
    await expect(page.getByTestId('admin-confirm-dialog')).toContainText('arşivde tutulur')
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('admin-confirm-dialog')).toHaveCount(0)
    await page.mouse.click(8, 8)
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await page.getByTestId('supporter-assets-tab-fansubs').click()
    await expect(page.getByTestId('supporter-assets-fansubs').locator('li')).toHaveCount(3)
    expect(await page.getByTestId('supporter-assets-fansubs').evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1)
    await page.screenshot({ path: path.join(OUT_DIR, 'supporter-assets-fansubs.png'), fullPage: true })

    await page.getByTestId('supporter-assets-tab-settings').click()
    await expect(page.getByTestId('supporter-assets-quota')).toContainText('50')
    await page.screenshot({ path: path.join(OUT_DIR, 'supporter-assets-settings.png'), fullPage: true })
  })

  test('games: overview, puzzle and rule confirmations', async ({ page }) => {
    test.setTimeout(180_000)
    await mockAdmin(page)
    await mockGames(page)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/tr/admin/oyunlar?e2e=1')
    await expect(page.getByTestId('admin-games-strip')).toContainText('34', { timeout: 30_000 })
    await page.screenshot({ path: path.join(OUT_DIR, 'games-overview.png'), fullPage: true })

    // A record disabling a game goes through a confirm stating the result.
    await page.getByTestId('admin-games-tab-settings').click()
    await page.getByTestId('admin-games-toggle-runner').click()
    await page.getByTestId('admin-games-save').click()
    await expect(page.getByTestId('admin-confirm-dialog')).toContainText('Şu an kapalı')
    await page.keyboard.press('Escape')
    await page.screenshot({ path: path.join(OUT_DIR, 'games-settings.png'), fullPage: true })

    await page.getByTestId('admin-games-tab-puzzles').click()
    await expect(page.getByTestId('admin-games-puzzles')).toBeVisible()
    await page.screenshot({ path: path.join(OUT_DIR, 'games-puzzles.png'), fullPage: true })
  })

  test('announcements: announcement desk', async ({ page }) => {
    test.setTimeout(180_000)
    await mockAdmin(page)
    await mockAnnouncements(page)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/tr/admin/duyurular?e2e=1')
    const list = page.getByTestId('admin-announcements-list')
    const detail = page.getByTestId('admin-announcements-detail')
    await expect(list).toBeVisible({ timeout: 30_000 })
    await expect(detail).toBeVisible()
    // Sona eren yayin "Yayinda" sayilmaz.
    await expect(page.getByTestId('admin-announcements-view-live')).toContainText('2')
    await expect(page.getByTestId('admin-announcements-view-ended')).toContainText('9')
    await expect(page.getByTestId('admin-announcements-view-scheduled')).toContainText('1')
    await expect(page.getByTestId('admin-announcements-preview')).toBeVisible()
    await page.waitForTimeout(600)
    expect(await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)).toBeLessThanOrEqual(1)
    await page.screenshot({ path: path.join(OUT_DIR, 'announcements-desk.png') })

    // Published view: only those live right now.
    await page.getByTestId('admin-announcements-view-live').click()
    await expect(list.locator('li')).toHaveCount(2)

    // Cop kutusuna tasima onay penceresinden.
    await page.getByTestId('admin-announcements-more').click()
    await page.getByTestId('admin-announcements-delete').click()
    await expect(page.getByTestId('admin-announcements-delete-dialog')).toBeVisible()
    await page.waitForTimeout(300)
    await page.screenshot({ path: path.join(OUT_DIR, 'announcements-delete-dialog.png') })
    await page.keyboard.press('Escape')

    // Cop kutusu: geri alma.
    await page.getByTestId('admin-announcements-view-deleted').click()
    await expect(list.locator('li')).toHaveCount(1)
    await expect(page.getByTestId('admin-announcements-restore')).toBeVisible()

    // Editor: a warning window on unsaved changes (not a browser confirm box).
    await page.getByTestId('admin-announcements-new').click()
    await page.getByPlaceholder(/^Duyuru ba/).fill('Deneme')
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('announcement-editor-discard')).toBeVisible()
    await page.waitForTimeout(300)
    await page.screenshot({ path: path.join(OUT_DIR, 'announcements-editor-discard.png') })
    await page.getByRole('button', { name: 'Kaydetmeden kapat' }).click()
    await expect(page.getByTestId('announcement-editor-discard')).toHaveCount(0)

    // Mobil: ayrinti cekmecede, duzenle altta.
    await page.getByTestId('admin-announcements-view-all').click()
    await page.setViewportSize({ width: 390, height: 844 })
    await page.waitForTimeout(600)
    await page.getByTestId(`admin-announcements-row-${UUID(1001)}`).click()
    await expect(page.getByTestId('admin-announcements-edit')).toBeVisible()
    await page.waitForTimeout(400)
    await page.screenshot({ path: path.join(OUT_DIR, 'announcements-mobile-sheet.png') })
  })
})

test('admin panel in English: shell, dashboard and announcements get translated', async ({ page }) => {
  await mockAdmin(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/admin?e2e=1')
  await expect(page.getByRole('navigation', { name: 'Management sections' })).toBeVisible()
  await expect(page.getByTestId('dashboard-health-panel')).toContainText('Moderation completion')
  const text = await page.locator('body').innerText()
  expect(text).not.toContain('Yönetim paneli')
  expect(text).not.toContain('Bekleyen iş')
  await page.screenshot({ path: path.join(OUT_DIR, 'en-dashboard.png'), fullPage: false })
})

test('text translations: a missing text is entered and saved via admin RPC', async ({ page }) => {
  await mockAdmin(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  const rows = [
    { source_table: 'announcement', field: 'title', source_text: 'Kış etkinliği başladı', en_text: null, updated_at: null },
    { source_table: 'shop_product', field: 'title', source_text: 'Kış paketi', en_text: 'Winter bundle', updated_at: daysAgo(1) },
  ]
  let saved: unknown = null
  await page.route('**/rest/v1/rpc/admin_i18n_source_texts', (route) => route.fulfill(json(rows)))
  await page.route('**/rest/v1/rpc/admin_i18n_save_text', (route) => {
    saved = route.request().postDataJSON()
    return route.fulfill(json(null))
  })
  await page.goto('/tr/admin/metin-cevirileri?e2e=1')
  const row = page.getByTestId('admin-text-translation-row')
  await expect(row).toHaveCount(1, { timeout: 30_000 })
  await expect(row).toContainText('Kış etkinliği başladı')
  await row.getByRole('textbox').fill('Winter event started')
  await row.getByRole('button', { name: 'Kaydet' }).click()
  await expect.poll(() => saved).toEqual({ p_source_text: 'Kış etkinliği başladı', p_en_text: 'Winter event started' })
  await expect(page.getByTestId('admin-text-translation-row')).toHaveCount(0)
  await page.getByRole('tab', { name: /Tümü/ }).click()
  await expect(page.getByTestId('admin-text-translation-row')).toHaveCount(2)
})

test('settings: tabs, an invalid field stops saving, save bar', async ({ page }) => {
  await mockAdmin(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  const row = { id: 1, site_title: 'BSG Manga', site_description: 'd', contact_email: 'iletisim@example.com', maintenance_mode: false, registration_enabled: true, discord_invite_url: '', logo_url: '', store_home_config: {} }
  let writes = 0
  await page.route('**/rest/v1/site_settings*', (route) => {
    if (route.request().method() === 'GET') return route.fulfill(json(row))
    writes += 1
    return route.fulfill(json([row]))
  })
  await page.goto('/tr/admin/ayarlar?e2e=1')
  const email = page.locator('#settings-contact-email')
  await expect(email).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('admin-settings-savebar')).toHaveCount(0)
  await expect(page.locator('#settings-maintenance')).toHaveCount(0)
  await expect(page.getByTestId('admin-settings-ops-link')).toHaveAttribute('href', /\/admin\/operasyon/)
  await email.fill('gecersiz')
  await page.getByTestId('admin-settings-savebar').getByRole('button', { name: 'Kaydet' }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'e-posta' })).toBeVisible()
  expect(writes).toBe(0)
  await page.getByTestId('admin-settings-savebar').getByRole('button', { name: 'Vazgeç' }).click()
  await expect(page.getByTestId('admin-settings-savebar')).toHaveCount(0)
  await page.screenshot({ path: path.join(OUT_DIR, 'settings-general.png') })
  for (const tab of ['ana-sayfa', 'kesfet', 'listeler']) {
    await page.getByTestId(`admin-settings-tab-${tab}`).click()
    await expect(page).toHaveURL(new RegExp(`sekme=${tab}`))
    await page.screenshot({ path: path.join(OUT_DIR, `settings-${tab}.png`) })
  }
})

test('diagnostics: no crash on missing data, event desk and pagination', async ({ page }) => {
  await mockAdmin(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  // Once sekilsiz yanit: arayuz cokmemeli.
  await page.route('**/rest/v1/rpc/diagnostic_overview', (route) => route.fulfill(json({ collection_enabled: true })))
  await page.goto('/tr/admin/tanilama?e2e=1')
  await expect(page.getByTestId('admin-diagnostics-strip')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('admin-diagnostics-alerts')).toContainText('İnceleme bekleyen alarm yok')

  const recent = Array.from({ length: 30 }, (_, index) => ({ id: `e${index}`, user_id: UUID(index + 3000), username: index % 2 ? 'okur' : null, code: index % 3 ? 'service_error' : 'ui_error', route: `/kesfet/${index}`, created_at: daysAgo(index / 10), technical: { message: `hata ${index}` } }))
  await page.unroute('**/rest/v1/rpc/diagnostic_overview')
  await page.route('**/rest/v1/rpc/diagnostic_overview', (route) => route.fulfill(json({
    collection_enabled: true, screenshot_cleanup_at: daysAgo(1), cleanup_at: daysAgo(1), total: 30, accounts: 4, p75: 1200,
    metrics: [{ code: 'lcp', p50: 1800, p75: 2100, p95: 5200, samples: 120 }, { code: 'inp', p50: 120, p75: 320, p95: 900, samples: 90 }, { code: 'cls', p50: 0.01, p75: 0.3, p95: 0.5, samples: 80 }],
    alerts: [{ id: 'a1', kind: 'service_error', dimension: '/kesfet', samples: 24, value: 0.2, created_at: daysAgo(0.1), acknowledged_at: null }],
    groups: Array.from({ length: 16 }, (_, index) => ({ code: 'service_error', route: `/r${index}`, device: 'mobile', build: 'abc', count: 20 - index })),
    recent,
  })))
  await page.reload()
  await expect(page.getByTestId('admin-diagnostics-alerts')).toContainText('Servis hatası', { timeout: 30_000 })
  await page.screenshot({ path: path.join(OUT_DIR, 'diagnostics-alerts.png') })
  await page.getByTestId('admin-diagnostics-tab-events').click()
  await page.getByTestId('admin-diagnostics-events').getByRole('button', { name: /kesfet\/0$/ }).click()
  await expect(page.getByTestId('admin-diagnostics-detail')).toContainText('hata 0')
  await page.screenshot({ path: path.join(OUT_DIR, 'diagnostics-events.png') })
  await page.getByRole('button', { name: 'Sonraki sayfa' }).click()
  await expect(page.getByTestId('admin-diagnostics-events')).toContainText('/kesfet/12')
  await page.getByTestId('admin-diagnostics-tab-performance').click()
  await expect(page.getByTestId('admin-diagnostics-performance')).toContainText('Zayıf')
  await page.screenshot({ path: path.join(OUT_DIR, 'diagnostics-performance.png') })
  await page.getByTestId('admin-diagnostics-tab-groups').click()
  await expect(page.getByTestId('admin-diagnostics-groups')).toContainText('/r0')
  // Toplamayi kapatmak onay ister
  await page.locator('#admin-diagnostic-collection').click()
  await expect(page.getByRole('dialog')).toContainText('Tanılama toplamayı kapat')
  await page.screenshot({ path: path.join(OUT_DIR, 'diagnostics-confirm.png') })
})
