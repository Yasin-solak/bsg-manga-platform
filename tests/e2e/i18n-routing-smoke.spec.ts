import { expect, test } from '@playwright/test'

/*
 * Multi-language addresses (2026-11-03): on an English page links stay unprefixed,
 * setSearchParams does not drop the prefix, NavLink activation is right, hreflang and the language
 * picker work. Turkish addresses do not change.
 */

test.use(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL, video: 'off' } : {})

const json = (body: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })

test.beforeEach(async ({ page }) => {
  await page.route('**/rest/v1/**', (route) => route.fulfill(json([])))
  await page.route('**/auth/v1/**', (route) => route.fulfill(json({})))
})

test('english address: lang, translated links, hreflang and language picker', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/explore')
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')

  // The route tree sees the canonical path: the Explore page opens at the English address.
  await expect(page).toHaveURL(/\/explore$/)
  const nav = page.getByRole('navigation', { name: 'Main navigation' })
  await expect(nav.getByRole('link', { name: 'Explore' })).toHaveAttribute('href', '/explore')
  await expect(nav.getByRole('link', { name: 'Explore' })).toHaveAttribute('aria-current', 'page')
  await expect(nav.getByRole('link', { name: 'My library' })).toHaveAttribute('href', '/library')

  // hreflang: both languages and x-default.
  await expect(page.locator('link[rel="alternate"][hreflang="tr"]')).toHaveAttribute('href', /\/tr\/kesfet$/)
  await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveAttribute('href', /\/explore$/)
  await expect(page.locator('link[rel="alternate"][hreflang="x-default"]')).toHaveAttribute('href', /\/explore$/)

  // Internal navigation stays in English.
  await nav.getByRole('link', { name: 'Lists' }).click()
  await expect(page).toHaveURL(/\/lists$/)

  // The language picker goes to the Turkish version of the same page.
  await page.locator('[data-testid="locale-switch"]:visible').first().click()
  await expect(page).toHaveURL(/\/tr\/listeler$/)
  await expect(page.locator('html')).toHaveAttribute('lang', 'tr')
  await expect(page.getByRole('navigation', { name: 'Ana gezinme' }).getByRole('link', { name: 'Listeler' })).toHaveAttribute('href', '/tr/listeler')
})

test('setSearchParams keeps the prefix on an english address', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/admin/magaza?e2e=1&sekme=products')
  await expect(page).toHaveURL(/\/admin\/magaza\?/, { timeout: 30_000 })
  await page.getByTestId('admin-shop-tab-orders').click()
  await expect(page).toHaveURL(/\/admin\/magaza\?.*sekme=orders/)
})

test('english home: section headings get translated, Turkish does not change', async ({ page }) => {
  // The welcome screen takes visitors from the home page to /giris; it is skipped to see the home page.
  await page.addInitScript(() => window.localStorage.setItem('bsgmanga:guest-welcome-seen', '1'))
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expect(page.getByRole('heading', { name: 'TRENDING SERIES' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'NEW CHAPTERS' })).toBeVisible()
  await expect(page.getByText('TREND OLAN SERİLER')).toHaveCount(0)

  await page.goto('/tr')
  await expect(page.getByRole('heading', { name: 'TREND OLAN SERİLER' })).toBeVisible()
  await expect(page.getByText('TRENDING SERIES')).toHaveCount(0)
})

test('english sign-in: welcome and form get translated, policy links stay English', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/login?mod=karsilama')
  await expect(page.getByTestId('auth-welcome')).toContainText('The series you love')
  await page.getByTestId('auth-welcome-login').click()
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Terms of Use' })).toHaveAttribute('href', /^\/terms/)
  await expect(page.getByText('Hesabın yok mu?')).toHaveCount(0)
})

test('english explore: headings and filters get translated', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/explore')
  await expect(page.getByRole('heading', { name: "Today's mood" }).or(page.getByText("Today's mood")).first()).toBeVisible()
  await expect(page.getByPlaceholder('Search series, translators or genres...')).toBeVisible()
  await expect(page.getByText('Bugün havam')).toHaveCount(0)
})

test('english series page: the load error screen gets translated', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/manga/olmayan-seri')
  await expect(page.getByRole('button', { name: 'Back to home' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Ana Sayfaya Dön' })).toHaveCount(0)
})

test('english shell: search, sign-in button and page title', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/explore')
  await expect(page).toHaveTitle('Explore | BSG Manga')
  await expect(page.getByRole('link', { name: 'Sign in' }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Open search' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Giriş Yap' })).toHaveCount(0)

  await page.goto('/tr/kesfet')
  await expect(page).toHaveTitle('Kesfet | BSG Manga')
})

