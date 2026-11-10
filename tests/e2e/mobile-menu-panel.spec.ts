import { expect, test, type Page } from '@playwright/test'

/**
 * Mobile menu panel.
 *
 * Previously this panel was the same as the desktop sidebar. What is pinned is that it now
 * does what the phone needs: IDENTITY first, grouped paths, and the panel
 * CLOSING at every transition (a drawer left open hides where you went).
 */

const MOBILE = { width: 390, height: 844 }
const USER_ID = 'menu-test-user'

async function stub(page: Page) {
  const json = (body: unknown) => ({
    status: 200, contentType: 'application/json', body: JSON.stringify(body),
  })
  await page.route('**/rest/v1/**', async (route) => { await route.fulfill(json([])) })
  await page.route('**/auth/v1/**', async (route) => { await route.fulfill(json({})) })
}

async function signIn(page: Page) {
  await page.addInitScript(({ userId }) => {
    window.__BSGMANGA_E2E__ = {
      mockAuthUser: {
        id: userId, authUserId: userId, username: 'demo',
        avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=yasin',
        role: 'user', isBanned: false, isActive: true, stones: 2480,
        ownedItems: { frames: ['default'], backgrounds: [], patterns: [], premium: [] },
        frameType: 'default',
        // The age gate (Layout) sends every session with no date to /dogum-tarihi.
        birthDate: '1998-04-12',
        onboardingCompletedAt: '2026-08-01T09:00:00.000Z',
        premiumExpiresAt: null,
      },
    }
  }, { userId: USER_ID })
}

async function openMenu(page: Page) {
  await expect(page.getByTestId('mobile-top-bar')).toBeVisible({ timeout: 20_000 })
  await page.getByTestId('mobile-top-bar').getByRole('button').first().click()
  await expect(page.getByTestId('mobile-menu-panel')).toBeVisible({ timeout: 10_000 })
}

/** Mocks the list_active_events RPC with one event + two tasks. */
async function stubEvent(page: Page, banner: string | null) {
  // Etkinlik blogu 'rewards.user_tasks' bayragina bagli; bayrak kapaliyken
  // list_active_events HIC cagrilmaz.
  await page.route('**/rest/v1/rpc/get_runtime_feature_flags', async (route) => {
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify([{ key: 'rewards.user_tasks', is_enabled: true }]),
    })
  })
  const base = {
    event_id: 'ev-1', event_slug: 'yaz-etkinligi', event_title: 'Yaz Etkinligi',
    event_description: 'Yaz boyu surer', event_theme: 'amber', event_banner: banner,
    event_structure: 'linear', event_sort_order: 1,
    event_ends_at: '2099-01-01T00:00:00.000Z',
    metric_key: 'read_chapter', target_value: 3, is_locked: false,
    unlock_requires_quest_id: null, coin_reward: 50, description: '',
  }
  await page.route('**/rest/v1/rpc/list_active_events', async (route) => {
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify([
        { ...base, quest_id: 'q1', slug: 'q1', title: 'Uc bolum oku', sort_order: 1,
          progress_value: 3, is_completed: true, is_claimed: false, is_claimable: true },
        { ...base, quest_id: 'q2', slug: 'q2', title: 'Yorum yaz', sort_order: 2,
          progress_value: 0, is_completed: false, is_claimed: false, is_claimable: false },
      ]),
    })
  })
}

