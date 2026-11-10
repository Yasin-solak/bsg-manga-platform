import { expect, test, type Page } from '@playwright/test'

/**
 * Library.
 *
 * This was the user's complaint: tapping the home page "14 new chapters waiting for you"
 * strip opened /kesfet and those 14 chapters DID NOT SHOW THERE.
 * The strip now goes to the Library's "Waiting for You" tab.
 *
 * Tabs differ from the prototype because its "Saved" and
 * "Completed" tabs have no data behind them and "Reading" and "History"
 * turned out the same (reading_history holds one row per manga).
 */

const MOBILE = { width: 390, height: 844 }
const USER_ID = 'kutuphane-test-user'

const gecmisGun = (gunOnce: number) =>
  new Date(Date.now() - gunOnce * 24 * 60 * 60 * 1000).toISOString()

async function stub(page: Page) {
  const json = (body: unknown) => ({
    status: 200, contentType: 'application/json', body: JSON.stringify(body),
  })

  // The general catch-all FIRST; specific routes must register later so
  // they take priority in Playwright.
  await page.route('**/rest/v1/**', async (route) => { await route.fulfill(json([])) })
  await page.route('**/auth/v1/**', async (route) => { await route.fulfill(json({})) })

  await page.route('**/rest/v1/manga_follows*', async (route) => {
    await route.fulfill(json([
      { manga_id: 'm1', created_at: gecmisGun(20) },
      { manga_id: 'm2', created_at: gecmisGun(15) },
      { manga_id: 'm3', created_at: gecmisGun(10) },
    ]))
  })

  await page.route('**/rest/v1/reading_history*', async (route) => {
    await route.fulfill(json([
      // m2: follows and has read. m4: has read but does not follow.
      { manga_id: 'm2', chapter_number: 3, read_at: gecmisGun(1) },
      { manga_id: 'm4', chapter_number: 7, read_at: gecmisGun(4) },
    ]))
  })

  await page.route('**/rest/v1/chapters*', async (route) => {
    await route.fulfill(json([
      // m1: two chapters after following, never read -> 2 new
      { manga_id: 'm1', chapter_number: 1, publish_at: gecmisGun(5) },
      { manga_id: 'm1', chapter_number: 2, publish_at: gecmisGun(2) },
      // m2: read up to 3, 4 came out -> 1 new
      { manga_id: 'm2', chapter_number: 3, publish_at: gecmisGun(6) },
      { manga_id: 'm2', chapter_number: 4, publish_at: gecmisGun(3) },
      // m3: only a chapter from BEFORE following -> 0 new
      { manga_id: 'm3', chapter_number: 1, publish_at: gecmisGun(30) },
    ]))
  })

  await page.route('**/rest/v1/mangas*', async (route) => {
    await route.fulfill(json([
      { id: 'm1', title: 'Fisilti Ormani', slug: 'fisilti', cover_image_url: '' },
      { id: 'm2', title: 'Karanlik Devriye', slug: 'karanlik', cover_image_url: '' },
      { id: 'm3', title: 'Yedinci Kat', slug: 'yedinci', cover_image_url: '' },
      { id: 'm4', title: 'Kirik Tac', slug: 'kirik', cover_image_url: '' },
    ]))
  })
}