test('english library, fansubs and schedule headings', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/library')
  await expect(page.getByRole('heading', { name: 'Library' }).first()).toBeVisible()
  await page.goto('/fansubs')
  await expect(page.getByRole('heading', { name: 'Fansubs' }).first()).toBeVisible()
  await expect(page.getByText('Trending Fansubs').first()).toBeVisible()
  await page.goto('/release-schedule')
  await expect(page.getByLabel('Schedule filter')).toBeVisible()
  await expect(page.getByText('Takip ettiğim ekipler')).toHaveCount(0)
})

test('english policy: text gets translated and the binding text note shows', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/terms')
  await expect(page.getByRole('heading', { name: 'Terms of Use' }).first()).toBeVisible()
  await expect(page.getByTestId('policy-binding-note')).toBeVisible()
  await page.goto('/tr/kullanim-sartlari')
  await expect(page.getByTestId('policy-binding-note')).toHaveCount(0)
})

test('moving from turkish to english loads the dictionary and translates text', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/tr/kesfet')
  await expect(page.getByPlaceholder('Seri, çevirmen veya tür ara...')).toBeVisible()
  await page.locator('[data-testid="locale-switch"]:visible').first().click()
  await expect(page).toHaveURL(/\/explore$/)
  await expect(page.getByPlaceholder('Search series, translators or genres...')).toBeVisible()
})

test('panelden girilen ingilizce metin sozlugun onune gecer', async ({ page }) => {
  await page.route('**/rest/v1/i18n_text_overrides*', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([{ source_text: 'Keşfet', en_text: 'Discover' }]),
  }))
  await page.goto('/explore?e2e=1')
  await expect(page.getByRole('heading', { name: 'Discover', exact: true }).first()).toBeVisible({ timeout: 30_000 })
})

for (const [path, label] of [['/tr', 'Kullanıcı menüsü'], ['/', 'User menu']] as const) {
  test(`sidebar account chip is full width: ${path}`, async ({ page }) => {
    await page.addInitScript(() => {
      ;(window as unknown as { __BSGMANGA_E2E__: unknown }).__BSGMANGA_E2E__ = { mockAuthUser: { id: 'a', authUserId: 'a', username: 'site_owner', avatar: '', role: 'user', isBanned: false, isActive: true, stones: 10, ownedItems: { frames: ['default'], backgrounds: [], patterns: [], premium: [] }, frameType: 'default', birthDate: '1998-04-12', onboardingCompletedAt: '2026-08-01T09:00:00.000Z', premiumExpiresAt: null } }
    })
    await page.route('**/rest/v1/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))
    await page.route('**/auth/v1/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }))
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(`${path}?e2e=1`)
    const chip = page.locator('aside').getByRole('button', { name: label })
    await expect(chip).toContainText('site_owner', { timeout: 30_000 })
    const box = await chip.boundingBox()
    expect(box?.width ?? 0).toBeGreaterThan(140)
  })
}

test('account menu is fully English in English', async ({ page }) => {
  await page.addInitScript(() => {
    ;(window as unknown as { __BSGMANGA_E2E__: unknown }).__BSGMANGA_E2E__ = { mockAuthUser: { id: 'a', authUserId: 'a', username: 'site_owner', avatar: '', role: 'user', isBanned: false, isActive: true, stones: 10, ownedItems: { frames: ['default'], backgrounds: [], patterns: [], premium: [] }, frameType: 'default', birthDate: '1998-04-12', onboardingCompletedAt: '2026-08-01T09:00:00.000Z', premiumExpiresAt: null } }
  })
  await page.route('**/rest/v1/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))
  await page.route('**/auth/v1/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }))
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/?e2e=1')
  await page.locator('aside').getByRole('button', { name: 'User menu' }).click({ timeout: 30_000 })
  const menu = page.getByRole('menu')
  await expect(menu).toContainText('My Profile')
  await expect(menu).toContainText('Inventory')
  await expect(menu).toContainText('Balance')
  await expect(menu).toContainText('10 coins')
  await expect(menu).not.toContainText(/Profilim|Envanter|Bakiye|gems/)
})

test('old addresses go to their new place, search is kept', async ({ page }) => {
  await page.goto('/en/explore?q=a')
  await expect(page).toHaveURL(/\/explore\?q=a$/)
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await page.goto('/kesfet?q=a')
  await expect(page).toHaveURL(/\/tr\/kesfet\?q=a$/)
  await expect(page.locator('html')).toHaveAttribute('lang', 'tr')
})
