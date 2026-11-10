import { expect, test, type Page } from '@playwright/test'

/**
 * The home page's mobile top block: greeting + active event card.
 *
 * What is pinned is that both are tied to DATA. An empty greeting or a
 * "coming soon event" placeholder would show an empty promise at every open;
 * saying "good evening, @nobody" to a guest is meaningless too.
 */

const MOBILE = { width: 390, height: 844 }
const USER_ID = 'home-mobile-user'

async function stubNetwork(page: Page) {
  const json = (body: unknown) => ({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  })
  await page.route('**/rest/v1/**', async (route) => { await route.fulfill(json([])) })
  await page.route('**/auth/v1/**', async (route) => { await route.fulfill(json({})) })
}

async function signIn(page: Page) {
  await page.addInitScript(({ userId }) => {
    window.__BSGMANGA_E2E__ = {
      mockAuthUser: {
        id: userId,
        authUserId: userId,
        username: 'demo',
        avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=yasin',
        role: 'user',
        isBanned: false,
        isActive: true,
        stones: 2480,
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

/** An event ending in the future, with one of three tasks complete. */
async function stubEvent(page: Page, endsInHours: number) {
  const endsAt = new Date(Date.now() + endsInHours * 3600_000).toISOString()
  await page.route('**/rest/v1/rpc/list_active_events', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([0, 1, 2].map((i) => ({
        quest_id: `q${i}`,
        slug: `q${i}`,
        title: `Gorev ${i}`,
        description: '',
        metric_key: 'read',
        target_value: 5,
        progress_value: i === 0 ? 5 : 0,
        is_completed: i === 0,
        is_claimed: false,
        is_claimable: i === 0,
        is_locked: false,
        coin_reward: 50,
        sort_order: i,
        unlock_requires_quest_id: null,
        event_id: 'e1',
        event_slug: 'yaz-festivali',
        event_title: 'Yaz Festivali',
        event_description: '',
        event_theme: 'summer',
        event_banner: null,
        event_structure: 'linear',
        event_sort_order: 1,
        event_ends_at: endsAt,
      }))),
    })
  })
}

test.describe('Home mobile top block', () => {
  test.beforeEach(async ({ page }) => {
    // Guests are redirected from the root route to the WELCOME page; this file measures the shell/content
    // layout, not the funnel. The marker opens the real home page.
    await page.addInitScript(() => {
      window.localStorage.setItem('bsgmanga:guest-welcome-seen', '1')
    })
    await stubNetwork(page)
    await page.setViewportSize(MOBILE)
  })

  test('NO greeting for guests', async ({ page }) => {
    await page.goto('/tr')
    await expect(page.getByTestId('mobile-tab-bar')).toBeVisible({ timeout: 20_000 })
    // "Iyi aksamlar, @kimse" anlamsiz olurdu.
    await expect(page.getByTestId('home-mobile-greeting')).toHaveCount(0)
  })

  test('greeting shows when signed in', async ({ page }) => {
    await signIn(page)
    await page.goto('/tr?e2e=1')
    const greeting = page.getByTestId('home-mobile-greeting')
    await expect(greeting).toBeVisible({ timeout: 20_000 })
    await expect(greeting).toContainText('@yasin')

    /*
     * The Coin chip is ABSENT ON PURPOSE: the handoff greeting line has only "Şans".
     * The balance already sits in the menu and shop; putting a third number on the home page's
     * first line moved it away from "who you are".
     */
    await expect(greeting.getByRole('link', { name: /Şans/ })).toBeVisible()
    await expect(greeting.getByRole('link', { name: /coin/i })).toHaveCount(0)
  })

  test('no event means no card', async ({ page }) => {
    await signIn(page)
    await page.goto('/tr?e2e=1')
    await expect(page.getByTestId('home-mobile-greeting')).toBeVisible({ timeout: 20_000 })
    // An empty "coming soon event" card would be an empty promise at every open.
    await expect(page.getByTestId('home-event-card')).toHaveCount(0)
  })

  test('an active event shows time left and progress', async ({ page }) => {
    await signIn(page)
    await stubEvent(page, 54)
    await page.goto('/tr?e2e=1')

    const card = page.getByTestId('home-event-card')
    await expect(card).toBeVisible({ timeout: 20_000 })
    await expect(card).toContainText('Yaz Festivali')
    /*
     * The day part is asserted, the minute is NOT: an event set for 54 hours later
     * shows "2g 05:59" because of a few seconds passing while the test runs.
     * Pinning to the minute would measure the test's run time, not the
     * behavior.
     */
    await expect(card).toContainText(/2g \d\d:\d\d kaldı/)
    // One of three tasks done -> 33%.
    await expect(card).toContainText('1/3 görev tamamlandı')
    await expect(card).toContainText('%33')
  })

  test('an expired event does not show as ACTIVE', async ({ page }) => {
    await signIn(page)
    await stubEvent(page, -3)
    await page.goto('/tr?e2e=1')
    await expect(page.getByTestId('home-mobile-greeting')).toBeVisible({ timeout: 20_000 })
    // Keeping a past event on the home page would be wrong information.
    await expect(page.getByTestId('home-event-card')).toHaveCount(0)
  })
})