async function signIn(page: Page) {
  await page.addInitScript(({ userId }) => {
    window.__BSGMANGA_E2E__ = {
      mockAuthUser: {
        id: userId, authUserId: userId, username: 'demo',
        avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=yasin',
        role: 'user', isBanned: false, isActive: true, stones: 100,
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

test.describe('Kutuphane', () => {
  test.beforeEach(async ({ page }) => {
    await stub(page)
    await page.setViewportSize(MOBILE)
  })

  test('default tab is WAITING FOR YOU, only those with unread', async ({ page }) => {
    await signIn(page)
    await page.goto('/tr/kutuphane?e2e=1')

    await expect(page.getByTestId('library-page')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('library-tab-bekleyen')).toHaveAttribute('aria-selected', 'true')

    /*
     * m3 IS FOLLOWED but has nothing unread: it must not show on this tab.
     * Printing the follow list as is would make the tab a copy of
     * "Following".
     */
    const liste = page.getByTestId('library-list')
    await expect(liste).toContainText('Fisilti Ormani')
    await expect(liste).toContainText('Karanlik Devriye')
    await expect(liste).not.toContainText('Yedinci Kat')
  })

  test('unread count prints per series', async ({ page }) => {
    await signIn(page)
    await page.goto('/tr/kutuphane?e2e=1')
    await expect(page.getByTestId('library-page')).toBeVisible({ timeout: 20_000 })

    /*
     * The home strip only showed the TOTAL; the user's question
     * was "in which series". The rule comes from src/lib/unreadChapters.ts:
     * chapters published after following AND past the last read.
     */
    const satirlar = page.getByTestId('library-row')
    await expect(satirlar.filter({ hasText: 'Fisilti Ormani' })).toContainText('2 yeni bölüm')
    // m2 is read up to 3, only 4 remains.
    await expect(satirlar.filter({ hasText: 'Karanlik Devriye' })).toContainText('1 yeni bölüm')
    await expect(satirlar.filter({ hasText: 'Karanlik Devriye' })).toContainText("Bölüm 3'desin")
  })

  test('the FOLLOWING tab also shows those with nothing unread', async ({ page }) => {
    await signIn(page)
    await page.goto('/tr/kutuphane?e2e=1')
    await expect(page.getByTestId('library-page')).toBeVisible({ timeout: 20_000 })

    await page.getByTestId('library-tab-takip').click()
    const liste = page.getByTestId('library-list')
    await expect(liste).toContainText('Yedinci Kat')
    // Takip edilmeyen, yalnizca okunan seri buraya girmemeli.
    await expect(liste).not.toContainText('Kirik Tac')
  })

  test('READ also shows those not followed', async ({ page }) => {
    await signIn(page)
    await page.goto('/tr/kutuphane?e2e=1')
    await expect(page.getByTestId('library-page')).toBeVisible({ timeout: 20_000 })

    await page.getByTestId('library-tab-okunan').click()
    const liste = page.getByTestId('library-list')
    /*
     * The library is a UNION of two tables: a series you read without following is also
     * in your library. Showing only followed ones would hide part of the reading
     * history.
     */
    await expect(liste).toContainText('Kirik Tac')
    await expect(liste).toContainText("Bölüm 7'desin")
    // A followed series is marked with a badge here too.
    await expect(
      page.getByTestId('library-row').filter({ hasText: 'Karanlik Devriye' }),
    ).toContainText('Takipte')
  })

  test('the tab is kept IN THE ADDRESS', async ({ page }) => {
    await signIn(page)
    // The home strip goes directly to this address; the tab must come from the URL.
    await page.goto('/tr/kutuphane?e2e=1&sekme=okunan')
    await expect(page.getByTestId('library-page')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('library-tab-okunan')).toHaveAttribute('aria-selected', 'true')
  })

  test('a guest sees a SIGN-IN door, not an empty list', async ({ page }) => {
    await page.goto('/tr/kutuphane')
    // Showing an empty library would equal saying "you follow nothing"
    // and would be wrong.
    const bos = page.getByTestId('library-empty')
    await expect(bos).toBeVisible({ timeout: 20_000 })
    await expect(bos.getByRole('link', { name: 'Giriş yap' })).toBeVisible()
    await expect(page.getByTestId('library-list')).toHaveCount(0)
  })

  test('tabs FIT 390px, the third does not stay off screen', async ({ page }) => {
    await signIn(page)
    await page.goto('/tr/kutuphane?e2e=1')
    await expect(page.getByTestId('library-page')).toBeVisible({ timeout: 20_000 })

    /*
     * In the first version labels were long ("Seni Bekleyenler / Takip Ettiklerim /
     * Okuduklarım") and the third tab stayed off screen; it did not even look like
     * it EXISTED. Horizontal scroll is still possible but all three tabs should
     * be visible at first glance.
     */
    const son = await page.getByTestId('library-tab-okunan').boundingBox()
    if (!son) throw new Error('The third tab could not be measured')
    expect(son.x + son.width).toBeLessThanOrEqual(MOBILE.width)
  })

  test('if the button promises a CHAPTER it goes to that chapter', async ({ page }) => {
    await signIn(page)
    await page.goto('/tr/kutuphane?e2e=1')
    await expect(page.getByTestId('library-page')).toBeVisible({ timeout: 20_000 })

    /*
     * m2 is read up to 3, 4 is waiting. If the button says "Bölüm 4" it must go to 4,
     * not the series page; otherwise we make the user search again for the
     * promised chapter.
     */
    const dugme = page
      .getByTestId('library-row')
      .filter({ hasText: 'Karanlik Devriye' })
      .getByRole('link', { name: 'Bölüm 4' })
    await expect(dugme).toBeVisible()
    await expect(dugme).toHaveAttribute('href', /\/oku\//)
    await expect(dugme).not.toHaveAttribute('href', /^\/manga\/[^/]+$/)
  })

  test('the tab strip and list are split by a SEPARATOR LINE', async ({ page }) => {
    await signIn(page)
    await page.goto('/tr/kutuphane?e2e=1')
    await expect(page.getByTestId('library-page')).toBeVisible({ timeout: 20_000 })

    /*
     * Without a line tabs looked like part of the list; which region they
     * controlled was unclear. The line uses the same `border` token as everywhere in the app
     * (top bar, card, Separator); inventing a special color here would set the page
     * apart from the rest.
     */
    const olcum = await page.evaluate(() => {
      const cizgi = document.querySelector('[data-testid="library-divider"]') as HTMLElement | null
      const sekmeler = document.querySelector('[role="tablist"]') as HTMLElement | null
      const liste = document.querySelector('[data-testid="library-list"]') as HTMLElement | null
      if (!cizgi || !sekmeler || !liste) return null
      return {
        kalinlik: getComputedStyle(cizgi).borderTopWidth,
        cizgiUst: Math.round(cizgi.getBoundingClientRect().top),
        sekmeAlt: Math.round(sekmeler.getBoundingClientRect().bottom),
        listeUst: Math.round(liste.getBoundingClientRect().top),
      }
    })
    expect(olcum).not.toBeNull()
    expect(olcum!.kalinlik).toBe('1px')
    // The line is EXACTLY BETWEEN: after the tabs, before the list.
    expect(olcum!.cizgiUst).toBeGreaterThanOrEqual(olcum!.sekmeAlt)
    expect(olcum!.cizgiUst).toBeLessThanOrEqual(olcum!.listeUst)
  })
})