test.describe('Mobile menu panel', () => {
  test.beforeEach(async ({ page }) => {
    // Guests are redirected from the root route to the WELCOME page; this file measures the shell/content
    // layout, not the funnel. The marker opens the real home page.
    await page.addInitScript(() => {
      window.localStorage.setItem('bsgmanga:guest-welcome-seen', '1')
    })
    await stub(page)
    await page.setViewportSize(MOBILE)
  })

  test('when signed in IDENTITY and balance are on top', async ({ page }) => {
    await signIn(page)
    await page.goto('/tr?e2e=1')
    await openMenu(page)

    // The sidebar is closed on the phone; the answer to "which account" is nowhere else.
    const identity = page.getByTestId('mobile-menu-identity')
    await expect(identity).toBeVisible()
    await expect(identity).toContainText('@yasin')
    await expect(identity).toContainText('2.480')
  })

  test('a SIGN-IN door instead of identity for guests', async ({ page }) => {
    await page.goto('/tr')
    await openMenu(page)
    // We show the job to do instead of an empty identity card.
    await expect(page.getByTestId('mobile-menu-identity')).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Giriş yap' })).toBeVisible()
  })

  test('gezinince panel KAPANIR', async ({ page }) => {
    await page.goto('/tr')
    await openMenu(page)
    await page.getByRole('link', { name: 'Listeler' }).click()

    /*
     * NOTE: what closes this path is the route-change effect in AppSidebar; the row's
     * own `onNavigate` only makes the closing IMMEDIATE. A mutation test
     * revealed this (the test still passed with onNavigate removed). The assertion is still
     * valid: navigating should close the panel. The path really tied to `onNavigate` is
     * in the NON-ROUTE action test below.
     */
    await expect(page.getByTestId('mobile-menu-panel')).toBeHidden()
    await expect(page).toHaveURL(/\/listeler/)
  })

  test('rota OLMAYAN eylemde de panel kapanir', async ({ page }) => {
    await signIn(page)
    await page.goto('/tr?e2e=1')
    await openMenu(page)

    /*
     * Tasks are not a ROUTE but a quick panel opened by a window event. Since the route does not
     * change, AppSidebar's auto-close effect does not run here;
     * closing depends only on the row's `onNavigate`.
     */
    await page.getByRole('button', { name: /Görevler/ }).click()
    await expect(page.getByTestId('mobile-menu-panel')).toBeHidden()
  })

  test('legal links are REACHABLE in the menu', async ({ page }) => {
    await page.goto('/tr')
    await openMenu(page)
    // Footer'in bag listesi mobilde gizli; gidecek yer burasi.
    await expect(page.getByRole('link', { name: 'DMCA Bildirimi' })).toBeVisible()
  })

  test('no BADGE prints with no data', async ({ page }) => {
    /*
     * `?e2e=1` is NOT USED: in that mode the schedule service falls to a static mock and
     * the "no data" state can never be produced. The badge loads independent of session,
     * so the guest path is the only one able to measure this assertion.
     *
     * The schedule badge is REAL: the number of chapters going public today. At zero the badge
     * must NOT render at all; showing "0" is as noisy as an empty badge.
     */
    await page.goto('/tr')
    await openMenu(page)

    const takvim = page.getByRole('link', { name: /Takvim/ })
    await expect(takvim).toBeVisible()
    await expect(takvim).not.toContainText(/Bugün/)
  })

  test('with chapters opening today the BADGE prints the number', async ({ page }) => {
    /*
     * The badge and the Schedule page read from the SAME source. Previously the badge
     * queried the `chapters` table directly and due to early access RLS it
     * always stayed 0 for signed-out users; the two surfaces gave different
     * answers. Pinned here: with a today record in the schedule source
     * the badge shows that number.
     */
    const bugun = new Date()
    bugun.setHours(9, 0, 0, 0)
    const satir = (mangaId: string, no: number) => ({
      chapter_id: `c-${mangaId}-${no}`, manga_id: mangaId, manga_title: 'Seri',
      manga_slug: 'seri', manga_cover_image_url: null, fansub_id: null,
      fansub_name: null, fansub_slug: null, chapter_number: no,
      chapter_title: null, publish_at: bugun.toISOString(), is_upcoming: false,
    })
    await page.route('**/rest/v1/rpc/list_public_release_schedule', async (route) => {
      await route.fulfill({
        status: 200, contentType: 'application/json',
        // The same chapter from two fansubs: the badge must count UNIQUE chapters, not rows.
        body: JSON.stringify([satir('m1', 1), satir('m1', 1), satir('m2', 7)]),
      })
    })

    await page.goto('/tr')
    await openMenu(page)
    await expect(page.getByRole('link', { name: /Takvim/ })).toContainText('2')
  })

  test('the bottom strip is FIXED: theme, settings and sign-out', async ({ page }) => {
    await signIn(page)
    await page.goto('/tr?e2e=1')
    await openMenu(page)

    /*
     * In the handoff these three are pinned at the bottom. Sign-out is a rare but critical action;
     * it should not be searched for at the end of a long list and stays put while the middle scrolls.
     */
    await expect(page.getByTestId('mobile-menu-theme')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Ayarlar' })).toBeVisible()
    await expect(page.getByTestId('mobile-menu-signout')).toBeVisible()
  })

  test('no ARROW on rows', async ({ page }) => {
    await page.goto('/tr')
    await openMenu(page)
    /*
     * The handoff has no arrow on navigation rows: every row in the panel already
     * goes somewhere, an arrow added a column without distinguishing anything.
     * The arrow is only on the identity card (that is a card, not a row).
     */
    // "Keşfet" appears twice (menu row + Nitro chip); pick a unique
    // row so the assertion measures what it means to.
    const satir = page.getByRole('link', { name: 'Listeler' })
    await expect(satir).toBeVisible()
    // One icon: the row's own icon. An added arrow would make it two.
    expect(await satir.locator('svg').count()).toBe(1)
  })

  test('BASLIK satiri: site logosu solda, kapatma sagda', async ({ page }) => {
    await page.goto('/tr')
    await openMenu(page)

    /*
     * The Sheet's default close button sat in the top RIGHT corner and overlapped the identity
     * card; also the panel had no site logo at all;
     * the user reported both. In the handoff they are on the SAME row: logo
     * left, 44px close on the right.
     */
    const panel = page.getByTestId('mobile-menu-panel')
    const logo = panel.locator('img[alt="BSG Manga"]')
    await expect(logo).toBeVisible()

    const kapat = page.getByTestId('mobile-menu-close')
    await expect(kapat).toBeVisible()

    const logoKutu = await logo.boundingBox()
    const kapatKutu = await kapat.boundingBox()
    const kimlikKutu = await page.getByRole('link', { name: 'Giriş yap' }).boundingBox()
    if (!logoKutu || !kapatKutu || !kimlikKutu) throw new Error('Baslik satiri olculemedi')

    // Ayni satir: logo solda, kapatma sagda.
    expect(kapatKutu.x).toBeGreaterThan(logoKutu.x)
    // Ve ikisi de kimlik/giris kartinin USTUNDE — uzerine binmiyor.
    expect(kapatKutu.y + kapatKutu.height).toBeLessThanOrEqual(kimlikKutu.y + 1)
    // Dokunma hedefi.
    expect(kapatKutu.width).toBeGreaterThanOrEqual(44)
    expect(kapatKutu.height).toBeGreaterThanOrEqual(44)

    await kapat.click()
    await expect(panel).toBeHidden()
  })

  test('the event prints as a BANNER', async ({ page }) => {
    await signIn(page)
    await stubEvent(page, '/covers/generated/fisilti-ormani.webp')
    await page.goto('/tr?e2e=1')
    await openMenu(page)

    /*
     * The user said "the menu has no event image". A plain navigation row for the event
     * does not stand out; the handoff has a card with a cover image.
     * Pinned: the IMAGE renders and the claimable reward count is read from
     * the card.
     */
    const kart = page.getByTestId('mobile-menu-event')
    await expect(kart).toBeVisible()
    await expect(kart.locator('img')).toHaveAttribute('src', /fisilti-ormani/)
    await expect(kart).toContainText('Yaz Etkinligi')
    await expect(kart).toContainText('1 ödül hazır')

    const kutu = await kart.boundingBox()
    if (!kutu) throw new Error('The event card could not be measured')
    // Banner height: this is how it reads as a card, not a row.
    expect(kutu.height).toBeGreaterThan(60)
  })

  test('with no image the event card STILL appears', async ({ page }) => {
    await signIn(page)
    await stubEvent(page, null)
    await page.goto('/tr?e2e=1')
    await openMenu(page)

    /*
     * The image is decoration, the event ITSELF is the information. If the card vanished entirely for an event with an empty
     * banner_url, the active event would be hidden.
     */
    const kart = page.getByTestId('mobile-menu-event')
    await expect(kart).toBeVisible()
    await expect(kart).toContainText('Yaz Etkinligi')
    await expect(kart.locator('img')).toHaveCount(0)
  })

  test('with no event the card does NOT print at all', async ({ page }) => {
    await signIn(page)
    await page.goto('/tr?e2e=1')
    await openMenu(page)
    // The "Aktif etkinlik" heading must not stay with an empty placeholder.
    await expect(page.getByTestId('mobile-menu-event')).toHaveCount(0)
    await expect(page.getByTestId('mobile-menu-panel')).not.toContainText('Aktif etkinlik')
  })
})
