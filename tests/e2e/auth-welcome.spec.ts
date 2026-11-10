import { expect, test, type Page } from '@playwright/test'

/**
 * Welcome: the first screen of the entry funnel (prototype screen 1).
 *
 * LOCATION: NOT the home page, but the sign-in state of `/giris`. In the prototype welcome
 * stands like the app's opening screen; on the web turning the home page into a sign-in wall
 * devalues prerendered public routes and the sitemap,
 * and cuts visitors off from the catalog. The prototype's ORDER is kept.
 */

const MOBILE = { width: 360, height: 800 }

async function stub(page: Page, opts: { providers?: string[] } = {}) {
  const json = (body: unknown) => ({
    status: 200, contentType: 'application/json', body: JSON.stringify(body),
  })
  await page.route('**/rest/v1/**', async (route) => { await route.fulfill(json([])) })
  await page.route('**/auth/v1/**', async (route) => { await route.fulfill(json({})) })
  await page.route('**/rest/v1/rpc/get_runtime_feature_flags', async (route) => {
    await route.fulfill(json(
      (opts.providers || []).map((key) => ({ key, is_enabled: true })),
    ))
  })
}

test.describe('Karsilama', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(MOBILE)
  })

  test('a VISITOR opens the site with WELCOME', async ({ page }) => {
    await stub(page)
    /*
     * Product decision: a signed-out visitor meets welcome, not the home page.
     * The redirect is made only at the ROOT ROUTE.
     */
    await page.goto('/tr')

    await expect(page).toHaveURL(/\/giris/)
    const karsilama = page.getByTestId('auth-welcome')
    await expect(karsilama).toBeVisible({ timeout: 20_000 })
    await expect(karsilama).toContainText('Sevdiğin seriler')
    await expect(page.locator('#auth-email')).toHaveCount(0)
  })

  test('DERIN BAGLANTI karsilamaya cevrilmez', async ({ page }) => {
    await stub(page)
    /*
     * Turning a shared series address or explore into welcome would drop every
     * shared link onto a sign-in wall and devalue the prerendered public
     * routes.
     */
    await page.goto('/tr/kesfet')
    await expect(page).not.toHaveURL(/\/giris/)
    await expect(page.getByTestId('auth-welcome')).toHaveCount(0)
  })

  test('an in-app SIGN-IN link opens the FORM directly', async ({ page }) => {
    await stub(page)
    /*
     * Passing someone who said "Giriş Yap" through a promo screen first is an extra
     * tap; about 8 links inside the app go to /giris.
     */
    await page.goto('/tr/giris')
    await expect(page.getByRole('heading', { name: 'Giriş Yap' })).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('auth-welcome')).toHaveCount(0)
  })

  test('BROWSE FOR NOW leaves them in the catalog and no LOOP forms', async ({ page }) => {
    await stub(page)
    await page.goto('/tr')
    await expect(page.getByTestId('auth-welcome')).toBeVisible({ timeout: 20_000 })

    await page.getByTestId('auth-welcome-guest').click()
    await expect(page).toHaveURL(/\/$/)
    /*
     * Without the marker the home page would throw the visitor back to welcome,
     * creating an endless loop.
     */
    await expect(page.getByTestId('auth-welcome')).toHaveCount(0)
    await page.goto('/tr')
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByTestId('auth-welcome')).toHaveCount(0)
  })

  test('an unconfigured provider button does NOT render at all', async ({ page }) => {
    await stub(page, { providers: [] })
    await page.goto('/tr/giris?mod=karsilama')
    await expect(page.getByTestId('auth-welcome')).toBeVisible({ timeout: 20_000 })

    /*
     * Provider setup is not a code job. Rendering a button before setup meant a button that
     * does nothing when tapped; the user looks for the fault in themselves.
     */
    await expect(page.getByTestId('auth-welcome-oauth-google')).toHaveCount(0)
    await expect(page.getByTestId('auth-welcome-oauth-discord')).toHaveCount(0)
    // With no provider email becomes the MAIN path.
    await expect(page.getByTestId('auth-welcome-signup')).toBeVisible()
  })

  test('a configured provider button RENDERS', async ({ page }) => {
    await stub(page, { providers: ['auth.oauth_google', 'auth.oauth_discord'] })
    await page.goto('/tr/giris?mod=karsilama')
    await expect(page.getByTestId('auth-welcome')).toBeVisible({ timeout: 20_000 })

    await expect(page.getByTestId('auth-welcome-oauth-google')).toBeVisible()
    await expect(page.getByTestId('auth-welcome-oauth-discord')).toBeVisible()
    // Apple YOK: urun karari, yerine Discord.
    await expect(page.getByTestId('auth-welcome-oauth-apple')).toHaveCount(0)
  })

  test('signup and sign-in doors go to the form, with a way back', async ({ page }) => {
    await stub(page)
    await page.goto('/tr/giris?mod=karsilama')
    await expect(page.getByTestId('auth-welcome')).toBeVisible({ timeout: 20_000 })

    await page.getByTestId('auth-welcome-signup').click()
    await expect(page.getByRole('heading', { name: 'Aramıza katıl' })).toBeVisible()

    await page.getByTestId('auth-back-to-welcome').click()
    await expect(page.getByTestId('auth-welcome')).toBeVisible()

    await page.getByTestId('auth-welcome-login').click()
    await expect(page.getByRole('heading', { name: 'Giriş Yap' })).toBeVisible()
  })

  test('adres satirindan dogrudan forma girilebilir', async ({ page }) => {
    await stub(page)
    await page.goto('/tr/giris?mod=kayit')
    await expect(page.getByRole('heading', { name: 'Aramıza katıl' })).toBeVisible({ timeout: 20_000 })
  })

  test('if the flag cannot be read the provider does NOT SHOW', async ({ page }) => {
    const json = (body: unknown) => ({
      status: 200, contentType: 'application/json', body: JSON.stringify(body),
    })
    await page.route('**/rest/v1/**', async (route) => { await route.fulfill(json([])) })
    await page.route('**/auth/v1/**', async (route) => { await route.fulfill(json({})) })
    // Bayrak sorgusu DUSUYOR: hangi saglayicinin kurulu oldugu bilinmiyor.
    await page.route('**/rest/v1/rpc/get_runtime_feature_flags', async (route) => {
      await route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"boom"}' })
    })

    await page.goto('/tr/giris?mod=karsilama')
    await expect(page.getByTestId('auth-welcome')).toBeVisible({ timeout: 20_000 })

    /*
     * Bilinmiyorken GOSTERMEK, kurulu olmayan saglayicinin dugmesini basma
     * riskidir: dokunulur, hicbir sey olmaz. Bilinmiyorsa gosterme.
     */
    await expect(page.getByTestId('auth-welcome-oauth-google')).toHaveCount(0)
    await expect(page.getByTestId('auth-welcome-oauth-discord')).toHaveCount(0)
    await expect(page.getByTestId('auth-welcome-signup')).toBeVisible()
  })

  test('the home page preloads IN THE BACKGROUND', async ({ page }) => {
    await stub(page)

    const homeChunks: string[] = []
    page.on('request', (request) => {
      const url = request.url()
      if (/HomePage/i.test(url)) homeChunks.push(url)
    })

    await page.goto('/tr')
    await expect(page.getByTestId('auth-welcome')).toBeVisible({ timeout: 20_000 })

    /*
     * Both paths out of welcome go to the home page and the home page is
     * the app's heaviest screen. Downloading the bundle in the idle time while the user reads welcome
     * shortens the next transition.
     *
     * Preloading is done when IDLE: racing this screen's own work
     * would open welcome late and lose instead of gain,
     * hence the wait.
     */
    await expect.poll(() => homeChunks.length, { timeout: 15_000 }).toBeGreaterThan(0)
  })
})
